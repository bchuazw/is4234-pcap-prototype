/*
 * PCAP prototype: Payment desk (M2 Consequence Engine, M3 Authority Gate, M1 register checks).
 * Maker form with live pre-check, checker queue, approver blind re-key and consequence screen,
 * Operational Risk hard-stop queue.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP;
  var E = PCAP.engine, U = PCAP.util, store = PCAP.store, DATA = PCAP.data;
  var views = PCAP.views = PCAP.views || {};

  var FIELD_LABEL = { LENDERS: 'Lenders', WASH: 'Wash 9910' };
  var revealPerf = {};
  var oprPerf = {};
  var flash = null;

  function st() { return store.st(); }
  function ui() {
    var s = st();
    s.ui = s.ui || {};
    s.ui.deskSelected = s.ui.deskSelected || {};
    return s.ui;
  }
  function plain(n) { return E.fmtUSD(n).replace(/^USD /, ''); }
  function lenders() { return { FRONT: 'LENDERS', FUND: 'LENDERS', PRINCIPAL: 'LENDERS' }; }
  function washAll() { return { FRONT: 'WASH', FUND: 'WASH', PRINCIPAL: 'WASH' }; }

  var PRESETS = {
    revlon: function () {
      var i = E.REPLAY.instruction();
      return { loanId: i.loanId, operation: i.operation, valueDate: i.valueDate, interest: plain(i.interest), principal: plain(i.principal), overrideCode: 'WA-01', overrideOther: '', fields: E.clone(i.fields), checkerId: 'U-CK1', approverId: 'U-AP1', makerNote: i.makerNote, editingId: null, preset: 'revlon' };
    },
    clean: function () {
      return { loanId: 'LN-1001', operation: 'INTEREST', valueDate: store.today(), interest: '1,284,375', principal: '0', overrideCode: '', overrideOther: '', fields: lenders(), checkerId: 'U-CK1', approverId: 'U-AP3', makerNote: 'Quarterly interest.', editingId: null, preset: 'clean' };
    },
    rollup: function () {
      return { loanId: 'LN-1004', operation: 'INTEREST_VIA_WASH', valueDate: store.today(), interest: '2,145,000', principal: '310,000,000', overrideCode: 'WA-01', overrideOther: '', fields: washAll(), checkerId: 'U-CK1', approverId: 'U-AP1', makerNote: 'Roll-up. Interest to lenders, principal to wash (WA-01).', editingId: null, preset: 'rollup' };
    },
    blank: function () {
      return { loanId: 'LN-1002', operation: 'PRINCIPAL_AND_INTEREST', valueDate: store.today(), interest: '', principal: '', overrideCode: '', overrideOther: '', fields: lenders(), checkerId: 'U-CK1', approverId: 'U-AP1', makerNote: '', editingId: null, preset: null };
    }
  };

  function draft() {
    var u = ui();
    if (!u.makerDraft) u.makerDraft = PRESETS.revlon();
    return u.makerDraft;
  }

  function draftToInstr(d) {
    return {
      loanId: d.loanId, operation: d.operation, valueDate: d.valueDate,
      interest: U.parseAmount(d.interest === '' ? '0' : d.interest),
      principal: U.parseAmount(d.principal === '' ? '0' : d.principal),
      overrideCode: d.overrideCode === '__other' ? String(d.overrideOther || '').trim().toUpperCase() : d.overrideCode,
      fields: E.clone(d.fields),
      makerId: store.roleUserId('maker'), checkerId: d.checkerId, approverId: d.approverId,
      makerNote: d.makerNote || ''
    };
  }

  /* ------------------------------------------------------------ shared pieces */

  var RULE_ICON = { pass: 'check', fire: 'x', na: 'dash', pending: 'clock', retry: 'warn' };

  function ruleRow(k, r) {
    var rule = E.RULES[k];
    var status = r ? r.status : 'na';
    return '<div class="rule-row rs-' + status + '">' +
      '<span class="rr-icon">' + U.icon(RULE_ICON[status] || 'dash') + '</span>' +
      '<span class="rr-id">' + U.ruleChip(k, status) + '</span>' +
      '<span class="rr-body"><span class="rr-name">' + U.esc(rule.name) + '</span>' +
      '<span class="rr-msg">' + U.esc(r ? r.message : '') + '</span></span></div>';
  }

  function ruleGroups(ev, skip) {
    var groups = [
      { mod: 'M1', title: 'Register check', note: 'consults the M1 register', rules: ['R-03', 'R-04'] },
      { mod: 'M3', title: 'Authority and Independence Gate', note: '', rules: ['R-05', 'R-06'] },
      { mod: 'M2', title: 'Consequence Engine', note: '', rules: ['R-01', 'R-02', 'R-07'] }
    ].filter(function (g) { return !skip || skip.indexOf(g.mod) < 0; });
    return '<div class="rule-groups">' + groups.map(function (g) {
      return '<div class="rg"><div class="rg-head">' + U.moduleChip(g.mod) + '<span>' + U.esc(g.title) + '</span>' + (g.note ? '<span class="muted small">' + U.esc(g.note) + '</span>' : '') + '</div>' +
        g.rules.map(function (k) { return ruleRow(k, ev.results[k]); }).join('') + '</div>';
    }).join('') + '</div>';
  }

  function gateChip(ev) {
    return ev.gate.open
      ? '<span class="chip gate gate-open">' + U.icon('unlock') + '<span>M3 gate open</span></span>'
      : '<span class="chip gate gate-closed">' + U.icon('lock') + '<span>M3 gate closed (' + U.esc(ev.gate.failures.join(', ')) + ')</span></span>';
  }

  function statementHtml(ev, opts) {
    opts = opts || {};
    var s = ev.statement;
    return '<div class="statement st-tier-' + ev.tier + (opts.big ? ' big' : '') + '" aria-live="polite">' +
      '<div class="st-label">' + U.moduleChip('M2') + ' What this payment will really do</div>' +
      '<p class="st-lead">' + U.emphasise(s[0]) + '</p>' +
      s.slice(1).map(function (x) { return '<p>' + U.emphasise(x) + '</p>'; }).join('') + '</div>';
  }

  function compareTable(ev, rekey, rekeyLabel) {
    var c = ev.consequence, x = ev.expected;
    var diff = E.round2(c.externalTotal - x.remainingTotal);
    var rows = '';
    if (rekey != null) rows += '<tr><th>' + U.esc(rekeyLabel || 'Your blind re-key') + '</th><td class="num">' + U.esc(U.fmtUSD(rekey)) + '</td></tr>';
    rows += '<tr><th>PCAP computes leaving the bank</th><td class="num"><strong>' + U.esc(U.fmtUSD(c.externalTotal)) + '</strong></td></tr>' +
      '<tr><th>of which principal</th><td class="num">' + U.esc(U.fmtUSD(c.externalPrincipal)) + '</td></tr>' +
      (c.internalPrincipal > 0 ? '<tr><th>Principal kept in wash account</th><td class="num">' + U.esc(U.fmtUSD(c.internalPrincipal)) + '</td></tr>' : '') +
      '<tr><th>Loan schedule expects</th><td class="num">' + U.esc(U.fmtUSD(x.remainingTotal)) + '</td></tr>' +
      '<tr class="' + (Math.abs(diff) > 0.005 ? 'diff-bad' : 'diff-ok') + '"><th>Difference</th><td class="num">' + (diff > 0 ? '+' : '') + U.esc(U.fmtUSD(diff)) + '</td></tr>';
    return '<table class="compare">' + rows + '</table>';
  }

  function precheckHtml(ev, title) {
    return '<div class="precheck">' +
      '<div class="pc-head"><h3>' + U.esc(title || 'PCAP pre-release check') + '</h3><div class="pc-badges">' + U.tierBadge(ev.tier, { big: true }) + gateChip(ev) + '</div></div>' +
      '<p class="tier-action">' + U.esc(E.TIERS[ev.tier].action) + (ev.gate.open ? '' : ' The assigned approver cannot approve: reassign before release.') + '</p>' +
      statementHtml(ev) +
      '<div class="pc-cols">' + compareTable(ev) + '</div>' +
      ruleGroups(ev) +
      (ev.tierReasons.length ? '<details class="reasons"><summary>Why Tier ' + ev.tier + '</summary><ul>' + ev.tierReasons.map(function (r) { return '<li>' + U.esc(r) + '</li>'; }).join('') + '</ul></details>' : '') +
      '</div>';
  }

  function legacyField(label, value, mono) {
    return '<div class="lf"><span class="lf-k">' + U.esc(label) + '</span><span class="lf-v' + (mono ? ' mono' : '') + '">' + U.esc(value) + '</span></div>';
  }

  function legacyReadOnly(i, opts) {
    opts = opts || {};
    var ln = store.loan(i.loanId) || {};
    var hide = opts.hideAmounts;
    return '<div class="legacy">' +
      '<div class="legacy-title">Core loan system (Flexcube-style, simulated) <span>LOAN PAYMENT INSTRUCTION</span></div>' +
      '<div class="legacy-grid">' +
      legacyField('LOAN', i.loanId + '  ' + (ln.name || ''), true) +
      legacyField('OPERATION', (E.OPERATIONS[i.operation] || {}).label || i.operation) +
      legacyField('VALUE DATE', U.fmtDate(i.valueDate), true) +
      legacyField('INTEREST AMT', hide ? 'Hidden until you re-key' : plain(i.interest), true) +
      legacyField('PRINCIPAL AMT', hide ? 'Hidden until you re-key' : plain(i.principal), true) +
      legacyField('OVERRIDE', i.overrideCode || 'NONE', true) +
      legacyField('FRONT', i.fields.FRONT === 'WASH' ? 'WASH 9910' : 'LENDERS', true) +
      legacyField('FUND', i.fields.FUND === 'WASH' ? 'WASH 9910' : 'LENDERS', true) +
      legacyField('PRINCIPAL', i.fields.PRINCIPAL === 'WASH' ? 'WASH 9910' : 'LENDERS', true) +
      '</div>' +
      (opts.warning !== false ? '<div class="legacy-warn">' + U.icon('warn') + ' Override fields set. Release payment? <span class="muted">(The legacy warning gives no amount.)</span></div>' : '') +
      '</div>';
  }

  function roleIntro(role) {
    var u = store.user(store.roleUserId(role));
    var text = {
      maker: 'Key the instruction as in the core system. PCAP shows in plain words what it will really do, before you submit.',
      checker: 'Check the instruction against its source. PCAP shows the same consequence statement and rule results.',
      approver: 'You act as the assigned approver. For Tier 2 and 3 you re-key the amount blind before PCAP shows the maker\'s figures and the full statement.',
      oprisk: 'Second line. Tier 3 hard stops wait here. Only you can release them, with a recorded reason.',
      owner: 'First-line owner of M1 to M3. You approve and review workarounds on the Register screen. Payments here are read-only.'
    }[role];
    return '<div class="role-intro"><div class="ri-who">' + U.icon('shield') + '<strong>' + U.esc(u ? u.name : '') + '</strong><span class="muted">' + U.esc(u ? u.title + ', ' + u.team : '') + '</span></div><p>' + U.esc(text) + '</p></div>';
  }

  function flashHtml() {
    if (!flash) return '';
    var f = flash;
    flash = null;
    return '<div class="flash ' + (f.kind || '') + '">' + U.icon(f.kind === 'bad' ? 'stop' : f.kind === 'warn' ? 'warn' : 'check') + '<div class="flash-body"><strong>' + U.esc(f.title) + '</strong>' + (f.text ? '<span>' + U.esc(f.text) + '</span>' : '') + '</div>' +
      (f.next ? '<button class="btn primary" data-action="goto-role" data-role="' + f.next.role + '">' + U.esc(f.next.label) + ' ' + U.icon('arrow') + '</button>' : '') + '</div>';
  }

  /* ------------------------------------------------------------ maker */

  function overrideOptions(op, current) {
    var entries = st().ctx.register.filter(function (r) { return (r.appliesTo || []).indexOf(op) >= 0; });
    var opts = '<option value=""' + (current === '' ? ' selected' : '') + '>None</option>';
    entries.forEach(function (r) {
      opts += '<option value="' + U.esc(r.id) + '"' + (current === r.id ? ' selected' : '') + '>' + U.esc(r.id + ' ' + r.title + ' (' + r.status + ')') + '</option>';
    });
    opts += '<option value="__other"' + (current === '__other' ? ' selected' : '') + '>Other code not in the register</option>';
    return opts;
  }

  function usersWith(role) { return st().ctx.users.filter(function (u) { return (u.roles || []).indexOf(role) >= 0; }); }

  function scheduleHint(loanId) {
    var ln = store.loan(loanId);
    if (!ln) return '';
    var lines = ln.schedule.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return '<div class="sched"><div class="sched-head">Loan schedule (what PCAP compares against) <span class="muted">' + ln.lenders + ' lenders, principal outstanding ' + U.esc(U.fmtCompact(ln.principalOutstanding)) + '</span></div>' +
      '<table class="mini"><thead><tr><th>Date</th><th class="num">Interest due</th><th class="num">Principal due</th><th>Status</th></tr></thead><tbody>' +
      lines.map(function (l) {
        var paid = (l.paidInterest || 0) + (l.paidPrincipal || 0) > 0 && (l.paidInterest || 0) >= (l.interest || 0) && (l.paidPrincipal || 0) >= (l.principal || 0);
        return '<tr><td>' + U.esc(U.fmtDate(l.date)) + (l.date === store.today() ? ' <span class="chip tiny">today</span>' : '') + '</td><td class="num">' + U.esc(plain(l.interest)) + '</td><td class="num">' + U.esc(plain(l.principal)) + '</td><td>' + (paid ? 'Paid' : U.esc(l.note || 'Due')) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<button class="btn link small" data-action="fill-schedule">Fill amounts from the next unpaid line</button></div>';
  }

  function makerForm(d) {
    var loans = st().ctx.loans;
    var opSel = Object.keys(E.OPERATIONS).map(function (k) { return '<option value="' + k + '"' + (d.operation === k ? ' selected' : '') + '>' + U.esc(E.OPERATIONS[k].label) + '</option>'; }).join('');
    var loanSel = loans.map(function (l) { return '<option value="' + U.esc(l.id) + '"' + (d.loanId === l.id ? ' selected' : '') + '>' + U.esc(l.id + '  ' + l.name) + '</option>'; }).join('');
    function fieldSel(f) {
      return '<label class="lf-edit"><span class="lf-k">' + f + '</span><select name="field-' + f + '" data-field="' + f + '">' +
        ['LENDERS', 'WASH'].map(function (v) { return '<option value="' + v + '"' + (d.fields[f] === v ? ' selected' : '') + '>' + U.esc(FIELD_LABEL[v]) + '</option>'; }).join('') + '</select></label>';
    }
    var checkers = usersWith('checker'), approvers = usersWith('approver');
    return '<form class="card maker-form" id="maker-form" autocomplete="off">' +
      '<div class="card-head"><h2>' + (d.editingId ? 'Edit and resubmit ' + U.esc(d.editingId) : 'New payment instruction') + '</h2>' +
      '<div class="presets"><span class="muted small">Presets</span>' +
      '<button type="button" class="btn small ' + (d.preset === 'revlon' ? 'primary' : '') + '" data-action="preset" data-preset="revlon">Revlon replay</button>' +
      '<button type="button" class="btn small ' + (d.preset === 'clean' ? 'primary' : '') + '" data-action="preset" data-preset="clean">Clean interest</button>' +
      '<button type="button" class="btn small ' + (d.preset === 'rollup' ? 'primary' : '') + '" data-action="preset" data-preset="rollup">Correct WA-01 roll-up</button>' +
      '<button type="button" class="btn small ghost" data-action="preset" data-preset="blank">Blank</button></div></div>' +
      (d.preset === 'revlon' ? '<p class="note">' + U.icon('info') + ' Synthetic replay of 11 Aug 2020: about USD 7.8M of interest was intended, but only PRINCIPAL is set to the wash account. The documented workaround needs FRONT, FUND and PRINCIPAL.</p>' : '') +
      '<div class="legacy editable"><div class="legacy-title">Core loan system (Flexcube-style, simulated) <span>LOAN PAYMENT INSTRUCTION</span></div>' +
      '<div class="form-grid">' +
      '<label class="span2"><span>Loan</span><select name="loanId" data-rerender="1">' + loanSel + '</select></label>' +
      '<label class="span2"><span>Operation</span><select name="operation" data-rerender="1">' + opSel + '</select></label>' +
      '<label><span>Value date</span><input type="date" name="valueDate" value="' + U.esc(d.valueDate) + '" required></label>' +
      '<label><span>Interest amount (USD)</span><input name="interest" inputmode="decimal" value="' + U.esc(d.interest) + '" placeholder="e.g. 1,284,375"></label>' +
      '<label><span>Principal amount (USD)</span><input name="principal" inputmode="decimal" value="' + U.esc(d.principal) + '" placeholder="0"></label>' +
      '<label><span>Override (workaround) code</span><select name="overrideCode" data-rerender="1">' + overrideOptions(d.operation, d.overrideCode) + '</select></label>' +
      (d.overrideCode === '__other' ? '<label><span>Other override code</span><input name="overrideOther" value="' + U.esc(d.overrideOther) + '" placeholder="e.g. OVR-PRIN-HOLD"></label>' : '') +
      '</div>' +
      '<div class="settle"><div class="settle-head">Settlement account fields: Lenders is the default, Wash 9910 is the internal wash account</div>' + fieldSel('FRONT') + fieldSel('FUND') + fieldSel('PRINCIPAL') + '</div>' +
      '</div>' +
      scheduleHint(d.loanId) +
      '<div class="form-grid chain"><div class="span2 chain-head">Approval chain (six eyes)</div>' +
      '<label><span>Checker</span><select name="checkerId">' + checkers.map(function (u) { return '<option value="' + u.id + '"' + (d.checkerId === u.id ? ' selected' : '') + '>' + U.esc(u.name + ' (' + u.employer + ', ' + u.team + ')') + '</option>'; }).join('') + '</select></label>' +
      '<label><span>Approver</span><select name="approverId">' + approvers.map(function (u) { return '<option value="' + u.id + '"' + (d.approverId === u.id ? ' selected' : '') + '>' + U.esc(u.name + ' (' + u.employer + ', ' + u.team + ')') + '</option>'; }).join('') + '</select></label>' +
      '<label class="span2"><span>Maker note to checker</span><textarea name="makerNote" rows="2" placeholder="e.g. Interest only. Principal to wash.">' + U.esc(d.makerNote) + '</textarea></label>' +
      '</div>' +
      '<div class="form-actions"><button type="submit" class="btn primary">' + (d.editingId ? 'Resubmit to checker' : 'Submit to checker') + '</button>' +
      (d.editingId ? '<button type="button" class="btn ghost" data-action="preset" data-preset="blank">Stop editing</button>' : '') +
      '<span class="muted small">PCAP does not stop the maker from submitting. It holds the payment at the release point.</span></div>' +
      '</form>';
  }

  function makerPrecheck(d) {
    var instr = draftToInstr(d);
    if (isNaN(instr.interest) || isNaN(instr.principal)) return '<div class="card precheck-card"><div class="precheck"><h3>PCAP pre-release check</h3><p class="muted">Type amounts as numbers, for example 7,820,000 or 7.82m.</p></div></div>';
    var ev = store.evaluateInstr(instr);
    return '<div class="card precheck-card">' + precheckHtml(ev, 'PCAP pre-release check (live)') + '</div>';
  }

  function myInstructions() {
    var me = store.roleUserId('maker');
    var rows = st().payments.filter(function (p) { return p.makerId === me && p.status !== 'CANCELLED'; }).slice(0, 8);
    if (!rows.length) return '';
    return '<div class="card"><div class="card-head"><h2>My instructions</h2></div><table class="table"><thead><tr><th>ID</th><th>Loan</th><th>Value date</th><th>Tier at submit</th><th>Status</th><th></th></tr></thead><tbody>' +
      rows.map(function (p) {
        return '<tr><td><a href="#" data-open-payment="' + p.id + '">' + p.id + '</a></td><td>' + U.esc(p.loanId) + '</td><td>' + U.esc(U.fmtDate(p.instr.valueDate)) + '</td><td>' + (p.atSubmit ? U.tierBadge(p.atSubmit.tier, { noLabel: true }) : '') + '</td><td>' + U.statusChip(p.status) +
          (p.status === 'RETURNED' && p.returnReason ? '<div class="small muted">' + U.esc(p.returnReason) + '</div>' : '') + '</td><td class="actions">' +
          (p.status === 'RETURNED' ? '<button class="btn small" data-action="edit" data-id="' + p.id + '">Edit and resubmit</button><button class="btn small ghost" data-action="cancel" data-id="' + p.id + '">Cancel</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function makerView() {
    var d = draft();
    return '<div class="split maker">' + '<div>' + makerForm(d) + '</div><div id="precheck-host" class="sticky">' + makerPrecheck(d) + '</div></div>' + myInstructions();
  }

  /* ------------------------------------------------------------ checker */

  function queue(title, rows, role, cols, empty) {
    var sel = ui().deskSelected[role];
    return '<div class="card queue"><div class="card-head"><h2>' + U.esc(title) + '</h2><span class="count">' + rows.length + '</span></div>' +
      (rows.length ? '<div class="q-list">' + rows.map(function (p) {
        return '<button class="q-item' + (p.id === sel ? ' active' : '') + '" data-action="select" data-role="' + role + '" data-id="' + p.id + '">' + cols(p) + '</button>';
      }).join('') + '</div>' : '<p class="empty">' + U.esc(empty) + '</p>') + '</div>';
  }

  function pickSelected(role, rows) {
    var u = ui();
    if (!rows.some(function (p) { return p.id === u.deskSelected[role]; })) u.deskSelected[role] = rows.length ? rows[0].id : null;
    return u.deskSelected[role] ? store.payment(u.deskSelected[role]) : null;
  }

  function checkerView() {
    var rows = st().payments.filter(function (p) { return p.status === 'SUBMITTED'; });
    var p = pickSelected('checker', rows);
    var q = queue('Waiting for checker', rows, 'checker', function (p) {
      var ev = store.evaluateInstr(p.instr);
      return '<span class="q-id">' + p.id + '</span><span class="q-main">' + U.esc(p.loanId) + ' ' + U.esc((E.OPERATIONS[p.instr.operation] || {}).short) + '</span>' + U.tierBadge(ev.tier, { noLabel: true });
    }, 'Nothing to check. Submit an instruction as the Maker first.');
    var ws = '';
    if (p) {
      var ev = store.evaluateInstr(p.instr);
      ws = '<div class="card workspace"><div class="card-head"><h2>' + p.id + ' <span class="muted">from ' + U.esc(store.userName(p.makerId)) + '</span></h2>' + U.tierBadge(ev.tier) + '</div>' +
        legacyReadOnly(p.instr) +
        (p.instr.makerNote ? '<p class="quote"><span class="muted">Maker note:</span> ' + U.esc(p.instr.makerNote) + '</p>' : '') +
        precheckHtml(ev, 'PCAP pre-release check') +
        '<div class="decision"><label><span>Checker note to approver</span><textarea id="checker-note" rows="2" placeholder="e.g. Principal set to wash. Interest only to lenders."></textarea></label>' +
        '<p class="muted small">The approver will not see this note until after their blind re-key, so it cannot anchor their check.</p>' +
        '<div class="form-actions"><button class="btn primary" data-action="check" data-id="' + p.id + '">Mark checked, send to approver</button>' +
        '<button class="btn" data-action="return" data-id="' + p.id + '" data-stage="checker">Return to maker</button></div></div></div>';
    }
    return '<div class="split queue-split">' + q + (ws || '<div></div>') + '</div>';
  }

  /* ------------------------------------------------------------ approver */

  function noticeHtml(ev) {
    var x = ev.expected;
    if (!x.scheduled) return 'No agent notice found for ' + U.fmtDate(x.date) + '. Nothing is due on that date.';
    if (x.alreadyPaid) return 'The notice for ' + U.fmtDate(x.date) + ' has already been paid in full.';
    var parts = [];
    if (x.remainingInterest > 0) parts.push(U.fmtUSD(x.remainingInterest) + ' of interest');
    if (x.remainingPrincipal > 0) parts.push(U.fmtUSD(x.remainingPrincipal) + ' of principal');
    return 'Notice sent to lenders: ' + parts.join(' and ') + ' due on ' + U.fmtDate(x.date) + '.' + (x.note ? ' ' + x.note : '');
  }

  function approverView() {
    var rows = st().payments.filter(function (p) { return p.status === 'CHECKED'; });
    var p = pickSelected('approver', rows);
    var q = queue('Waiting for approval', rows, 'approver', function (p) {
      var ev = store.evaluateInstr(p.instr);
      return '<span class="q-id">' + p.id + '</span><span class="q-main">' + U.esc(p.loanId) + ' ' + U.esc((E.OPERATIONS[p.instr.operation] || {}).short) + '<span class="small muted"> for ' + U.esc(store.userName(p.approverId)) + ', amount hidden</span></span>' + U.tierBadge(ev.tier, { noLabel: true });
    }, 'Nothing to approve. Check a payment as the Checker first.');
    return '<div class="split queue-split">' + q + (p ? approverWorkspace(p) : '<div></div>') + '</div>';
  }

  function approverWorkspace(p) {
    var ev0 = store.approverOpen(p.id);
    var ap = store.user(p.approverId);
    var head = '<div class="card-head"><h2>' + p.id + ' <span class="muted">' + U.esc((store.loan(p.loanId) || {}).name || p.loanId) + '</span></h2>' + U.tierBadge(ev0.tier) + '</div>' +
      '<p class="acting">' + U.icon('shield') + ' Acting as <strong>' + U.esc(ap ? ap.name : '') + '</strong>, the assigned approver (' + U.esc(ap ? ap.employer + ', ' + ap.team : '') + ').</p>';
    var gate = '<div class="gate-box ' + (ev0.gate.open ? 'open' : 'closed') + '"><div class="gb-head">' + U.moduleChip('M3') + gateChip(ev0) + '</div>' +
      ruleRow('R-05', ev0.results['R-05']) + ruleRow('R-06', ev0.results['R-06']) + '</div>';

    if (!ev0.gate.open) {
      return '<div class="card workspace">' + head + gate +
        '<div class="hardstop">' + U.icon('lock') + '<div><strong>Approval blocked at the M3 gate.</strong> This attempt is logged as a blocked attempt (evidence for obligation rows 1, 3 and 5). Return the payment so the maker can route it to a certified, independent, in-house approver.</div></div>' +
        '<div class="form-actions"><button class="btn primary" data-action="return" data-id="' + p.id + '" data-stage="gate" data-reason="M3 gate: ' + U.esc(ev0.results['R-05'].status === 'fire' ? ev0.results['R-05'].message : ev0.results['R-06'].message) + ' Please reassign.">Return to maker for reassignment</button></div></div>';
    }

    var a = p.approval || { attempts: [] };
    var needRekey = ev0.tier >= 2;
    var rekeyDone = a.rekey === 'pass' || a.rekey === 'fire';
    if (needRekey && !rekeyDone) {
      var retry = a.rekey === 'retry';
      return '<div class="card workspace">' + head + gate +
        legacyReadOnly(p.instr, { hideAmounts: true, warning: false }) +
        '<div class="rekey-card">' +
        '<div class="rk-head">' + U.moduleChip('M2') + U.ruleChip('R-07') + '<h3>Step 1 of 2: blind re-key</h3></div>' +
        '<p>Type the amount you expect this payment to send <strong>out of the bank</strong>. Use your own source, not the instruction. The maker\'s figures, the checker\'s note and PCAP\'s statement stay hidden until you re-key, so they cannot anchor your check.</p>' +
        '<details class="notice"><summary>Open your source: agent notice to lenders (synthetic)</summary><p>' + U.esc(noticeHtml(ev0)) + '</p></details>' +
        (retry ? '<div class="flash warn">' + U.icon('warn') + '<div class="flash-body"><strong>Your figure does not match what this instruction will send.</strong><span>Check your source and re-key once more. A second mismatch sends the payment to Operational Risk. Attempt 1 is logged.</span></div></div>' : '') +
        '<div class="rk-row"><label><span>Amount leaving the bank (USD)</span><input id="rekey-input" inputmode="decimal" placeholder="e.g. 7,820,000 or 7.82m" autocomplete="off"></label>' +
        '<button class="btn primary" data-action="rekey" data-id="' + p.id + '">Check my figure</button></div>' +
        '<p class="muted small">Attempt ' + (a.attempts.length + 1) + ' of 2.</p></div></div>';
    }

    /* Statement revealed: Tier 1 straight away, Tier 2 and 3 after the re-key. */
    store.approverReveal(p.id);
    var ev = store.currentEval(p);
    if (!revealPerf[p.id]) revealPerf[p.id] = performance.now();
    var lastRekey = a.attempts.length ? a.attempts[a.attempts.length - 1] : null;
    var html = '<div class="card workspace">' + head + gate;
    if (needRekey) {
      html += '<div class="rk-result ' + (a.rekey === 'pass' ? 'ok' : 'bad') + '">' + U.icon(a.rekey === 'pass' ? 'check' : 'stop') + '<span>' +
        (a.rekey === 'pass' ? 'Step 1 done. Your blind re-key matches the amount PCAP computed' + (a.rekeyKind === 'slip' ? ' on the second attempt (your first figure is logged as a slip).' : '.') : 'Step 1: your figure (' + U.esc(U.fmtUSD(lastRekey)) + ') did not match twice. R-07 escalated the payment to Tier 3.') + '</span></div>';
    }
    html += '<div class="reveal">' + (needRekey ? '<h3 class="step">Step 2 of 2: read what will really happen</h3>' : '') +
      statementHtml(ev, { big: true }) +
      '<div class="pc-cols">' + compareTable(ev, needRekey ? lastRekey : null) +
      '<div class="maker-figs"><div class="mf-head">Maker\'s instruction</div>' + legacyReadOnly(p.instr, { warning: false }) +
      (p.checkerNote ? '<p class="quote"><span class="muted">Checker note:</span> ' + U.esc(p.checkerNote) + '</p>' : '') + '</div></div>' +
      ruleGroups(ev, ['M3']) + '</div>' +
      '<div class="dwell">' + U.icon('clock') + ' Time on the consequence screen: <strong id="dwell">0 s</strong> <span class="muted small">(measured for M4, reported at team level)</span></div>';

    if (ev.tier === 3) {
      html += '<div class="hardstop">' + U.icon('stop') + '<div><strong>Hard stop (Tier 3).</strong> You cannot release this payment. Send it to Operational Risk with your note, or return it to the maker.<ul>' + ev.tierReasons.map(function (r) { return '<li>' + U.esc(r) + '</li>'; }).join('') + '</ul></div></div>' +
        '<div class="decision"><label><span>Your note to Operational Risk</span><textarea id="approver-note" rows="2" placeholder="e.g. Notice says USD 7.82M interest only. This would send principal out."></textarea></label>' +
        '<div class="form-actions"><button class="btn danger" data-action="escalate" data-id="' + p.id + '">Send to Operational Risk</button>' +
        '<button class="btn" data-action="return" data-id="' + p.id + '" data-stage="approver">Return to maker</button></div></div>';
    } else if (ev.tier === 2) {
      var conf = ev.statement[0] + (ev.consequence.internalPrincipal > 0 ? ' ' + ev.statement[1] : '');
      html += '<div class="decision"><label class="confirm"><input type="checkbox" id="confirm-box"> <span><strong>Tier 2 confirmation.</strong> I confirm: ' + U.emphasise(conf) + '</span></label>' +
        '<div class="form-actions"><button class="btn primary" data-action="approve" data-id="' + p.id + '">Approve and release</button>' +
        '<button class="btn" data-action="return" data-id="' + p.id + '" data-stage="approver">Return to maker</button></div></div>';
    } else {
      html += '<div class="decision"><div class="form-actions"><button class="btn primary" data-action="approve" data-id="' + p.id + '">Approve and release</button>' +
        '<button class="btn" data-action="return" data-id="' + p.id + '" data-stage="approver">Return to maker</button></div></div>';
    }
    return html + '</div>';
  }

  /* ------------------------------------------------------------ operational risk */

  function opRiskView() {
    var rows = st().payments.filter(function (p) { return p.status === 'HELD'; });
    var p = pickSelected('oprisk', rows);
    var q = queue('Hard-stop queue (Tier 3)', rows, 'oprisk', function (p) {
      var mins = Math.max(0, Math.round((Date.now() - new Date(p.heldAt)) / 60000));
      return '<span class="q-id">' + p.id + '</span><span class="q-main">' + U.esc(p.loanId) + ' <strong>' + U.esc(U.fmtCompact(p.atHold ? p.atHold.external : 0)) + '</strong> out<span class="small muted"> held ' + mins + ' min, ' + U.esc((p.atHold ? p.atHold.hits : []).join(' ')) + '</span></span>' + U.tierBadge(3, { noLabel: true });
    }, 'No Tier 3 holds. A held payment appears here after the approver sends it.');
    var ws = '<div></div>';
    if (p) {
      var ev = store.currentEval(p);
      if (!oprPerf[p.id]) oprPerf[p.id] = performance.now();
      var a = p.approval || { attempts: [] };
      ws = '<div class="card workspace"><div class="card-head"><h2>' + p.id + ' <span class="muted">' + U.esc((store.loan(p.loanId) || {}).name || p.loanId) + '</span></h2>' + U.tierBadge(3) + '</div>' +
        statementHtml(ev, { big: true }) +
        '<div class="pc-cols">' + compareTable(ev, a.attempts.length ? a.attempts[a.attempts.length - 1] : null, 'Approver\'s blind re-key') +
        '<div class="maker-figs"><div class="mf-head">Who saw it</div>' +
        '<div class="kv-grid one">' +
        '<div class="kv"><span class="k">Maker</span><span class="v">' + U.esc(store.userName(p.makerId)) + (p.instr.makerNote ? ': "' + U.esc(p.instr.makerNote) + '"' : '') + '</span></div>' +
        '<div class="kv"><span class="k">Checker</span><span class="v">' + U.esc(store.userName(p.checkerId)) + (p.checkerNote ? ': "' + U.esc(p.checkerNote) + '"' : '') + '</span></div>' +
        '<div class="kv"><span class="k">Approver</span><span class="v">' + U.esc(store.userName(p.approverId)) + ', blind re-key ' + U.esc(a.attempts.map(function (x) { return U.fmtUSD(x); }).join(' then ') || 'none') + (a.note ? ': "' + U.esc(a.note) + '"' : '') + '</span></div>' +
        '<div class="kv"><span class="k">Held</span><span class="v">' + U.esc(U.fmtShortDateTime(p.heldAt)) + '</span></div></div></div></div>' +
        ruleGroups(ev) +
        '<div class="decision opr"><h3>Record the second-line decision</h3>' +
        '<label><span>Decision</span><select id="opr-category">' +
        '<option value="Confirmed error">Confirmed error: reject and return to maker</option>' +
        '<option value="False alarm, payment is correct">False alarm: the payment is correct</option>' +
        '<option value="Approved business exception">Approved business exception</option></select></label>' +
        '<label><span>Recorded reason (required, at least 15 characters)</span><textarea id="opr-reason" rows="3" placeholder="e.g. Principal would leave the bank on an interest-only date. Confirmed with the desk. Returned for FRONT and FUND."></textarea></label>' +
        '<div class="form-actions"><button class="btn" data-action="opr-reject" data-id="' + p.id + '">Reject and return to maker</button>' +
        '<button class="btn danger" data-action="opr-release" data-id="' + p.id + '">Release with recorded reason</button></div>' +
        '<p class="muted small">Every decision is logged with your reason, the time and the obligation it serves. M4 also tracks second-line releases, so the hard stop does not just move the rubber stamp.</p></div>' +
        '<h3>Evidence trail</h3>' + PCAP.app.paymentTimeline(p.id) + '</div>';
    }
    var decided = st().payments.filter(function (x) { return x.opRisk; }).slice(0, 6);
    var recent = decided.length ? '<div class="card"><div class="card-head"><h2>Recent second-line decisions</h2></div><table class="table"><thead><tr><th>ID</th><th>Decision</th><th>Reason</th><th class="num">Minutes held</th></tr></thead><tbody>' +
      decided.map(function (x) { return '<tr><td><a href="#" data-open-payment="' + x.id + '">' + x.id + '</a></td><td>' + U.esc(x.opRisk.decision === 'release' ? 'Released (' + x.opRisk.category + ')' : 'Rejected') + '</td><td>' + U.esc(x.opRisk.reason) + '</td><td class="num">' + U.esc(String(x.opRisk.minutesHeld)) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '';
    return '<div class="split queue-split">' + q + ws + '</div>' + recent;
  }

  function ownerView() {
    return '<div class="card"><p>' + U.icon('info') + ' As Head of Loan Operations you are the single accountable owner of M1 to M3 (Table 7). Go to the <a href="#/register">Register</a> to approve, review or retire workarounds. Switch role to Maker, Checker, Approver or Operational Risk to run a payment.</p></div>';
  }

  /* ------------------------------------------------------------ all payments */

  function allPayments() {
    var rows = st().payments.slice(0, 14);
    return '<div class="card"><div class="card-head"><h2>All payments</h2><span class="muted small">Click an ID for its evidence trail</span></div><div class="table-wrap"><table class="table"><thead><tr><th>ID</th><th>Loan</th><th>Operation</th><th>Value date</th><th>Tier</th><th>Status</th><th>Maker / Checker / Approver</th><th class="num">Left the bank</th></tr></thead><tbody>' +
      rows.map(function (p) {
        var tier = p.atRelease ? p.atRelease.tier : p.atHold ? p.atHold.tier : p.atSubmit ? p.atSubmit.tier : 1;
        return '<tr><td><a href="#" data-open-payment="' + p.id + '">' + p.id + '</a></td><td>' + U.esc(p.loanId) + '</td><td>' + U.esc((E.OPERATIONS[p.instr.operation] || {}).short) + '</td><td>' + U.esc(U.fmtDate(p.instr.valueDate)) + '</td><td>' + U.tierBadge(tier, { noLabel: true }) + '</td><td>' + U.statusChip(p.status) + '</td><td class="small">' + U.esc([p.makerId, p.checkerId, p.approverId].map(store.userName).join(' / ')) + '</td><td class="num">' + (p.status === 'RELEASED' ? U.esc(U.fmtUSD(p.releasedExternal)) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  /* ------------------------------------------------------------ render and events */

  function render(el) {
    var role = st().role;
    var body = role === 'maker' ? makerView() : role === 'checker' ? checkerView() : role === 'approver' ? approverView() : role === 'oprisk' ? opRiskView() : ownerView();
    el.innerHTML = '<div class="page-head"><h1>Payment desk</h1><p class="lede">Instruction, then the M1 register check and the M3 gate, then the M2 consequence engine, then tiered approval with active confirmation, then release or hard stop. Every step is logged for M4, M5 and M6.</p></div>' +
      roleIntro(role) + flashHtml() + body + allPayments();
    bind(el);
    startDwellTimer();
  }

  function startDwellTimer() {
    var span = document.getElementById('dwell');
    if (!span) return;
    var id = ui().deskSelected.approver;
    var t = setInterval(function () {
      var s = document.getElementById('dwell');
      if (!s || !revealPerf[id]) return;
      s.textContent = Math.floor((performance.now() - revealPerf[id]) / 1000) + ' s';
    }, 500);
    PCAP.app.addTimer(t);
  }

  function refreshPrecheck() {
    var host = document.getElementById('precheck-host');
    if (host) host.innerHTML = makerPrecheck(draft());
  }

  function readForm(form) {
    var d = draft();
    var fd = form.elements;
    ['loanId', 'operation', 'valueDate', 'interest', 'principal', 'overrideCode', 'checkerId', 'approverId', 'makerNote'].forEach(function (k) {
      if (fd[k]) d[k] = fd[k].value;
    });
    if (fd.overrideOther) d.overrideOther = fd.overrideOther.value;
    ['FRONT', 'FUND', 'PRINCIPAL'].forEach(function (f) { if (fd['field-' + f]) d.fields[f] = fd['field-' + f].value; });
    return d;
  }

  function fillFromSchedule(d) {
    var ln = store.loan(d.loanId);
    if (!ln) return;
    var lines = ln.schedule.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var line = lines.filter(function (l) { return (l.paidInterest || 0) < (l.interest || 0) || (l.paidPrincipal || 0) < (l.principal || 0); })[0];
    if (!line) return;
    d.valueDate = line.date;
    d.interest = plain(Math.max(0, line.interest - (line.paidInterest || 0)));
    if (d.operation === 'INTEREST_VIA_WASH') d.principal = plain(ln.principalOutstanding);
    else d.principal = plain(Math.max(0, line.principal - (line.paidPrincipal || 0)));
  }

  function bind(el) {
    el.oninput = function (e) {
      var form = e.target.form;
      if (form && form.id === 'maker-form') {
        readForm(form);
        draft().preset = draft().preset && e.target.name === 'makerNote' ? draft().preset : null;
        refreshPrecheck();
      }
    };
    el.onchange = function (e) {
      var form = e.target.form;
      if (form && form.id === 'maker-form') {
        var d = readForm(form);
        if (e.target.name === 'operation') {
          if (d.operation === 'INTEREST_VIA_WASH' && !d.overrideCode) d.overrideCode = 'WA-01';
          if (d.operation !== 'INTEREST_VIA_WASH' && d.overrideCode === 'WA-01') d.overrideCode = '';
        }
        if (e.target.name === 'loanId') fillFromSchedule(d);
        d.preset = null;
        store.save();
        if (e.target.getAttribute('data-rerender')) PCAP.app.render();
        else refreshPrecheck();
      }
    };
    el.onsubmit = function (e) {
      if (e.target.id !== 'maker-form') return;
      e.preventDefault();
      var d = readForm(e.target);
      var instr = draftToInstr(d);
      if (isNaN(instr.interest) || isNaN(instr.principal) || instr.interest < 0 || instr.principal < 0) { U.toast('Amounts must be numbers of zero or more.', 'bad'); return; }
      if (!instr.valueDate) { U.toast('Pick a value date.', 'bad'); return; }
      if (instr.interest + instr.principal <= 0) { U.toast('Enter an interest or principal amount.', 'bad'); return; }
      var p = store.submitInstruction(instr, store.roleUserId('maker'), d.editingId);
      d.editingId = null;
      ui().deskSelected.checker = p.id;
      flash = { kind: p.atSubmit.tier === 3 ? 'bad' : p.atSubmit.tier === 2 ? 'warn' : 'ok', title: p.id + ' submitted. PCAP put it at Tier ' + p.atSubmit.tier + '.', text: p.atSubmit.tier === 3 ? 'It can still be checked and reviewed, but only Operational Risk can release it.' : 'Next step: the checker.', next: { role: 'checker', label: 'Continue as Checker' } };
      store.save();
      PCAP.app.render();
    };
    el.onclick = function (e) {
      var b = e.target.closest('[data-action]');
      if (!b) return;
      var act = b.getAttribute('data-action');
      var id = b.getAttribute('data-id');
      try {
        if (act === 'preset') {
          var keep = draft().editingId && b.getAttribute('data-preset') !== 'blank' ? draft().editingId : null;
          ui().makerDraft = PRESETS[b.getAttribute('data-preset')]();
          ui().makerDraft.editingId = keep;
          store.save();
          PCAP.app.render();
        } else if (act === 'fill-schedule') {
          var form = document.getElementById('maker-form');
          var d = readForm(form);
          fillFromSchedule(d);
          store.save();
          PCAP.app.render();
        } else if (act === 'goto-role') {
          PCAP.app.setRole(b.getAttribute('data-role'));
          window.scrollTo(0, 0);
        } else if (act === 'select') {
          ui().deskSelected[b.getAttribute('data-role')] = id;
          store.save();
          PCAP.app.render();
        } else if (act === 'check') {
          var note = (document.getElementById('checker-note') || {}).value || '';
          store.checkPayment(id, store.payment(id).checkerId, note.trim());
          ui().deskSelected.approver = id;
          flash = { kind: 'ok', title: id + ' checked and sent to the approver.', text: 'The approver will re-key blind if it is Tier 2 or 3.', next: { role: 'approver', label: 'Continue as Approver' } };
          PCAP.app.render();
        } else if (act === 'return') {
          var stage = b.getAttribute('data-stage');
          var p = store.payment(id);
          var actor = stage === 'checker' ? p.checkerId : p.approverId;
          var reason = b.getAttribute('data-reason') || window.prompt('Reason for returning ' + id + ' to the maker:', stage === 'approver' ? 'Amounts do not match my source.' : 'Please correct the instruction.');
          if (reason == null) return;
          store.returnToMaker(id, actor, reason, stage);
          flash = { kind: 'warn', title: id + ' returned to the maker.', text: reason, next: { role: 'maker', label: 'Continue as Maker' } };
          PCAP.app.render();
        } else if (act === 'rekey') {
          var input = document.getElementById('rekey-input');
          var amt = U.parseAmount(input ? input.value : '');
          if (isNaN(amt)) { U.toast('Type the amount as a number, for example 7,820,000 or 7.82m.', 'bad'); return; }
          var rk = store.approverRekey(id, amt);
          if (rk.status === 'retry') U.toast('Re-key does not match. One more attempt.', 'warn');
          PCAP.app.render();
        } else if (act === 'approve') {
          var p2 = store.payment(id);
          var ev = store.currentEval(p2);
          var box = document.getElementById('confirm-box');
          if (ev.tier === 2 && (!box || !box.checked)) { U.toast('Tick the Tier 2 confirmation first.', 'bad'); return; }
          var dwell = revealPerf[id] ? (performance.now() - revealPerf[id]) / 1000 : 0;
          store.approverApprove(id, { dwellSec: dwell, confirmed: !!(box && box.checked) });
          flash = { kind: 'ok', title: id + ' released at Tier ' + ev.tier + '.', text: U.fmtUSD(ev.consequence.externalTotal) + ' left the bank. Time on the consequence screen: ' + U.fmtSec(dwell) + '. M5 will reconcile it today.' };
          PCAP.app.render();
        } else if (act === 'escalate') {
          var dw = revealPerf[id] ? (performance.now() - revealPerf[id]) / 1000 : 0;
          var noteA = (document.getElementById('approver-note') || {}).value || '';
          store.approverEscalate(id, { dwellSec: dw, note: noteA.trim() });
          ui().deskSelected.oprisk = id;
          flash = { kind: 'bad', title: id + ' held at Tier 3 and sent to Operational Risk.', text: 'Only the second line can release it, with a recorded reason.', next: { role: 'oprisk', label: 'Continue as Operational Risk' } };
          PCAP.app.render();
        } else if (act === 'opr-release' || act === 'opr-reject') {
          var cat = document.getElementById('opr-category').value;
          var reasonO = document.getElementById('opr-reason').value || '';
          var secs = oprPerf[id] ? (performance.now() - oprPerf[id]) / 1000 : null;
          if (act === 'opr-release') {
            if (cat === 'Confirmed error') { U.toast('A confirmed error cannot be released. Choose Reject, or change the decision.', 'bad'); return; }
            if (!window.confirm('Release ' + id + '? ' + U.fmtUSD(store.currentEval(store.payment(id)).consequence.externalTotal) + ' will leave the bank.')) return;
            store.opRiskRelease(id, store.roleUserId('oprisk'), cat, reasonO, secs);
            flash = { kind: 'warn', title: id + ' released by Operational Risk.', text: 'The reason is logged. M5 will reconcile it against the schedule today.' };
          } else {
            store.opRiskReject(id, store.roleUserId('oprisk'), reasonO, secs);
            flash = { kind: 'ok', title: id + ' rejected and returned to the maker.', text: 'Logged as a hold that was a real error.' };
          }
          PCAP.app.render();
        } else if (act === 'edit') {
          var pe = store.payment(id);
          var i = pe.instr;
          var known = st().ctx.register.some(function (r) { return r.id === i.overrideCode; });
          ui().makerDraft = { loanId: i.loanId, operation: i.operation, valueDate: i.valueDate, interest: plain(i.interest), principal: plain(i.principal), overrideCode: !i.overrideCode ? '' : known ? i.overrideCode : '__other', overrideOther: known ? '' : i.overrideCode, fields: E.clone(i.fields), checkerId: i.checkerId, approverId: i.approverId, makerNote: i.makerNote || '', editingId: id, preset: null };
          store.save();
          PCAP.app.render();
          window.scrollTo(0, 0);
        } else if (act === 'cancel') {
          store.cancelPayment(id, store.roleUserId('maker'));
          PCAP.app.render();
        }
      } catch (err) {
        U.toast(err.message || String(err), 'bad');
      }
    };
    el.onkeydown = function (e) {
      if (e.key === 'Enter' && e.target && e.target.id === 'rekey-input') {
        e.preventDefault();
        var btn = el.querySelector('[data-action="rekey"]');
        if (btn) btn.click();
      }
    };
  }

  views.desk = { render: render, PRESETS: PRESETS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
