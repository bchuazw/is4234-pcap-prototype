/*
 * PCAP rule engine (prototype, synthetic data only).
 *
 * Every control rule, R-01 to R-09, lives in this file, together with the M2
 * consequence statement, the tier logic, the Revlon replay and the seeded
 * synthetic test from report section 5.8.
 *
 * Pure functions only: no DOM, no storage and no clock. Callers pass the
 * business date in, so results are reproducible.
 *
 * Loads as a classic browser script (window.PCAP.engine) and in Node
 * (require('./js/engine.js')) so it can be unit tested with node --test.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  } else {
    root.PCAP = root.PCAP || {};
    root.PCAP.engine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Constants                                                           */
  /* ------------------------------------------------------------------ */

  var WASH = 'WASH';
  var LENDERS = 'LENDERS';
  var OVERRIDE_FIELDS = ['FRONT', 'FUND', 'PRINCIPAL'];

  var OPERATIONS = {
    INTEREST: { id: 'INTEREST', label: 'Interest payment (scheduled)', short: 'Interest', workaround: false },
    PRINCIPAL_AND_INTEREST: { id: 'PRINCIPAL_AND_INTEREST', label: 'Principal repayment with interest (scheduled)', short: 'Principal and interest', workaround: false },
    INTEREST_VIA_WASH: { id: 'INTEREST_VIA_WASH', label: 'Interest only, principal routed to the wash account (workaround)', short: 'Interest via wash account', workaround: true }
  };

  /* What a payment is, as the approver states it in the blind re-key (R-07) and as PCAP computes it. */
  var NATURES = {
    INTEREST: { id: 'INTEREST', label: 'Interest only' },
    PRINCIPAL_AND_INTEREST: { id: 'PRINCIPAL_AND_INTEREST', label: 'Principal and interest' },
    PRINCIPAL: { id: 'PRINCIPAL', label: 'Principal only' }
  };

  /* Why Operational Risk may release a Tier 3 hold. A release is a documented risk acceptance (L5). */
  var ACCEPT_CATEGORIES = ['False alarm, payment is correct', 'Approved business exception'];

  var DEFAULT_CONFIG = {
    toleranceAbs: 500,        // R-01: variance tolerance floor in USD
    tolerancePct: 0.001,      // R-01: or 0.1% of the expected amount, whichever is larger
    tier3Pct: 0.10,           // R-01: above 10% variance is Tier 3
    tier3Abs: 5000000,        // R-01: or above USD 5 million variance is Tier 3
    overrideFloorTier: 2,     // any valid override payment is at least Tier 2
    rekeyTolerance: 0.5,      // R-07: re-key must match to the nearest dollar
    fastLookSec: 8,           // R-08: a look at the consequence screen under 8 s is a "fast look"
    fastApproveSec: 5,        // R-08: a Tier 2 approval within 5 s of the warning
    r08MismatchCap: 0.20,     // R-08: a 20% first-attempt mismatch rate scores the full 30 points
    r08Amber: 25,             // R-08: amber at 25 or more
    r08Red: 50,               // R-08: red at 50 or more
    expiringDays: 30,         // R-09: certifications and dispensations expiring within 30 days are amber
    reviewRedDays: 30,        // R-09: register review overdue by more than 30 days is red
    regressionMaxDays: 31,    // R-09: replay regression test must run at least monthly
    reconCutoff: '18:00',     // R-09: same-day reconciliation cut-off
    m4MinTeam: 3,             // R-08: a team score is shown only for teams of at least 3 approvers (PDPA, no one singled out)
    reasonMinChars: 15        // Operational Risk decisions need a written reason of at least 15 characters
  };

  var MODULES = {
    M1: { id: 'M1', name: 'Workaround and Legacy Constraint Register', short: 'Register', group: 'Govern' },
    M2: { id: 'M2', name: 'Pre-Release Consequence Engine', short: 'Consequence Engine', group: 'Prevent' },
    M3: { id: 'M3', name: 'Authority and Independence Gate', short: 'Authority Gate', group: 'Prevent' },
    M4: { id: 'M4', name: 'Approval Behaviour Analytics', short: 'Behaviour Analytics', group: 'Detect' },
    M5: { id: 'M5', name: 'Compensating Control Monitor', short: 'Control Monitor', group: 'Detect' },
    M6: { id: 'M6', name: 'Obligation Map and Oversight Dashboard', short: 'Obligation Map', group: 'Govern' }
  };

  /* Table 6 of the report: rule IDs and names follow the report. */
  var RULES = {
    'R-01': { id: 'R-01', name: 'Variance', module: 'M2', obligations: ['O2'], screen: 'Payment desk',
      logic: 'Compares the amount PCAP computes will leave the bank with the amount the loan schedule expects on the value date, less anything already paid. Tolerance is the larger of USD 500 or 0.1% of the expected amount.',
      action: 'Beyond tolerance: Tier 2. Beyond 10% or USD 5 million, or nothing due: Tier 3 hard stop.' },
    'R-02': { id: 'R-02', name: 'Unscheduled principal', module: 'M2', obligations: ['O2'], screen: 'Payment desk',
      logic: 'Flags principal that would leave the bank when the schedule has no principal due on that date, or more principal than is due.',
      action: 'Tier 3 hard stop.' },
    'R-03': { id: 'R-03', name: 'Unregistered workaround', module: 'M1', obligations: ['O4', 'O6'], screen: 'Payment desk and M1 register',
      logic: 'Any override (an override code, a wash-account setting or the workaround operation) must match an active M1 register entry for this operation, with an in-date dispensation.',
      action: 'Tier 3 hard stop. Counted as unregistered override use.' },
    'R-04': { id: 'R-04', name: 'Incomplete workaround', module: 'M1', obligations: ['O4', 'O3'], screen: 'Payment desk and M1 register',
      logic: 'A registered workaround must have all its required fields set. WA-01 needs FRONT, FUND and PRINCIPAL set to the wash account.',
      action: 'Tier 3 hard stop. The consequence statement explains what will really happen.' },
    'R-05': { id: 'R-05', name: 'Certification', module: 'M3', obligations: ['O1', 'O3'], screen: 'Payment desk',
      logic: 'The approver must hold a current certification for the override type, and an approval limit at least equal to the amount PCAP computes will leave the bank (consequence-based entitlement).',
      action: 'M3 gate closes for this approver. Blocked attempt logged. Reassign to an entitled approver.' },
    'R-06': { id: 'R-06', name: 'Independence', module: 'M3', obligations: ['O5', 'O2'], screen: 'Payment desk',
      logic: 'The approver must not be the maker or checker, must not sit in their team or reporting line, and must be an in-house (Citi) employee for override payments.',
      action: 'M3 gate closes for this approver. Blocked attempt logged. Reassign to an independent in-house approver.' },
    'R-07': { id: 'R-07', name: 'Active confirmation', module: 'M2', obligations: ['O2'], screen: 'Payment desk (approver)',
      logic: 'At Tier 2 and 3 the approver re-keys the outgoing amount and says whether it is interest, principal or both, without seeing the maker\'s figure or the checker\'s note. PCAP compares both with what it computed.',
      action: 'First mismatch: re-check prompt, logged. Second mismatch: Tier 3 hard stop.' },
    'R-08': { id: 'R-08', name: 'Rubber-stamp score', module: 'M4', obligations: ['O2', 'O5'], screen: 'M4 analytics',
      logic: 'Weekly team score from 0 to 100. 40 points for fast looks at the consequence screen (under 8 seconds at Tier 2 and 3), 30 for re-key slips (the approver\'s own first figure was wrong, a 20% slip rate scores all 30), 30 for Tier 2 approvals within 5 seconds of the warning. Mismatches that end in an escalation count as catches, not slips.',
      action: 'Amber at 25, red at 50: second-line review of that team in the monthly report. Never blocks a payment. Team level by default.' },
    'R-09': { id: 'R-09', name: 'Control health', module: 'M5', obligations: ['O7', 'O6'], screen: 'M5 control monitor',
      logic: 'Checks that compensating controls ran: same-day independent reconciliation, register reviews and dispensations in date, approver certifications current, hard-stop queue cleared, replay regression test passing.',
      action: 'Red or amber status alerts the control owner and feeds the M6 KRIs.' }
  };

  /* Order in which the pre-release check shows rules: M1 register, then M3 gate, then M2 engine. */
  var RULE_ORDER = ['R-03', 'R-04', 'R-05', 'R-06', 'R-01', 'R-02', 'R-07'];

  var TIERS = {
    1: { id: 1, name: 'Tier 1', label: 'Routine', action: 'Normal release after the approver reads the consequence statement.' },
    2: { id: 2, name: 'Tier 2', label: 'Elevated', action: 'Extra confirmation: blind re-key of the amount, then an explicit confirmation of the consequence statement.' },
    3: { id: 3, name: 'Tier 3', label: 'Critical', action: 'Hard stop. Only Operational Risk (second line) can release it, by recording a risk acceptance with a reason, the first-line risk owner and an expiry.' }
  };

  /* ------------------------------------------------------------------ */
  /* Small helpers (dates are 'YYYY-MM-DD' strings, money is USD)        */
  /* ------------------------------------------------------------------ */

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function parseISO(s) { var p = String(s).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function toISO(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
  function addDays(s, n) { return toISO(parseISO(s) + n * 86400000); }
  function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
  function weekday(s) { return new Date(parseISO(s)).getUTCDay(); }
  function fmtDate(s) {
    if (!s) return 'n/a';
    var p = String(s).split('-');
    return (+p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0];
  }
  function round2(n) { return Math.round((+n || 0) * 100) / 100; }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function withCommas(intStr) { return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtUSD(n, opts) {
    n = +n || 0;
    var neg = n < 0;
    var cents = Math.round(Math.abs(n) * 100);
    var whole = Math.floor(cents / 100);
    var frac = cents % 100;
    var s = withCommas(String(whole));
    if (frac !== 0 || (opts && opts.cents)) s += '.' + pad2(frac);
    return (neg ? '-' : '') + 'USD ' + s;
  }
  function fmtCompact(n) {
    var a = Math.abs(+n || 0);
    var sign = n < 0 ? '-' : '';
    function t(x) { return (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, ''); }
    if (a >= 1e9) return sign + 'USD ' + t(a / 1e9) + 'B';
    if (a >= 1e6) return sign + 'USD ' + t(a / 1e6) + 'M';
    if (a >= 1e4) return sign + 'USD ' + t(a / 1e3) + 'K';
    return fmtUSD(n);
  }
  function fmtPct(p) {
    if (!isFinite(p)) return 'n/a';
    var v = p * 100;
    if (Math.abs(v) < 10) return (Math.round(v * 10) / 10).toFixed(1) + '%';
    return withCommas(String(Math.round(Math.abs(v)))).replace(/^/, v < 0 ? '-' : '') + '%';
  }
  function listAnd(arr) {
    if (!arr.length) return '';
    if (arr.length === 1) return arr[0];
    return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function median(arr) {
    var a = arr.filter(function (x) { return typeof x === 'number' && isFinite(x); }).slice().sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function mean(arr) {
    var a = arr.filter(function (x) { return typeof x === 'number' && isFinite(x); });
    if (!a.length) return null;
    return a.reduce(function (s, x) { return s + x; }, 0) / a.length;
  }
  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (src) for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    }
    return target;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function config(overrides) { return assign({}, DEFAULT_CONFIG, overrides || {}); }
  function byId(list, id) {
    if (!list || id == null) return null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function ragWorst(list) {
    var order = { green: 0, amber: 1, red: 2 };
    var w = 'green';
    list.forEach(function (r) { if (order[r] > order[w]) w = r; });
    return w;
  }
  function hashString(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  function hex8(n) { return ('00000000' + (n >>> 0).toString(16)).slice(-8); }

  /* Seeded random generator (mulberry32). Same seed, same sequence, in Node and in the browser. */
  function createRng(seed) {
    var a = toSeed(seed) || 0x9e3779b9;
    function next() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next: next,
      int: function (lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
      float: function (lo, hi) { return lo + next() * (hi - lo); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      chance: function (p) { return next() < p; },
      shuffle: function (arr) {
        var b = arr.slice();
        for (var i = b.length - 1; i > 0; i--) {
          var j = Math.floor(next() * (i + 1));
          var t = b[i]; b[i] = b[j]; b[j] = t;
        }
        return b;
      }
    };
  }
  function toSeed(seed) {
    if (typeof seed === 'number' && isFinite(seed)) return seed >>> 0;
    return hashString(String(seed == null ? '' : seed));
  }

  /* ------------------------------------------------------------------ */
  /* The Revlon replay (synthetic rebuild of 11 Aug 2020)                */
  /* ------------------------------------------------------------------ */

  var REPLAY = {
    loan: {
      id: 'LN-REV16',
      name: 'Revlon 2016 term loan (synthetic replay)',
      borrower: 'Revlon (replay of a public court case, synthetic figures)',
      lenders: 315,
      principalOutstanding: 893900000,
      replay: true,
      schedule: [
        { date: '2020-08-11', interest: 7820000, principal: 0, paidInterest: 0, paidPrincipal: 0, note: 'Accrued interest on the roll-up, off-cycle, notified to lenders. Principal is not due.' },
        { date: '2023-09-07', interest: 0, principal: 893900000, paidInterest: 0, paidPrincipal: 0, note: 'Maturity' }
      ]
    },
    /* The instruction as keyed: interest only intended, but only PRINCIPAL set to the wash account. */
    instruction: function (ids) {
      ids = ids || {};
      return {
        loanId: 'LN-REV16',
        operation: 'INTEREST_VIA_WASH',
        valueDate: '2020-08-11',
        interest: 7820000,
        principal: 893900000,
        overrideCode: 'WA-01',
        fields: { FRONT: LENDERS, FUND: LENDERS, PRINCIPAL: WASH },
        makerId: ids.makerId || 'U-MK1',
        checkerId: ids.checkerId || 'U-CK1',
        approverId: ids.approverId || 'U-AP1',
        makerNote: 'Interest only to lenders. Principal set to wash.',
        replay: true
      };
    },
    approverExpects: 7820000,
    approverExpectsNature: 'INTEREST',
    passRule: 'Pass only if R-01, R-02 and R-04 all fire, the payment is held at Tier 3 and the approver screen shows the principal amount (report 5.8).'
  };

  /* ------------------------------------------------------------------ */
  /* Context: turn the offset-based demo data into concrete dates        */
  /* ------------------------------------------------------------------ */

  function buildDemoContext(data, businessDate) {
    var bd = businessDate;
    function at(off) { return off == null ? null : addDays(bd, off); }
    var loans = data.loans.map(function (l) {
      var c = clone(l);
      c.schedule = l.schedule.map(function (s) {
        return { date: at(s.offset), interest: s.interest || 0, principal: s.principal || 0, paidInterest: s.paidInterest || 0, paidPrincipal: s.paidPrincipal || 0, note: s.note || '' };
      });
      return c;
    });
    loans.push(clone(REPLAY.loan));
    var users = data.users.map(function (u) {
      var c = clone(u);
      c.certs = (u.certs || []).map(function (x) { return { type: x.type, validUntil: at(x.validOffset) }; });
      return c;
    });
    var register = data.register.map(function (r) {
      var c = clone(r);
      c.inUseSince = at(r.inUseSinceOffset);
      c.lastReview = at(r.lastReviewOffset);
      c.nextReview = at(r.nextReviewOffset);
      c.dispensationUntil = at(r.dispensationOffset);
      c.retiredOn = at(r.retiredOffset);
      ['inUseSinceOffset', 'lastReviewOffset', 'nextReviewOffset', 'dispensationOffset', 'retiredOffset'].forEach(function (k) { delete c[k]; });
      return c;
    });
    var controls = (data.controls || []).map(function (x) {
      var c = clone(x);
      if (x.lastRunOffset != null) c.lastRun = at(x.lastRunOffset);
      delete c.lastRunOffset;
      return c;
    });
    return { businessDate: bd, loans: loans, users: users, register: register, controls: controls, obligations: clone(data.obligations || []) };
  }

  /* ------------------------------------------------------------------ */
  /* M2: consequence and schedule                                       */
  /* ------------------------------------------------------------------ */

  /* What the instruction will really do. The wash workaround only keeps principal
     inside the bank when FRONT, FUND and PRINCIPAL are all set to the wash account. */
  function computeConsequence(instr, loan) {
    var fields = instr.fields || {};
    var interest = round2(num(instr.interest));
    var principal = round2(num(instr.principal));
    var washSet = OVERRIDE_FIELDS.filter(function (f) { return fields[f] === WASH; });
    var washMissing = OVERRIDE_FIELDS.filter(function (f) { return fields[f] !== WASH; });
    var allWash = washMissing.length === 0;
    var extPrincipal = allWash ? 0 : principal;
    var intPrincipal = allWash ? principal : 0;
    return {
      externalInterest: interest,
      externalPrincipal: extPrincipal,
      internalPrincipal: intPrincipal,
      externalTotal: round2(interest + extPrincipal),
      lenders: loan ? loan.lenders : 0,
      washSet: washSet,
      washMissing: washMissing,
      allWash: allWash,
      partialWash: washSet.length > 0 && !allWash
    };
  }

  /* The nature of what leaves the bank: interest only, principal only, both, or nothing. */
  function natureOf(c) {
    if (!c || c.externalTotal <= 0) return 'NONE';
    if (c.externalPrincipal > 0 && c.externalInterest > 0) return 'PRINCIPAL_AND_INTEREST';
    if (c.externalPrincipal > 0) return 'PRINCIPAL';
    return 'INTEREST';
  }
  function natureLabel(n) { return NATURES[n] ? NATURES[n].label : n === 'NONE' ? 'Nothing' : String(n || ''); }

  function expectedFor(loan, date) {
    var line = null;
    if (loan && loan.schedule) {
      for (var i = 0; i < loan.schedule.length; i++) if (loan.schedule[i].date === date) { line = loan.schedule[i]; break; }
    }
    var r = { date: date, scheduled: !!line, note: line ? line.note || '' : '', interestDue: 0, principalDue: 0, paidInterest: 0, paidPrincipal: 0 };
    if (line) {
      r.interestDue = round2(line.interest || 0);
      r.principalDue = round2(line.principal || 0);
      r.paidInterest = round2(line.paidInterest || 0);
      r.paidPrincipal = round2(line.paidPrincipal || 0);
    }
    r.remainingInterest = Math.max(0, round2(r.interestDue - r.paidInterest));
    r.remainingPrincipal = Math.max(0, round2(r.principalDue - r.paidPrincipal));
    r.remainingTotal = round2(r.remainingInterest + r.remainingPrincipal);
    r.alreadyPaid = !!line && r.remainingTotal <= 0 && (r.paidInterest + r.paidPrincipal) > 0;
    r.nextPrincipal = null;
    if (loan && loan.schedule) {
      var future = loan.schedule.filter(function (l) { return l.date > date && (l.principal || 0) > 0; })
        .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (future.length) r.nextPrincipal = { date: future[0].date, amount: future[0].principal, note: future[0].note || '' };
    }
    return r;
  }

  /* Record a release against the schedule so a second payment of the same line shows as already paid. */
  function applyRelease(loan, date, c) {
    if (!loan || !loan.schedule) return;
    for (var i = 0; i < loan.schedule.length; i++) {
      var l = loan.schedule[i];
      if (l.date === date) {
        l.paidInterest = round2((l.paidInterest || 0) + c.externalInterest);
        l.paidPrincipal = round2((l.paidPrincipal || 0) + c.externalPrincipal);
        return;
      }
    }
  }

  function whenLabel(date, businessDate) {
    return date === businessDate ? 'today (' + fmtDate(date) + ')' : 'on ' + fmtDate(date);
  }

  /* The plain-language consequence statement (M2). */
  function consequenceStatement(c, exp, instr, businessDate) {
    var s = [];
    var when = whenLabel(exp.date, businessDate);
    var lenders = c.lenders + ' external lender' + (c.lenders === 1 ? '' : 's');
    if (c.externalTotal <= 0) {
      s.push('Nothing will leave the bank.');
    } else {
      var parts = [];
      if (c.externalPrincipal > 0) parts.push(fmtUSD(c.externalPrincipal) + ' of PRINCIPAL');
      if (c.externalInterest > 0) parts.push(fmtUSD(c.externalInterest) + ' of INTEREST');
      var first = 'This will send ' + parts.join(' and ') + ' to ' + lenders;
      if (parts.length > 1) first += ', ' + fmtUSD(c.externalTotal) + ' in total';
      s.push(first + '.');
    }
    if (c.internalPrincipal > 0) s.push(fmtUSD(c.internalPrincipal) + ' of PRINCIPAL stays inside the bank in the internal wash account.');
    if (c.partialWash && num(instr.principal) > 0) {
      s.push('Only ' + listAnd(c.washSet) + ' ' + (c.washSet.length === 1 ? 'is' : 'are') + ' set to the wash account. The workaround needs FRONT, FUND and PRINCIPAL, so the principal will still go to the lenders.');
    }
    if (!exp.scheduled) {
      s.push('The loan schedule has nothing due ' + when + '.');
    } else if (exp.alreadyPaid) {
      s.push('The loan schedule line for ' + fmtDate(exp.date) + ' is already paid.');
    } else {
      var due = [];
      if (exp.remainingPrincipal > 0) due.push(fmtUSD(exp.remainingPrincipal) + ' of PRINCIPAL');
      if (exp.remainingInterest > 0) due.push(fmtUSD(exp.remainingInterest) + ' of INTEREST');
      var line = 'The loan schedule expects ' + due.join(' and ') + ' ' + when;
      if (exp.remainingPrincipal <= 0) line += ' and no principal';
      s.push(line + '.');
    }
    var diff = round2(c.externalTotal - exp.remainingTotal);
    if (Math.abs(diff) < 0.005) s.push('This matches the schedule.');
    else s.push('That is ' + fmtUSD(Math.abs(diff)) + (diff > 0 ? ' more' : ' less') + ' than the schedule expects.');
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Rules R-01 to R-07 (payment level)                                  */
  /* ------------------------------------------------------------------ */

  function ruleR01Variance(c, exp, cfg) {
    var expected = exp.remainingTotal;
    var actual = c.externalTotal;
    var diff = round2(actual - expected);
    var abs = Math.abs(diff);
    var tol = round2(Math.max(cfg.toleranceAbs, expected * cfg.tolerancePct));
    var base = { rule: 'R-01', expected: expected, actual: actual, diff: diff, tolerance: tol };
    if (actual <= 0 && expected <= 0) return assign(base, { status: 'pass', message: 'Nothing leaves the bank and nothing is due.' });
    if (abs < 0.005) {
      return assign(base, { status: 'pass', message: 'Outgoing ' + fmtUSD(actual) + ' matches the ' + fmtUSD(expected) + ' the schedule expects.' });
    }
    if (abs <= tol) {
      return assign(base, { status: 'pass', message: 'Outgoing ' + fmtUSD(actual) + ' is ' + fmtUSD(abs) + ' off the ' + fmtUSD(expected) + ' the schedule expects, inside the ' + fmtUSD(tol) + ' tolerance.' });
    }
    var pct = expected > 0 ? abs / expected : Infinity;
    var tier = (expected <= 0 || pct > cfg.tier3Pct || abs > cfg.tier3Abs) ? 3 : 2;
    var msg;
    if (expected <= 0) {
      msg = exp.alreadyPaid
        ? 'The schedule line for ' + fmtDate(exp.date) + ' is already paid, but ' + fmtUSD(actual) + ' would go out again.'
        : 'Nothing is due on ' + fmtDate(exp.date) + ', but ' + fmtUSD(actual) + ' would go out.';
    } else {
      msg = 'Outgoing ' + fmtUSD(actual) + ' is ' + fmtUSD(abs) + (diff > 0 ? ' more' : ' less') + ' than the ' + fmtUSD(expected) + ' the schedule expects (' + (diff > 0 ? '+' : '-') + fmtPct(pct) + ').';
    }
    return assign(base, { status: 'fire', tier: tier, pct: pct, message: msg });
  }

  function ruleR02UnscheduledPrincipal(c, exp, cfg) {
    var due = exp.remainingPrincipal;
    var out = c.externalPrincipal;
    var tol = Math.max(cfg.toleranceAbs, due * cfg.tolerancePct);
    if (out <= 0) return { rule: 'R-02', status: 'pass', message: 'No principal leaves the bank.' };
    var excess = round2(out - due);
    if (excess <= tol) return { rule: 'R-02', status: 'pass', message: fmtUSD(out) + ' of principal matches the principal due.' };
    var msg = due > 0
      ? fmtUSD(out) + ' of principal would leave the bank, but only ' + fmtUSD(due) + ' is due on ' + fmtDate(exp.date) + '.'
      : fmtUSD(out) + ' of principal would leave the bank, but no principal is due on ' + fmtDate(exp.date) + '.';
    if (exp.nextPrincipal && due <= 0) msg += ' Next principal due: ' + fmtDate(exp.nextPrincipal.date) + (exp.nextPrincipal.note ? ' (' + exp.nextPrincipal.note.toLowerCase() + ')' : '') + '.';
    return { rule: 'R-02', status: 'fire', tier: 3, excess: excess, message: msg };
  }

  function resolveOverride(instr, register, businessDate) {
    var fields = instr.fields || {};
    var washSet = OVERRIDE_FIELDS.filter(function (f) { return fields[f] === WASH; });
    var code = String(instr.overrideCode || '').trim();
    var op = OPERATIONS[instr.operation];
    var used = !!code || washSet.length > 0 || !!(op && op.workaround);
    var entry = code ? byId(register, code) : null;
    var problems = [];
    if (used) {
      if (!code) {
        problems.push(washSet.length ? 'Wash-account settings are used but no workaround is declared.' : 'The workaround operation is used but no register entry is declared.');
      } else if (!entry) {
        problems.push('Override "' + code + '" is not in the M1 register.');
      } else {
        if (entry.status === 'Retired') problems.push(entry.id + ' is retired' + (entry.retiredOn ? ' (since ' + fmtDate(entry.retiredOn) + ')' : '') + '.');
        else if (entry.status === 'Proposed') problems.push(entry.id + ' is only proposed. Its owner has not approved it.');
        else if (entry.status !== 'Active') problems.push(entry.id + ' is not active.');
        if (entry.status === 'Active' && entry.dispensationUntil && entry.dispensationUntil < businessDate) problems.push(entry.id + ' dispensation expired on ' + fmtDate(entry.dispensationUntil) + '.');
        if (entry.status === 'Active' && entry.appliesTo && entry.appliesTo.indexOf(instr.operation) < 0) problems.push(entry.id + ' is not approved for this operation.');
      }
    }
    return { used: used, code: code, entry: entry, entryId: entry ? entry.id : null, washSet: washSet, valid: used && problems.length === 0, problems: problems };
  }

  function ruleR03Unregistered(ov, users) {
    if (!ov.used) return { rule: 'R-03', status: 'na', message: 'No override used.' };
    if (ov.valid) {
      var owner = byId(users, ov.entry.ownerId);
      return { rule: 'R-03', status: 'pass', message: ov.entry.id + ' is an active register entry' + (owner ? ', owned by ' + owner.name + ' (' + owner.title + ')' : '') + '.' };
    }
    return { rule: 'R-03', status: 'fire', tier: 3, message: ov.problems.join(' ') };
  }

  function ruleR04Incomplete(instr, ov) {
    if (!ov.used) return { rule: 'R-04', status: 'na', message: 'No override used.' };
    if (!ov.entry) return { rule: 'R-04', status: 'na', message: 'No register entry to check the fields against (see R-03).' };
    var req = ov.entry.requiredFields || [];
    var val = ov.entry.requiredValue || WASH;
    var fields = instr.fields || {};
    var missing = req.filter(function (f) { return fields[f] !== val; });
    if (!missing.length) return { rule: 'R-04', status: 'pass', missing: [], message: 'All required fields are set: ' + listAnd(req) + '.' };
    return { rule: 'R-04', status: 'fire', tier: 3, missing: missing,
      message: ov.entry.id + ' needs ' + listAnd(req) + ' set to the wash account. Not set: ' + listAnd(missing) + '.' };
  }

  function ruleR05Certification(approver, ov, c, businessDate) {
    if (!approver) return { rule: 'R-05', status: 'fire', gate: true, message: 'No approver assigned.' };
    var problems = [];
    if ((approver.roles || []).indexOf('approver') < 0) problems.push(approver.name + ' does not hold the approver role.');
    if (ov.used && ov.valid) {
      var type = ov.entry.certType || ov.entry.id;
      var cert = null;
      (approver.certs || []).forEach(function (x) { if (x.type === type) cert = x; });
      if (!cert) problems.push(approver.name + ' is not certified for ' + type + '.');
      else if (cert.validUntil && cert.validUntil < businessDate) problems.push(approver.name + '\'s ' + type + ' certification expired on ' + fmtDate(cert.validUntil) + '.');
    }
    if ((approver.approvalLimit || 0) < c.externalTotal) {
      problems.push(approver.name + '\'s approval limit (' + fmtUSD(approver.approvalLimit || 0) + ') is below the ' + fmtUSD(c.externalTotal) + ' this payment would send.');
    }
    if (problems.length) return { rule: 'R-05', status: 'fire', gate: true, message: problems.join(' ') };
    var okMsg = approver.name + ' holds an approval limit of ' + fmtCompact(approver.approvalLimit) + ', above the ' + fmtCompact(c.externalTotal) + ' this payment would send';
    if (ov.used && ov.valid) okMsg += ', and a current ' + (ov.entry.certType || ov.entry.id) + ' certification';
    return { rule: 'R-05', status: 'pass', message: okMsg + '.' };
  }

  function ruleR06Independence(maker, checker, approver, ov) {
    if (!approver) return { rule: 'R-06', status: 'fire', gate: true, message: 'No approver assigned.' };
    var problems = [];
    if (maker && approver.id === maker.id) problems.push('The approver is the maker.');
    if (checker && approver.id === checker.id) problems.push('The approver is the checker.');
    if (maker && checker && maker.id === checker.id) problems.push('The maker also checked the payment.');
    var team = [];
    if (maker && maker.id !== approver.id && maker.team === approver.team) team.push('maker');
    if (checker && checker.id !== approver.id && checker.team === approver.team) team.push('checker');
    if (team.length) problems.push(approver.name + ' sits in the same team as the ' + listAnd(team) + ' (' + approver.team + ').');
    var line = [];
    [maker, checker].forEach(function (u, i) {
      if (!u || u.id === approver.id) return;
      if (u.reportsTo === approver.id || approver.reportsTo === u.id) line.push(i === 0 ? 'maker' : 'checker');
    });
    if (line.length) problems.push(approver.name + ' is in the reporting line of the ' + listAnd(line) + '.');
    if (ov.used && !approver.inHouse) problems.push('Override payments need an in-house (Citi) approver. ' + approver.name + ' works for ' + approver.employer + '.');
    if (problems.length) return { rule: 'R-06', status: 'fire', gate: true, message: problems.join(' ') };
    return { rule: 'R-06', status: 'pass', message: approver.name + ' (' + approver.employer + ', ' + approver.team + ') is independent of the maker and checker' + (ov.used ? ' and in-house, as override payments require' : '') + '.' };
  }

  /* R-07: compare the approver's blind re-key with what PCAP computed.
     An attempt is an amount, or { amount, nature } where nature is INTEREST, PRINCIPAL_AND_INTEREST or PRINCIPAL.
     When the approver states the nature, it must match too (report 3.1.4: amount and nature). */
  function rekeyResult(ev, attempts, cfg) {
    cfg = config(cfg);
    var target = ev.consequence.externalTotal;
    var computed = natureOf(ev.consequence);
    var checks = (attempts || []).map(function (a) {
      var x = a !== null && typeof a === 'object' ? a : { amount: a };
      var amount = round2(num(x.amount));
      var diff = round2(amount - target);
      var amountMatch = Math.abs(diff) <= cfg.rekeyTolerance;
      var natureMatch = !x.nature || x.nature === computed;
      return { amount: amount, nature: x.nature || null, diff: diff, amountMatch: amountMatch, natureMatch: natureMatch, match: amountMatch && natureMatch };
    });
    if (!checks.length) return { rule: 'R-07', status: 'pending', checks: [], computedNature: computed, message: 'Waiting for the approver to re-key the amount.' };
    if (checks[0].match) return { rule: 'R-07', status: 'pass', firstMatch: true, checks: checks, computedNature: computed, message: 'Re-keyed amount' + (checks[0].nature ? ' and payment type match' : ' matches') + ' what PCAP computed on the first attempt.' };
    if (checks.length < 2) return { rule: 'R-07', status: 'retry', firstMatch: false, checks: checks, computedNature: computed, message: 'Your ' + mismatchWhat(checks[0]) + ' does not match what this instruction will send. Check your source and re-key once more. A second mismatch sends the payment to Operational Risk.' };
    if (checks[1].match) return { rule: 'R-07', status: 'pass', firstMatch: false, checks: checks, computedNature: computed, message: 'Matched on the second attempt. The first attempt is logged as a mismatch.' };
    var said = fmtUSD(checks[1].amount) + (checks[1].nature ? ' (' + natureLabel(checks[1].nature).toLowerCase() + ')' : '');
    var will = fmtUSD(target) + (checks[1].nature ? ' (' + natureLabel(computed).toLowerCase() + ')' : '');
    return { rule: 'R-07', status: 'fire', tier: 3, firstMatch: false, checks: checks, computedNature: computed,
      message: 'The approver expected ' + said + ' but this instruction would send ' + will + '. Escalated to Tier 3.' };
  }
  function mismatchWhat(chk) {
    if (!chk.amountMatch && !chk.natureMatch) return 'amount and payment type';
    return chk.amountMatch ? 'payment type' : 'figure';
  }

  /* Apply an R-07 outcome to an evaluation and recompute the tier. */
  function withRekey(ev, rk) {
    var out = assign({}, ev);
    out.results = assign({}, ev.results);
    out.results['R-07'] = rk;
    out.hits = ev.hits.slice();
    out.tierReasons = ev.tierReasons.slice();
    if (rk.status === 'fire') {
      if (out.hits.indexOf('R-07') < 0) out.hits.push('R-07');
      out.tierReasons.push('R-07 Active confirmation: ' + rk.message);
      out.tier = 3;
    }
    out.outcome = out.tier === 3 ? 'HARD_STOP' : out.tier === 2 ? 'ELEVATED' : 'ROUTINE';
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* The pre-release check: runs M1 register rules, M3 gate and M2       */
  /* ------------------------------------------------------------------ */

  function evaluate(instr, ctx) {
    var cfg = config(ctx.config);
    var bd = ctx.businessDate;
    var loan = byId(ctx.loans, instr.loanId);
    var c = computeConsequence(instr, loan);
    var exp = expectedFor(loan, instr.valueDate);
    var ov = resolveOverride(instr, ctx.register, bd);
    var maker = byId(ctx.users, instr.makerId);
    var checker = byId(ctx.users, instr.checkerId);
    var approver = byId(ctx.users, instr.approverId);

    var results = {};
    results['R-03'] = ruleR03Unregistered(ov, ctx.users);
    results['R-04'] = ruleR04Incomplete(instr, ov);
    results['R-05'] = ruleR05Certification(approver, ov, c, bd);
    results['R-06'] = ruleR06Independence(maker, checker, approver, ov);
    results['R-01'] = ruleR01Variance(c, exp, cfg);
    results['R-02'] = ruleR02UnscheduledPrincipal(c, exp, cfg);

    var tier = 1;
    var reasons = [];
    if (ov.used && ov.valid && cfg.overrideFloorTier > tier) {
      tier = cfg.overrideFloorTier;
      reasons.push('Override ' + ov.entry.id + ' in use, so at least Tier ' + cfg.overrideFloorTier + ' (extra confirmation).');
    }
    var hits = [];
    RULE_ORDER.forEach(function (k) {
      var r = results[k];
      if (!r || r.status !== 'fire') return;
      hits.push(k);
      if (r.tier) {
        if (r.tier > tier) tier = r.tier;
        reasons.push(k + ' ' + RULES[k].name + ': ' + r.message);
      }
    });
    results['R-07'] = tier >= 2
      ? { rule: 'R-07', status: 'pending', message: 'At Tier ' + tier + ' the approver must re-key the outgoing amount blind.' }
      : { rule: 'R-07', status: 'na', message: 'Not needed at Tier 1.' };

    var gateFailures = ['R-05', 'R-06'].filter(function (k) { return results[k].status === 'fire'; });
    var statement = consequenceStatement(c, exp, instr, bd);
    return {
      instrId: instr.id || null,
      loan: loan ? { id: loan.id, name: loan.name, borrower: loan.borrower, lenders: loan.lenders, replay: !!loan.replay } : null,
      operation: instr.operation,
      valueDate: instr.valueDate,
      businessDate: bd,
      consequence: c,
      expected: exp,
      override: { used: ov.used, code: ov.code, entryId: ov.entryId, valid: ov.valid, problems: ov.problems },
      results: results,
      order: RULE_ORDER.slice(),
      hits: hits,
      tier: tier,
      tierReasons: reasons,
      gate: { open: gateFailures.length === 0, failures: gateFailures },
      requiresRekey: tier >= 2,
      outcome: tier === 3 ? 'HARD_STOP' : tier === 2 ? 'ELEVATED' : 'ROUTINE',
      statement: statement
    };
  }

  /* ------------------------------------------------------------------ */
  /* Releasing a Tier 3 hold: a documented risk acceptance (L5 slide 41) */
  /* ------------------------------------------------------------------ */

  /* The first line owns the risk, Operational Risk (second line) challenges and records it,
     Internal Audit (third line) reviews it. The acceptance covers one payment and ends with
     the business day, so it can never be reused as a standing approval.
     input: { paymentId, ev, category, reason, ownerId, recordedById, users, businessDate, makerId, checkerId, approverId } */
  function riskAcceptance(input, cfgIn) {
    var cfg = config(cfgIn);
    var problems = [];
    var reason = String(input.reason || '').trim();
    var owner = byId(input.users, input.ownerId);
    var recorder = byId(input.users, input.recordedById);
    if (reason.length < cfg.reasonMinChars) problems.push('Record a reason of at least ' + cfg.reasonMinChars + ' characters.');
    if (ACCEPT_CATEGORIES.indexOf(input.category) < 0) problems.push('Choose why it is released: false alarm or approved business exception.');
    if (!recorder || (recorder.roles || []).indexOf('oprisk') < 0) problems.push('Only Operational Risk (second line) can record the acceptance and release a Tier 3 hold.');
    if (!owner) problems.push('Name the first-line risk owner who accepts the risk.');
    else {
      if ((owner.roles || []).indexOf('owner') < 0) problems.push(owner.name + ' is not a first-line risk owner.');
      if (!owner.inHouse) problems.push('The risk owner must be a bank employee, not the outsourced provider.');
      if ([input.makerId, input.checkerId, input.approverId, input.recordedById].indexOf(owner.id) >= 0) problems.push(owner.name + ' took part in this payment, so cannot also accept its risk.');
    }
    if (problems.length) return { ok: false, problems: problems };
    var ev = input.ev;
    var falseAlarm = input.category === ACCEPT_CATEGORIES[0];
    return {
      ok: true,
      problems: [],
      record: {
        paymentId: input.paymentId,
        category: input.category,
        reason: reason,
        ownerId: owner.id,
        recordedById: recorder.id,
        acceptedOn: input.businessDate,
        expires: input.businessDate,
        scope: 'This payment only. Expires at the end of the business day and cannot be reused for another payment.',
        followUp: falseAlarm
          ? 'Correct the loan schedule line so the next payment matches it (data quality). Owner: ' + owner.name
          : 'Record the exception in the loan schedule or the M1 register so it does not recur. Owner: ' + owner.name,
        assessed: ev ? { tier: ev.tier, rules: ev.hits.slice(), external: ev.consequence.externalTotal, principalOut: ev.consequence.externalPrincipal, expected: ev.expected.remainingTotal, variance: round2(ev.consequence.externalTotal - ev.expected.remainingTotal) } : null
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* M4: outsourced checks at team level (MAS Notice 658 monitoring)     */
  /* ------------------------------------------------------------------ */

  /* rows: [{ team, kind: 'keyed'|'checked'|'returned', tier }]. Tier is PCAP's tier when the step happened. */
  function summariseOutsourced(rows) {
    var by = {};
    (rows || []).forEach(function (r) {
      var t = by[r.team] = by[r.team] || { team: r.team, keyed: 0, keyedTier3: 0, checked: 0, sentOnTier3: 0, returned: 0 };
      if (r.kind === 'keyed') { t.keyed += 1; if (r.tier === 3) t.keyedTier3 += 1; }
      if (r.kind === 'checked') { t.checked += 1; if (r.tier === 3) t.sentOnTier3 += 1; }
      if (r.kind === 'returned') t.returned += 1;
    });
    return Object.keys(by).sort().map(function (k) { return by[k]; });
  }

  /* A team score is only reported for teams big enough that it cannot point at one person. */
  function teamReportable(approverCount, cfgIn) {
    return approverCount >= config(cfgIn).m4MinTeam;
  }

  /* ------------------------------------------------------------------ */
  /* R-08 Rubber-stamp score (M4)                                        */
  /* ------------------------------------------------------------------ */

  function rubberStampScore(sig, cfgIn) {
    var cfg = config(cfgIn);
    var fl = clamp01(sig.fastLookShare || 0);
    var mm = clamp01((sig.mismatchRate || 0) / cfg.r08MismatchCap);
    var fa = clamp01(sig.fastApproveShare || 0);
    var parts = { fastLook: 40 * fl, mismatch: 30 * mm, fastApprove: 30 * fa };
    var score = Math.round(parts.fastLook + parts.mismatch + parts.fastApprove);
    return {
      score: score,
      rag: score >= cfg.r08Red ? 'red' : score >= cfg.r08Amber ? 'amber' : 'green',
      parts: { fastLook: Math.round(parts.fastLook), mismatch: Math.round(parts.mismatch), fastApprove: Math.round(parts.fastApprove) }
    };
  }

  /* Classify one blind re-key for M4.
     match: first attempt matched.
     slip:  first attempt wrong, second matched (the approver's own figure was wrong).
     catch: both attempts disagreed with the payment, so it was escalated (the control working).
     Only slips count against the approver in R-08. */
  function rekeyKind(rk) {
    if (!rk || rk.status === 'pending' || rk.status === 'na' || rk.status === 'retry') return null;
    if (rk.status === 'fire') return 'catch';
    return rk.firstMatch ? 'match' : 'slip';
  }

  /* reviews: [{ tier, dwellSec, rekey: 'match'|'slip'|'catch'|null, decision: 'approve'|'escalate'|'return' }] */
  function summariseReviews(reviews, cfgIn) {
    var cfg = config(cfgIn);
    var t23 = reviews.filter(function (r) { return r.tier >= 2; });
    var rekeys = reviews.filter(function (r) { return r.rekey === 'match' || r.rekey === 'slip' || r.rekey === 'catch'; });
    var slips = rekeys.filter(function (r) { return r.rekey === 'slip'; }).length;
    var catches = rekeys.filter(function (r) { return r.rekey === 'catch'; }).length;
    var t2approve = reviews.filter(function (r) { return r.tier === 2 && r.decision === 'approve'; });
    var sig = {
      n: reviews.length,
      nTier23: t23.length,
      nRekeys: rekeys.length,
      nSlips: slips,
      nCatches: catches,
      nTier2Approvals: t2approve.length,
      fastLookShare: t23.length ? t23.filter(function (r) { return r.dwellSec < cfg.fastLookSec; }).length / t23.length : 0,
      mismatchRate: rekeys.length ? slips / rekeys.length : 0,
      catchRate: rekeys.length ? catches / rekeys.length : 0,
      firstAttemptMismatchRate: rekeys.length ? (slips + catches) / rekeys.length : 0,
      fastApproveShare: t2approve.length ? t2approve.filter(function (r) { return r.dwellSec < cfg.fastApproveSec; }).length / t2approve.length : 0,
      medianDwellSec: median(reviews.map(function (r) { return r.dwellSec; })),
      medianDwellTier23Sec: median(t23.map(function (r) { return r.dwellSec; }))
    };
    return assign(sig, rubberStampScore(sig, cfg));
  }

  /* ------------------------------------------------------------------ */
  /* M5: same-day reconciliation and R-09 Control health                 */
  /* ------------------------------------------------------------------ */

  /* payments need: id, loanId, status, releasedDate, releasedExternal, expectedAtRelease */
  function reconcile(payments, date) {
    var rows = payments.filter(function (p) { return p.status === 'RELEASED' && p.releasedDate === date; }).map(function (p) {
      var diff = round2((p.releasedExternal || 0) - (p.expectedAtRelease || 0));
      return { id: p.id, loanId: p.loanId, released: p.releasedExternal || 0, expected: p.expectedAtRelease || 0, diff: diff, isBreak: Math.abs(diff) >= 0.01, releasedBy: p.releasedBy || null };
    });
    var breaks = rows.filter(function (r) { return r.isBreak; });
    return { date: date, rows: rows, breaks: breaks.length, breakTotal: round2(breaks.reduce(function (s, r) { return s + Math.abs(r.diff); }, 0)) };
  }

  function involvedIn(payments, userId, date) {
    return payments.some(function (p) {
      return p.releasedDate === date && (p.makerId === userId || p.checkerId === userId || p.approverId === userId);
    });
  }

  /* input: { businessDate, nowTime 'HH:MM', register, users, payments, reconRuns, regressionRuns, approvals } */
  function controlHealth(input, cfgIn) {
    var cfg = config(cfgIn);
    var bd = input.businessDate;
    var now = input.nowTime || '12:00';
    var payments = input.payments || [];
    var out = [];

    /* CC-01 same-day independent reconciliation */
    (function () {
      var rel = payments.filter(function (p) { return p.status === 'RELEASED' && p.releasedDate === bd; });
      var runs = (input.reconRuns || []).filter(function (r) { return r.date === bd; });
      var last = runs[runs.length - 1];
      var late = now > cfg.reconCutoff;
      var lastRelease = rel.reduce(function (m, p) { return p.releasedTime > m ? p.releasedTime : m; }, '00:00');
      var rag, msg;
      if (!rel.length) { rag = 'green'; msg = 'Nothing released today yet.'; }
      else if (!last) { rag = late ? 'red' : 'amber'; msg = late ? 'Not run by the ' + cfg.reconCutoff + ' cut-off.' : rel.length + ' payment' + (rel.length === 1 ? '' : 's') + ' released today. Not reconciled yet (due by ' + cfg.reconCutoff + ').'; }
      else if (!last.independent) { rag = 'red'; msg = 'Last run by someone involved in today\'s payments. It must be independent of the maker.'; }
      else if (last.breaks > 0) { rag = 'red'; msg = last.breaks + ' break' + (last.breaks === 1 ? '' : 's') + ' found at ' + last.time + ', total ' + fmtUSD(last.breakTotal) + '. Investigate and escalate.'; }
      else if (last.time < lastRelease) { rag = late ? 'red' : 'amber'; msg = 'Payments released since the last run at ' + last.time + '. Run again.'; }
      else { rag = 'green'; msg = 'Reconciled ' + last.rows + ' payment' + (last.rows === 1 ? '' : 's') + ' at ' + last.time + '. No breaks.'; }
      out.push({ id: 'CC-01', rag: rag, message: msg });
    })();

    /* CC-02 register reviews on time */
    (function () {
      var active = (input.register || []).filter(function (r) { return r.status === 'Active'; });
      var overdue = active.filter(function (r) { return r.nextReview && r.nextReview < bd; })
        .map(function (r) { return { id: r.id, days: daysBetween(r.nextReview, bd) }; });
      var rag = 'green', msg = 'All ' + active.length + ' active entries reviewed on time.';
      if (overdue.length) {
        var worst = Math.max.apply(null, overdue.map(function (o) { return o.days; }));
        rag = worst > cfg.reviewRedDays ? 'red' : 'amber';
        msg = overdue.map(function (o) { return o.id + ' review overdue by ' + o.days + ' day' + (o.days === 1 ? '' : 's'); }).join('. ') + '.';
      }
      out.push({ id: 'CC-02', rag: rag, message: msg, overdue: overdue });
    })();

    /* CC-03 dispensations in date */
    (function () {
      var active = (input.register || []).filter(function (r) { return r.status === 'Active' && r.dispensationUntil; });
      var expired = active.filter(function (r) { return r.dispensationUntil < bd; });
      var soon = active.filter(function (r) { return r.dispensationUntil >= bd && daysBetween(bd, r.dispensationUntil) <= cfg.expiringDays; });
      var rag = 'green', msg = 'All ' + active.length + ' dispensations in date.';
      if (expired.length) { rag = 'red'; msg = expired.map(function (r) { return r.id + ' dispensation expired on ' + fmtDate(r.dispensationUntil); }).join('. ') + '.'; }
      else if (soon.length) { rag = 'amber'; msg = soon.map(function (r) { return r.id + ' dispensation expires in ' + daysBetween(bd, r.dispensationUntil) + ' days'; }).join('. ') + '.'; }
      out.push({ id: 'CC-03', rag: rag, message: msg, expired: expired.map(function (r) { return r.id; }), expiring: soon.map(function (r) { return r.id; }) });
    })();

    /* CC-04 approver certifications current */
    (function () {
      var approvers = (input.users || []).filter(function (u) { return (u.roles || []).indexOf('approver') >= 0; });
      var lapsed = [], soon = [];
      approvers.forEach(function (u) {
        (u.certs || []).forEach(function (c) {
          if (!c.validUntil) return;
          if (c.validUntil < bd) lapsed.push(u.name + ' (' + c.type + ', lapsed ' + daysBetween(c.validUntil, bd) + ' days ago)');
          else if (daysBetween(bd, c.validUntil) <= cfg.expiringDays) soon.push(u.name + ' (' + c.type + ', expires in ' + daysBetween(bd, c.validUntil) + ' days)');
        });
      });
      var badApprovals = (input.approvals || []).filter(function (a) { return a.override && !a.certCurrent; });
      var rag = 'green', msg = 'All approver certifications current.';
      if (badApprovals.length) { rag = 'red'; msg = badApprovals.length + ' override approval' + (badApprovals.length === 1 ? '' : 's') + ' by an approver without a current certification. The gate failed.'; }
      else if (lapsed.length || soon.length) {
        rag = 'amber';
        msg = (lapsed.length ? 'Lapsed: ' + lapsed.join(', ') + '. The M3 gate blocks their override approvals. ' : '') + (soon.length ? 'Expiring: ' + soon.join(', ') + '.' : '');
      }
      out.push({ id: 'CC-04', rag: rag, message: msg.trim(), lapsed: lapsed.length, expiring: soon.length });
    })();

    /* CC-05 hard-stop queue cleared the same day */
    (function () {
      var held = payments.filter(function (p) { return p.status === 'HELD'; });
      var old = held.filter(function (p) { return p.heldDate && p.heldDate < bd; });
      var rag = 'green', msg = 'No Tier 3 holds waiting.';
      if (old.length) { rag = 'red'; msg = old.length + ' Tier 3 hold' + (old.length === 1 ? '' : 's') + ' older than today.'; }
      else if (held.length) { rag = 'amber'; msg = held.length + ' Tier 3 hold' + (held.length === 1 ? '' : 's') + ' waiting for Operational Risk today.'; }
      out.push({ id: 'CC-05', rag: rag, message: msg });
    })();

    /* CC-06 Revlon replay regression test */
    (function () {
      var runs = input.regressionRuns || [];
      var last = runs[runs.length - 1];
      var rag, msg;
      if (!last) { rag = 'amber'; msg = 'Never run.'; }
      else if (!last.pass) { rag = 'red'; msg = 'Last run on ' + fmtDate(last.date) + ' failed: ' + (last.detail || 'replay not stopped at Tier 3') + '.'; }
      else if (daysBetween(last.date, bd) > cfg.regressionMaxDays) { rag = 'amber'; msg = 'Overdue. Last passed on ' + fmtDate(last.date) + '.'; }
      else {
        var ago = daysBetween(last.date, bd);
        rag = 'green';
        msg = ago === 0 ? 'Passed today.' : 'Passed on ' + fmtDate(last.date) + ' (' + ago + ' day' + (ago === 1 ? '' : 's') + ' ago).';
      }
      out.push({ id: 'CC-06', rag: rag, message: msg });
    })();

    return { controls: out, overall: ragWorst(out.map(function (x) { return x.rag; })) };
  }

  /* The replay as a regression test (used by M5 CC-06, the synthetic test and the unit tests). */
  function replayCheck(ctx, ids) {
    var instr = REPLAY.instruction(ids);
    var ev = evaluate(instr, ctx);
    var said = { amount: REPLAY.approverExpects, nature: REPLAY.approverExpectsNature };
    var rk = rekeyResult(ev, [said, said], ctx.config);
    var after = withRekey(ev, rk);
    var principalShown = after.statement.join(' ').indexOf(fmtUSD(REPLAY.loan.principalOutstanding) + ' of PRINCIPAL') >= 0;
    var need = ['R-01', 'R-02', 'R-04'];
    var missing = need.filter(function (k) { return after.hits.indexOf(k) < 0; });
    var pass = missing.length === 0 && after.tier === 3 && principalShown;
    var detail = pass ? 'R-01, R-02 and R-04 fired, held at Tier 3, principal shown' :
      (missing.length ? 'Missing ' + missing.join(', ') + '. ' : '') + (after.tier !== 3 ? 'Tier ' + after.tier + ' instead of 3. ' : '') + (!principalShown ? 'Principal amount not shown.' : '');
    return { pass: pass, tier: after.tier, hits: after.hits, rekey: rk, statement: after.statement, principalShown: principalShown, detail: detail.trim(), evaluation: after };
  }

  /* ------------------------------------------------------------------ */
  /* Synthetic test (report 5.8): 500 payments, about 5% injected errors */
  /* ------------------------------------------------------------------ */

  var ERROR_TYPES = [
    { id: 'WA_FIELD_MISSING', label: 'Missing FRONT or FUND on the wash workaround', cls: 'T3', targets: ['R-04', 'R-02', 'R-01'] },
    { id: 'EXTRA_ZERO', label: 'Extra zero on the amount', cls: 'T3', targets: ['R-01'] },
    { id: 'UNSCHEDULED_PRINCIPAL', label: 'Unscheduled principal included', cls: 'T3', targets: ['R-02', 'R-01'] },
    { id: 'UNREGISTERED_OVERRIDE', label: 'Unregistered or retired override', cls: 'T3', targets: ['R-03'] },
    { id: 'WRONG_VALUE_DATE', label: 'Wrong value date (nothing due that day)', cls: 'T3', targets: ['R-01'] },
    { id: 'DUPLICATE', label: 'Duplicate of a payment already released', cls: 'T3', targets: ['R-01'] },
    { id: 'UNCERTIFIED_APPROVER', label: 'Approver not certified for the override', cls: 'GATE', targets: ['R-05'] },
    { id: 'NOT_INDEPENDENT_APPROVER', label: 'Approver not independent (maker\'s team)', cls: 'GATE', targets: ['R-06'] },
    { id: 'AMOUNT_SLIP_SMALL', label: 'Amount slip of 2% to 8%', cls: 'T2', targets: ['R-01', 'R-07'] },
    { id: 'AMOUNT_SLIP_TINY', label: 'Amount slip under USD 500 (inside tolerance)', cls: 'BELOW', targets: ['R-09'] }
  ];

  var ERROR_CLASSES = {
    T3: { id: 'T3', label: 'Tier 3 errors', note: 'Should be held at Tier 3 every time (target 100%).' },
    GATE: { id: 'GATE', label: 'M3 gate errors', note: 'Should be blocked at the Authority and Independence Gate.' },
    T2: { id: 'T2', label: 'Tier 2 errors', note: 'Flagged at Tier 2, then stopped if the blind re-key disagrees.' },
    BELOW: { id: 'BELOW', label: 'Below tolerance', note: 'Inside the R-01 tolerance, so not expected to be stopped before release. M5 should find them the same day.' }
  };

  /* Assumed approver behaviour and timings (seconds). These are modelling assumptions, not measurements. */
  var TIME_MODEL = {
    normal: { readT1: [5, 15], readT23: [10, 30], rekey: [15, 40], confirm: [3, 8], retry: [20, 40], slip: 0.02 },
    rubber: { readT1: [1, 4], readT23: [1, 6], rekey: [8, 15], confirm: [1, 2], retry: [10, 20], slip: 0.08 },
    opRiskReviewMin: [4, 15]
  };

  var SYN_START = '2026-09-01';
  var SYN_DAYS = 22;

  function businessDays(start, count) {
    var out = [], d = start;
    while (out.length < count) {
      var w = weekday(d);
      if (w !== 0 && w !== 6) out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }

  function syntheticPopulation(rng) {
    var users = [];
    ['A', 'B', 'C'].forEach(function (t) {
      var team = 'Wipro Ops ' + t;
      users.push({ id: 'S-MK-' + t + '1', name: 'Maker ' + t + '1', employer: 'Wipro', inHouse: false, team: team, roles: ['maker'], reportsTo: 'S-SUP-' + t, approvalLimit: 0, certs: [] });
      users.push({ id: 'S-MK-' + t + '2', name: 'Maker ' + t + '2', employer: 'Wipro', inHouse: false, team: team, roles: ['maker'], reportsTo: 'S-SUP-' + t, approvalLimit: 0, certs: [] });
      users.push({ id: 'S-CK-' + t, name: 'Checker ' + t, employer: 'Wipro', inHouse: false, team: team, roles: ['checker'], reportsTo: 'S-SUP-' + t, approvalLimit: 0, certs: [] });
      users.push({ id: 'S-SUP-' + t, name: 'Supervisor ' + t, employer: 'Wipro', inHouse: false, team: team, roles: ['checker', 'approver'], reportsTo: null, approvalLimit: 25000000, certs: [{ type: 'WA-01', validUntil: '2027-03-31' }] });
    });
    [['DE1', 'DE'], ['DE2', 'DE'], ['NY1', 'NY'], ['NY2', 'NY'], ['TPA1', 'TPA'], ['TPA2', 'TPA']].forEach(function (x) {
      users.push({ id: 'S-AP-' + x[0], name: 'Approver ' + x[0], employer: 'Citi', inHouse: true, team: 'Citi Approvers ' + x[1], roles: ['approver'], reportsTo: null, approvalLimit: 2000000000, certs: [{ type: 'WA-01', validUntil: '2027-06-30' }] });
    });
    users.push({ id: 'S-AP-NY3', name: 'Approver NY3', employer: 'Citi', inHouse: true, team: 'Citi Approvers NY', roles: ['approver'], reportsTo: null, approvalLimit: 2000000000, certs: [{ type: 'WA-01', validUntil: '2026-08-15' }] });
    users.push({ id: 'S-AP-DE3', name: 'Approver DE3', employer: 'Citi', inHouse: true, team: 'Citi Approvers DE', roles: ['approver'], reportsTo: null, approvalLimit: 50000000, certs: [] });
    var register = [
      { id: 'WA-01', status: 'Active', requiredFields: ['FRONT', 'FUND', 'PRINCIPAL'], requiredValue: WASH, appliesTo: ['INTEREST_VIA_WASH'], certType: 'WA-01', ownerId: null, dispensationUntil: '2027-06-30', nextReview: '2027-01-20' },
      { id: 'WA-04', status: 'Retired', requiredFields: ['FRONT', 'FUND', 'PRINCIPAL'], requiredValue: WASH, appliesTo: ['INTEREST_VIA_WASH'], certType: 'WA-04', ownerId: null, retiredOn: '2025-12-01' }
    ];
    var loans = [];
    for (var i = 0; i < 60; i++) {
      var principal = rng.int(200, 15000) * 100000;
      var ratePct = rng.float(3.5, 9.5);
      loans.push({
        id: 'SL-' + ('00' + (i + 1)).slice(-3),
        name: 'Synthetic loan ' + (i + 1),
        lenders: rng.int(3, 400),
        principalOutstanding: principal,
        quarterInterest: round2(principal * ratePct / 100 / 4),
        amortising: rng.chance(0.4),
        amort: round2(principal * 0.0125),
        schedule: [],
        reserved: {}
      });
    }
    return {
      users: users,
      register: register,
      loans: loans,
      makersByTeam: { A: ['S-MK-A1', 'S-MK-A2'], B: ['S-MK-B1', 'S-MK-B2'], C: ['S-MK-C1', 'S-MK-C2'] },
      cleanApprovers: ['S-AP-DE1', 'S-AP-DE2', 'S-AP-NY1', 'S-AP-NY2', 'S-AP-TPA1', 'S-AP-TPA2'],
      uncertifiedApprovers: ['S-AP-NY3', 'S-AP-DE3'],
      rubberTeams: ['Citi Approvers TPA']
    };
  }

  function lineOn(loan, date) {
    for (var i = 0; i < loan.schedule.length; i++) if (loan.schedule[i].date === date) return loan.schedule[i];
    return null;
  }

  function slipAmount(rng, x) {
    return round2(x + rng.int(1, 9) * Math.pow(10, rng.int(2, 5)));
  }

  function generateSyntheticBatch(opts) {
    opts = opts || {};
    var seed = opts.seed == null ? 4234 : opts.seed;
    var n = opts.n == null ? 500 : opts.n;
    var errorRate = opts.errorRate == null ? 0.05 : opts.errorRate;
    var staleRate = opts.staleRate == null ? 0.01 : opts.staleRate;
    var rng = createRng(seed);
    var pop = syntheticPopulation(rng);
    var days = businessDays(SYN_START, SYN_DAYS);

    var slots = [];
    for (var i = 0; i < n; i++) slots.push({ k: i, day: rng.int(0, days.length - 1) });
    slots.sort(function (a, b) { return a.day - b.day || a.k - b.k; });

    var errorCount = Math.min(n, Math.round(n * errorRate));
    var idx = [];
    for (var j = 0; j < n; j++) idx.push(j);
    var errIdx = rng.shuffle(idx).slice(0, errorCount).sort(function (a, b) { return a - b; });
    var bag = [];
    while (bag.length < errorCount) bag = bag.concat(rng.shuffle(ERROR_TYPES.map(function (t) { return t.id; })));
    var errAt = {};
    errIdx.forEach(function (ix, q) { errAt[ix] = bag[q]; });

    var payments = [];
    for (var p = 0; p < n; p++) {
      var date = days[slots[p].day];
      var error = errAt[p] || null;
      var teamKey = rng.pick(['A', 'B', 'C']);
      var makerId = rng.pick(pop.makersByTeam[teamKey]);
      var checkerId = 'S-CK-' + teamKey;
      var approverId = rng.pick(pop.cleanApprovers);
      var id = 'SP-' + ('000' + (p + 1)).slice(-4);

      if (error === 'DUPLICATE') {
        var earlier = payments.filter(function (x) { return !x.error && !x.stale && x.dupOf == null; });
        if (!earlier.length) { error = 'EXTRA_ZERO'; }
        else {
          var orig = rng.pick(earlier);
          var di = clone(orig.instr);
          di.id = id; di.makerId = makerId; di.checkerId = checkerId; di.approverId = approverId; di.processDate = date > orig.instr.processDate ? date : orig.instr.processDate;
          payments.push({ id: id, instr: di, error: 'DUPLICATE', stale: false, approverExpects: orig.approverExpects, approverNature: orig.approverNature, reconExpected: 0, dupOf: orig.id, variant: 'copy of ' + orig.id, teamKey: teamKey });
          continue;
        }
      }

      var op;
      if (error === 'WA_FIELD_MISSING' || error === 'UNREGISTERED_OVERRIDE' || error === 'UNCERTIFIED_APPROVER') op = 'INTEREST_VIA_WASH';
      else if (error === 'UNSCHEDULED_PRINCIPAL' || error === 'WRONG_VALUE_DATE') op = 'INTEREST';
      else {
        var roll = rng.next();
        op = roll < 0.12 ? 'INTEREST_VIA_WASH' : roll < 0.30 ? 'PRINCIPAL_AND_INTEREST' : 'INTEREST';
      }

      var loan = null;
      for (var tries = 0; tries < 200 && !loan; tries++) {
        var cand = rng.pick(pop.loans);
        if (op === 'PRINCIPAL_AND_INTEREST' && !cand.amortising) continue;
        if (lineOn(cand, date) || cand.reserved[date]) continue;
        loan = cand;
      }
      if (!loan) { op = 'INTEREST'; loan = pop.loans.filter(function (l) { return !lineOn(l, date) && !l.reserved[date]; })[0]; }

      var interest = round2(loan.quarterInterest * rng.float(0.97, 1.03));
      var principalDue = op === 'PRINCIPAL_AND_INTEREST' ? loan.amort : 0;
      var line = { date: date, interest: interest, principal: principalDue, paidInterest: 0, paidPrincipal: 0 };
      loan.schedule.push(line);
      var rollPrincipal = op === 'INTEREST_VIA_WASH' ? Math.round(loan.principalOutstanding * rng.float(0.2, 1.0) / 1000) * 1000 : 0;
      var instr = {
        id: id, loanId: loan.id, operation: op, valueDate: date, processDate: date,
        interest: interest,
        principal: op === 'PRINCIPAL_AND_INTEREST' ? principalDue : rollPrincipal,
        overrideCode: op === 'INTEREST_VIA_WASH' ? 'WA-01' : '',
        fields: op === 'INTEREST_VIA_WASH' ? { FRONT: WASH, FUND: WASH, PRINCIPAL: WASH } : { FRONT: LENDERS, FUND: LENDERS, PRINCIPAL: LENDERS },
        makerId: makerId, checkerId: checkerId, approverId: approverId
      };
      var correctExternal = round2(interest + principalDue);
      /* The approver's source (the agent notice) says what should leave: the amount, and whether it is interest only or principal and interest. */
      var rec = { id: id, instr: instr, error: error, stale: false, approverExpects: correctExternal, approverNature: principalDue > 0 ? 'PRINCIPAL_AND_INTEREST' : 'INTEREST', reconExpected: correctExternal, teamKey: teamKey };

      if (!error && rng.chance(staleRate)) {
        line.interest = round2(interest * (1 + (rng.chance(0.5) ? 1 : -1) * rng.float(0.005, 0.03)));
        rec.stale = true;
      }

      switch (error) {
        case 'WA_FIELD_MISSING': {
          var v = rng.int(0, 2);
          if (v === 0 || v === 2) instr.fields.FRONT = LENDERS;
          if (v === 1 || v === 2) instr.fields.FUND = LENDERS;
          rec.variant = v === 0 ? 'FRONT not set' : v === 1 ? 'FUND not set' : 'FRONT and FUND not set (Revlon pattern)';
          break;
        }
        case 'EXTRA_ZERO':
          if (op === 'PRINCIPAL_AND_INTEREST' && rng.chance(0.5)) { instr.principal = round2(instr.principal * 10); rec.variant = 'principal x10'; }
          else { instr.interest = round2(instr.interest * 10); rec.variant = 'interest x10'; }
          break;
        case 'UNSCHEDULED_PRINCIPAL':
          instr.principal = Math.round(loan.principalOutstanding * rng.float(0.05, 1.0) / 1000) * 1000;
          rec.variant = 'principal booked on an interest-only date';
          break;
        case 'UNREGISTERED_OVERRIDE':
          instr.overrideCode = rng.pick(['OVR-PRIN-HOLD', 'WA-04']);
          rec.variant = instr.overrideCode === 'WA-04' ? 'retired entry WA-04' : 'code not in register';
          break;
        case 'WRONG_VALUE_DATE': {
          /* Keyed one business day off, on a day with nothing due. The date is then reserved,
             so no later synthetic payment schedules a line for this loan on it. */
          var di2 = days.indexOf(date);
          var options = [days[di2 - 1], days[di2 + 1]].filter(function (d) { return d && !lineOn(loan, d); });
          if (!options.length) options = [addDays(date, 1)];
          instr.valueDate = rng.pick(options);
          loan.reserved[instr.valueDate] = true;
          rec.variant = 'value date ' + instr.valueDate + ' instead of ' + date;
          break;
        }
        case 'UNCERTIFIED_APPROVER':
          instr.approverId = rng.pick(pop.uncertifiedApprovers);
          rec.variant = instr.approverId === 'S-AP-NY3' ? 'certification expired' : 'no certification';
          break;
        case 'NOT_INDEPENDENT_APPROVER':
          instr.approverId = 'S-SUP-' + teamKey;
          rec.variant = 'maker\'s own Wipro supervisor';
          break;
        case 'AMOUNT_SLIP_SMALL':
          instr.interest = round2(instr.interest * (1 + (rng.chance(0.5) ? 1 : -1) * rng.float(0.02, 0.08)));
          rec.variant = 'interest off by ' + fmtPct(Math.abs(instr.interest - interest) / interest);
          break;
        case 'AMOUNT_SLIP_TINY':
          instr.interest = round2(instr.interest + (rng.chance(0.5) ? 1 : -1) * rng.int(15, 450));
          rec.variant = 'interest off by ' + fmtUSD(Math.abs(round2(instr.interest - interest)));
          break;
        default:
          break;
      }
      payments.push(rec);
    }
    return { seed: seed, n: n, errorRate: errorRate, staleRate: staleRate, days: days, population: pop, payments: payments, errorCount: errorCount };
  }

  function runSyntheticTest(opts) {
    opts = opts || {};
    var cfg = config(opts.config);
    var batch = generateSyntheticBatch(opts);
    var pop = batch.population;
    var rng = createRng(toSeed(batch.seed) ^ 0x5bd1e995);
    var typeMeta = {};
    ERROR_TYPES.forEach(function (t) { typeMeta[t.id] = t; });

    var records = [];
    var reviews = {};
    var reconRows = [];
    batch.payments.forEach(function (p) {
      var ctx = { businessDate: p.instr.processDate, loans: pop.loans, users: pop.users, register: pop.register, config: cfg };
      var ev = evaluate(p.instr, ctx);
      var approver = byId(pop.users, p.instr.approverId);
      var team = approver ? approver.team : 'unknown';
      var beh = pop.rubberTeams.indexOf(team) >= 0 ? TIME_MODEL.rubber : TIME_MODEL.normal;
      var rec = {
        id: p.id, loanId: p.instr.loanId, op: p.instr.operation, error: p.error, cls: p.error ? typeMeta[p.error].cls : null,
        variant: p.variant || null, stale: p.stale, tier: ev.tier, finalTier: ev.tier, gateOpen: ev.gate.open,
        fired: ev.hits.slice(), outcome: null, reconBreak: 0, addedSec: null, holdMin: null, team: team, dwellSec: null, rekeyFirstMatch: null
      };
      if (!ev.gate.open) {
        rec.outcome = 'GATE_BLOCK';
      } else {
        var read, added;
        if (ev.tier === 1) {
          read = rng.float(beh.readT1[0], beh.readT1[1]);
          added = read;
          rec.outcome = 'RELEASED';
        } else {
          var a1 = rng.chance(beh.slip) ? slipAmount(rng, p.approverExpects) : p.approverExpects;
          var attempts = [{ amount: a1, nature: p.approverNature }];
          var rk = rekeyResult(ev, attempts, cfg);
          if (rk.status === 'retry') { attempts.push({ amount: p.approverExpects, nature: p.approverNature }); rk = rekeyResult(ev, attempts, cfg); }
          rec.rekeyFirstMatch = rk.firstMatch;
          rec.rekey = rekeyKind(rk);
          var after = withRekey(ev, rk);
          rec.finalTier = after.tier;
          rec.fired = after.hits.slice();
          read = rng.float(beh.readT23[0], beh.readT23[1]);
          added = read + rng.float(beh.rekey[0], beh.rekey[1]);
          if (after.tier === 2) added += rng.float(beh.confirm[0], beh.confirm[1]);
          if (!rk.firstMatch) added += rng.float(beh.retry[0], beh.retry[1]);
          if (after.tier === 3) {
            rec.holdMin = round2(rng.float(TIME_MODEL.opRiskReviewMin[0], TIME_MODEL.opRiskReviewMin[1]));
            rec.outcome = p.error ? 'HELD_REJECTED' : 'HELD_RELEASED';
          } else {
            rec.outcome = 'RELEASED';
          }
          (reviews[team] = reviews[team] || []).push({ tier: ev.tier, dwellSec: read, rekey: rec.rekey, decision: after.tier === 3 ? 'escalate' : 'approve' });
        }
        if (ev.tier === 1) (reviews[team] = reviews[team] || []).push({ tier: 1, dwellSec: read, rekey: null, decision: 'approve' });
        rec.dwellSec = Math.round(read * 10) / 10;
        rec.addedSec = Math.round(added * 10) / 10;
      }
      if (rec.outcome === 'RELEASED' || rec.outcome === 'HELD_RELEASED') {
        var loan = byId(pop.loans, p.instr.loanId);
        applyRelease(loan, p.instr.valueDate, ev.consequence);
        var diff = round2(ev.consequence.externalTotal - p.reconExpected);
        rec.reconBreak = diff;
        reconRows.push({ id: p.id, diff: diff, isBreak: Math.abs(diff) >= 0.01 });
      }
      records.push(rec);
    });

    /* Aggregate */
    var errors = records.filter(function (r) { return r.error; });
    var clean = records.filter(function (r) { return !r.error; });
    function stopped(r) { return r.outcome === 'GATE_BLOCK' || r.outcome === 'HELD_REJECTED' || r.outcome === 'HELD_RELEASED'; }
    function flagged(r) { return r.fired.length > 0 || !r.gateOpen; }
    function foundAfter(r) { return !stopped(r) && Math.abs(r.reconBreak) >= 0.01; }

    var byType = ERROR_TYPES.map(function (t) {
      var rs = errors.filter(function (r) { return r.error === t.id; });
      var rules = {};
      rs.forEach(function (r) { r.fired.forEach(function (k) { rules[k] = (rules[k] || 0) + 1; }); if (!r.gateOpen) rules.GATE = (rules.GATE || 0) + 1; });
      return {
        type: t.id, label: t.label, cls: t.cls, count: rs.length,
        flagged: rs.filter(flagged).length,
        stopped: rs.filter(stopped).length,
        foundAfter: rs.filter(foundAfter).length,
        missed: rs.filter(function (r) { return !stopped(r) && !foundAfter(r); }).length,
        rules: rules,
        tiers: { 1: rs.filter(function (r) { return r.gateOpen && r.finalTier === 1; }).length, 2: rs.filter(function (r) { return r.gateOpen && r.finalTier === 2; }).length, 3: rs.filter(function (r) { return r.gateOpen && r.finalTier === 3; }).length, gate: rs.filter(function (r) { return !r.gateOpen; }).length }
      };
    });
    var byClass = Object.keys(ERROR_CLASSES).map(function (k) {
      var rs = errors.filter(function (r) { return r.cls === k; });
      return { cls: k, label: ERROR_CLASSES[k].label, note: ERROR_CLASSES[k].note, count: rs.length, stopped: rs.filter(stopped).length, foundAfter: rs.filter(foundAfter).length,
        rate: rs.length ? rs.filter(stopped).length / rs.length : null };
    });
    function tierCounts(rs) {
      return { 1: rs.filter(function (r) { return r.gateOpen && r.finalTier === 1; }).length, 2: rs.filter(function (r) { return r.gateOpen && r.finalTier === 2; }).length, 3: rs.filter(function (r) { return r.gateOpen && r.finalTier === 3; }).length, gate: rs.filter(function (r) { return !r.gateOpen; }).length };
    }
    var falseAlarms = clean.filter(flagged);
    var faByRule = {};
    falseAlarms.forEach(function (r) { r.fired.forEach(function (k) { faByRule[k] = (faByRule[k] || 0) + 1; }); });
    var policyTier2 = clean.filter(function (r) { return !flagged(r) && r.finalTier === 2; }).length;

    var timed = records.filter(function (r) { return r.addedSec != null; });
    function med(rs) { var m = median(rs.map(function (r) { return r.addedSec; })); return m == null ? null : Math.round(m * 10) / 10; }
    var time = {
      medianTier1Sec: med(timed.filter(function (r) { return r.finalTier === 1; })),
      medianTier2Sec: med(timed.filter(function (r) { return r.finalTier === 2; })),
      medianTier3Sec: med(timed.filter(function (r) { return r.finalTier === 3; })),
      medianTier23Sec: med(timed.filter(function (r) { return r.finalTier >= 2; })),
      meanAllSec: (function () { var m = mean(timed.map(function (r) { return r.addedSec; })); return m == null ? null : Math.round(m * 10) / 10; })(),
      medianHoldMin: (function () { var m = median(records.filter(function (r) { return r.holdMin != null; }).map(function (r) { return r.holdMin; })); return m == null ? null : Math.round(m * 10) / 10; })(),
      timedCount: timed.length,
      model: TIME_MODEL
    };

    var r08 = Object.keys(reviews).sort().map(function (team) { return assign({ team: team }, summariseReviews(reviews[team], cfg)); });
    var reconBreaks = reconRows.filter(function (r) { return r.isBreak; });

    var coverage = ['R-01', 'R-02', 'R-03', 'R-04', 'R-05', 'R-06', 'R-07'].map(function (k) {
      return {
        rule: k, name: RULES[k].name,
        onErrors: errors.filter(function (r) { return r.fired.indexOf(k) >= 0; }).length,
        onClean: clean.filter(function (r) { return r.fired.indexOf(k) >= 0; }).length,
        targetedBy: ERROR_TYPES.filter(function (t) { return t.targets.indexOf(k) >= 0; }).map(function (t) { return t.id; })
      };
    });
    coverage.push({ rule: 'R-08', name: RULES['R-08'].name, onErrors: null, onClean: null, teamsFlagged: r08.filter(function (t) { return t.rag !== 'green'; }).map(function (t) { return t.team + ' (' + t.score + ', ' + t.rag + ')'; }), targetedBy: ['rubber-stamp behaviour profile for Citi Approvers TPA'] });
    coverage.push({ rule: 'R-09', name: RULES['R-09'].name, onErrors: errors.filter(foundAfter).length, onClean: clean.filter(foundAfter).length, reconBreaks: reconBreaks.length, rag: reconBreaks.length ? 'red' : 'green', targetedBy: ['AMOUNT_SLIP_TINY'] });

    var replayCtx = { businessDate: batch.days[batch.days.length - 1], loans: [clone(REPLAY.loan)], users: pop.users, register: pop.register, config: cfg };
    var replay = replayCheck(replayCtx, { makerId: 'S-MK-A1', checkerId: 'S-CK-A', approverId: 'S-AP-DE1' });

    var summary = {
      seed: batch.seed, n: batch.n, errorCount: errors.length, cleanCount: clean.length, staleCount: clean.filter(function (r) { return r.stale; }).length,
      detection: {
        stoppedBeforeRelease: errors.filter(stopped).length,
        flagged: errors.filter(flagged).length,
        foundAfterRelease: errors.filter(foundAfter).length,
        missed: errors.filter(function (r) { return !stopped(r) && !foundAfter(r); }).length,
        rateBeforeRelease: errors.length ? errors.filter(stopped).length / errors.length : null,
        rateIncludingM5: errors.length ? (errors.filter(stopped).length + errors.filter(foundAfter).length) / errors.length : null,
        tier3ClassRate: (function () { var c = byClass.filter(function (x) { return x.cls === 'T3'; })[0]; return c ? c.rate : null; })()
      },
      falseAlarms: { count: falseAlarms.length, rate: clean.length ? falseAlarms.length / clean.length : null, byRule: faByRule, heldAtTier3: falseAlarms.filter(function (r) { return r.finalTier === 3; }).length },
      policyTier2Clean: policyTier2,
      tiers: { clean: tierCounts(clean), error: tierCounts(errors) },
      time: time,
      targets: null
    };
    summary.targets = [
      { id: 'tier3', label: 'Tier 3 errors stopped', target: '100%', value: summary.detection.tier3ClassRate, met: summary.detection.tier3ClassRate === 1 },
      { id: 'overall', label: 'All injected errors stopped before release', target: 'at least 90%', value: summary.detection.rateBeforeRelease, met: summary.detection.rateBeforeRelease >= 0.9 },
      { id: 'fp', label: 'False alarms on clean payments', target: 'below 5%', value: summary.falseAlarms.rate, met: summary.falseAlarms.rate < 0.05 },
      { id: 'time', label: 'Median added approver time at Tiers 2 and 3 (estimate)', target: 'under 2 minutes', value: time.medianTier23Sec, met: time.medianTier23Sec != null && time.medianTier23Sec < 120 }
    ];

    var fp = records.map(function (r) { return [r.id, r.error || '', r.finalTier, r.gateOpen ? 1 : 0, r.outcome, r.fired.join('|'), r.addedSec, r.reconBreak].join(','); }).join(';');
    var fingerprint = hex8(hashString(fp));

    return {
      summary: summary,
      byType: byType,
      byClass: byClass,
      coverage: coverage,
      r08: r08,
      recon: { released: reconRows.length, breaks: reconBreaks.length },
      replay: { pass: replay.pass, tier: replay.tier, hits: replay.hits, statement: replay.statement, detail: replay.detail, rekey: replay.rekey.status },
      errorRecords: errors,
      falseAlarmRecords: falseAlarms,
      fingerprint: fingerprint,
      window: { from: batch.days[0], to: batch.days[batch.days.length - 1] },
      assumptions: [
        'Clean payments are keyed exactly as the agent notice says. ' + Math.round(batch.staleRate * 1000) / 10 + '% of clean payments read a stale schedule line (0.5% to 3% off), to model the reference-data risk in report 5.9.',
        'Approvers re-key the amount and say whether it is interest, principal or both, from their own source (the agent notice). Normal teams slip on ' + TIME_MODEL.normal.slip * 100 + '% of first attempts and the rubber-stamp team (Citi Approvers TPA) on ' + TIME_MODEL.rubber.slip * 100 + '%.',
        'Operational Risk rejects held error payments and releases held clean payments with a recorded risk acceptance. The test measures what PCAP holds, so it assumes this second-line decision is right every time.',
        'Added time is a model estimate in seconds of approver work, not a timed walk-through. Tier 3 hold time with Operational Risk is reported separately in minutes.',
        'M5 reconciliation compares each released payment with what should have been paid that day.'
      ]
    };
  }

  /* A seed sweep that can be run one seed at a time (the browser runs it in small chunks so the page stays responsive). */
  function createSeedSweep(opts) {
    opts = opts || {};
    var from = opts.from == null ? 1 : opts.from;
    var to = opts.to == null ? 50 : opts.to;
    var agg = { from: from, to: to, seeds: 0, errors: 0, stopped: 0, foundAfter: 0, missed: 0, clean: 0, falseAlarms: 0, falseAlarmsHeld: 0, replayFails: 0, classes: {}, rates: [] };
    Object.keys(ERROR_CLASSES).forEach(function (k) { agg.classes[k] = { label: ERROR_CLASSES[k].label, count: 0, stopped: 0, foundAfter: 0 }; });
    var next = from;
    function step() {
      if (next > to) return false;
      var r = runSyntheticTest({ seed: next, n: opts.n, errorRate: opts.errorRate, staleRate: opts.staleRate, config: opts.config });
      next += 1;
      var s = r.summary;
      agg.seeds += 1;
      agg.errors += s.errorCount;
      agg.stopped += s.detection.stoppedBeforeRelease;
      agg.foundAfter += s.detection.foundAfterRelease;
      agg.missed += s.detection.missed;
      agg.clean += s.cleanCount;
      agg.falseAlarms += s.falseAlarms.count;
      agg.falseAlarmsHeld += s.falseAlarms.heldAtTier3;
      if (!r.replay.pass) agg.replayFails += 1;
      r.byClass.forEach(function (c) { var a = agg.classes[c.cls]; a.count += c.count; a.stopped += c.stopped; a.foundAfter += c.foundAfter; });
      agg.rates.push(s.detection.rateBeforeRelease);
      return next <= to;
    }
    function finish() {
      var sorted = agg.rates.slice().sort(function (a, b) { return a - b; });
      agg.rateMin = sorted[0];
      agg.rateMax = sorted[sorted.length - 1];
      agg.rateMedian = median(sorted);
      agg.ratePooled = agg.errors ? agg.stopped / agg.errors : null;
      agg.falseAlarmRate = agg.clean ? agg.falseAlarms / agg.clean : null;
      return agg;
    }
    return { step: step, finish: finish, done: function () { return next > to; }, seed: function () { return next; }, from: from, to: to };
  }

  /* Run many seeds and pool the results, to show how much one seed's numbers depend on the draw. */
  function runSeedSweep(opts) {
    var sw = createSeedSweep(opts);
    while (sw.step()) { /* run every seed */ }
    return sw.finish();
  }

  /* ------------------------------------------------------------------ */
  /* Export                                                              */
  /* ------------------------------------------------------------------ */

  return {
    WASH: WASH,
    LENDERS: LENDERS,
    OVERRIDE_FIELDS: OVERRIDE_FIELDS,
    OPERATIONS: OPERATIONS,
    NATURES: NATURES,
    ACCEPT_CATEGORIES: ACCEPT_CATEGORIES,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    MODULES: MODULES,
    RULES: RULES,
    RULE_ORDER: RULE_ORDER,
    TIERS: TIERS,
    REPLAY: REPLAY,
    ERROR_TYPES: ERROR_TYPES,
    ERROR_CLASSES: ERROR_CLASSES,
    TIME_MODEL: TIME_MODEL,
    // helpers
    config: config,
    fmtUSD: fmtUSD,
    fmtCompact: fmtCompact,
    fmtPct: fmtPct,
    fmtDate: fmtDate,
    addDays: addDays,
    daysBetween: daysBetween,
    round2: round2,
    num: num,
    median: median,
    mean: mean,
    clone: clone,
    byId: byId,
    ragWorst: ragWorst,
    hashString: hashString,
    createRng: createRng,
    // context
    buildDemoContext: buildDemoContext,
    // M2
    computeConsequence: computeConsequence,
    natureOf: natureOf,
    natureLabel: natureLabel,
    expectedFor: expectedFor,
    applyRelease: applyRelease,
    consequenceStatement: consequenceStatement,
    // pre-release check and R-07
    resolveOverride: resolveOverride,
    evaluate: evaluate,
    rekeyResult: rekeyResult,
    withRekey: withRekey,
    // Tier 3 release as a documented risk acceptance
    riskAcceptance: riskAcceptance,
    // M4
    summariseOutsourced: summariseOutsourced,
    teamReportable: teamReportable,
    // R-08
    rubberStampScore: rubberStampScore,
    rekeyKind: rekeyKind,
    summariseReviews: summariseReviews,
    // M5 and R-09
    reconcile: reconcile,
    involvedIn: involvedIn,
    controlHealth: controlHealth,
    replayCheck: replayCheck,
    // synthetic test
    generateSyntheticBatch: generateSyntheticBatch,
    runSyntheticTest: runSyntheticTest,
    createSeedSweep: createSeedSweep,
    runSeedSweep: runSeedSweep
  };
});
