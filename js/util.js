/*
 * PCAP prototype: small UI helpers shared by every screen.
 * Classic script. Attaches to window.PCAP.util.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP = root.PCAP || {};
  var E = PCAP.engine;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* Local calendar date as YYYY-MM-DD. */
  function localDate(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function localTime(d) {
    d = d || new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function fmtTime(iso) { return iso ? localTime(new Date(iso)) : ''; }
  function fmtDateTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return E.fmtDate(localDate(d)) + ', ' + localTime(d);
  }
  function fmtShortDateTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + localTime(d);
  }
  function fmtSec(s) {
    if (s == null || !isFinite(s)) return 'n/a';
    if (s < 60) return (Math.round(s * 10) / 10) + ' s';
    var m = Math.floor(s / 60), r = Math.round(s - m * 60);
    return m + ' min ' + r + ' s';
  }
  function fmtPctPlain(x, digits) {
    if (x == null || !isFinite(x)) return 'n/a';
    var d = digits == null ? 1 : digits;
    return (Math.round(x * 100 * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d) + '%';
  }
  function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* Parse an amount typed by a person: "7,820,000", "7820000.00", "7.82m", "894M", "1.2bn". */
  function parseAmount(str) {
    if (typeof str === 'number') return str;
    var s = String(str || '').trim().toLowerCase().replace(/usd|\$|\s/g, '').replace(/,/g, '');
    if (!s) return NaN;
    var mult = 1;
    var m = s.match(/^(-?[0-9]*\.?[0-9]+)(k|m|mn|b|bn)?$/);
    if (!m) return NaN;
    if (m[2] === 'k') mult = 1e3;
    else if (m[2] === 'm' || m[2] === 'mn') mult = 1e6;
    else if (m[2] === 'b' || m[2] === 'bn') mult = 1e9;
    var v = parseFloat(m[1]) * mult;
    return isFinite(v) ? Math.round(v * 100) / 100 : NaN;
  }

  /* Inline icons (no external files). 16px, currentColor. */
  var ICONS = {
    check: '<path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    x: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    warn: '<path d="M8 2.2l6.2 11H1.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 6.5v3.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.6" r="0.9" fill="currentColor"/>',
    stop: '<path d="M5.3 1.8h5.4l3.5 3.5v5.4l-3.5 3.5H5.3l-3.5-3.5V5.3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M5.5 8h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    info: '<circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 7.2v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="4.9" r="0.9" fill="currentColor"/>',
    lock: '<rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.3 7V5.2a2.7 2.7 0 015.4 0V7" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    unlock: '<rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.3 7V5.2a2.7 2.7 0 015.2-1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    clock: '<circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    dash: '<path d="M4 8h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    eye: '<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2" fill="currentColor"/>',
    download: '<path d="M8 2.5v7.5M4.8 7l3.2 3.2L11.2 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12.8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    arrow: '<path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    play: '<path d="M5 3.5v9l7-4.5z" fill="currentColor"/>',
    shield: '<path d="M8 1.8l5 2v3.9c0 3-2.1 5.4-5 6.5-2.9-1.1-5-3.5-5-6.5V3.8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
  };
  function icon(name, cls) {
    return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';
  }

  var RAG_LABEL = { green: 'Green', amber: 'Amber', red: 'Red' };
  var RAG_ICON = { green: 'check', amber: 'warn', red: 'stop' };
  function ragChip(rag, label) {
    rag = rag || 'green';
    return '<span class="chip rag rag-' + rag + '">' + icon(RAG_ICON[rag]) + '<span>' + esc(label || RAG_LABEL[rag]) + '</span></span>';
  }

  var TIER_ICON = { 1: 'check', 2: 'warn', 3: 'stop' };
  function tierBadge(tier, opts) {
    opts = opts || {};
    var t = E.TIERS[tier] || E.TIERS[1];
    return '<span class="tier tier-' + tier + (opts.big ? ' tier-big' : '') + '">' + icon(TIER_ICON[tier]) +
      '<span>' + esc(t.name) + (opts.noLabel ? '' : ' <em>' + esc(t.label) + '</em>') + '</span></span>';
  }

  function moduleChip(mid, opts) {
    var m = E.MODULES[mid];
    if (!m) return '';
    var g = m.group.toLowerCase();
    return '<span class="chip mod mod-' + g + '" title="' + esc(m.name + ' (' + m.group + ')') + '">' + esc(mid) + (opts && opts.name ? ' ' + esc(m.short) : '') + '</span>';
  }
  function ruleChip(rid, status) {
    var r = E.RULES[rid];
    var cls = status === 'fire' ? 'rule-fire' : status === 'pass' ? 'rule-pass' : '';
    return '<span class="chip rule ' + cls + '" title="' + esc(r ? rid + ' ' + r.name : rid) + '">' + esc(rid) + '</span>';
  }
  function obligationChip(oid) {
    return '<span class="chip obl" title="Obligation row ' + esc(oid) + '">' + esc(oid) + '</span>';
  }

  var STATUS_LABEL = {
    SUBMITTED: 'Waiting for checker', CHECKED: 'Waiting for approver', HELD: 'Tier 3 hold (Op Risk)',
    RELEASED: 'Released', RETURNED: 'Returned to maker', REJECTED: 'Rejected', CANCELLED: 'Cancelled'
  };
  var STATUS_CLASS = { SUBMITTED: 'st-wait', CHECKED: 'st-wait', HELD: 'st-hold', RELEASED: 'st-done', RETURNED: 'st-ret', REJECTED: 'st-rej', CANCELLED: 'st-rej' };
  function statusChip(status) {
    return '<span class="chip status ' + (STATUS_CLASS[status] || '') + '">' + esc(STATUS_LABEL[status] || status) + '</span>';
  }

  /* Highlight amounts and PRINCIPAL / INTEREST in an escaped consequence sentence. */
  function emphasise(sentence) {
    return esc(sentence)
      .replace(/(USD [0-9,]+(?:\.[0-9]{2})?)/g, '<strong class="amt">$1</strong>')
      .replace(/\bPRINCIPAL\b/g, '<span class="kw kw-p">PRINCIPAL</span>')
      .replace(/\bINTEREST\b/g, '<span class="kw kw-i">INTEREST</span>');
  }

  function download(filename, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
      return true;
    } catch (e) {
      return false;
    }
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toast(msg, kind) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () { el.classList.add('out'); }, 3600);
    setTimeout(function () { el.remove(); }, 4200);
  }

  PCAP.util = {
    esc: esc,
    localDate: localDate,
    localTime: localTime,
    fmtTime: fmtTime,
    fmtDateTime: fmtDateTime,
    fmtShortDateTime: fmtShortDateTime,
    fmtSec: fmtSec,
    fmtPctPlain: fmtPctPlain,
    fmtInt: fmtInt,
    fmtUSD: E.fmtUSD,
    fmtCompact: E.fmtCompact,
    fmtDate: E.fmtDate,
    parseAmount: parseAmount,
    icon: icon,
    ragChip: ragChip,
    tierBadge: tierBadge,
    moduleChip: moduleChip,
    ruleChip: ruleChip,
    obligationChip: obligationChip,
    statusChip: statusChip,
    STATUS_LABEL: STATUS_LABEL,
    emphasise: emphasise,
    download: download,
    csvCell: csvCell,
    toast: toast
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
