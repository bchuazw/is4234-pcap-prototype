/*
 * PCAP prototype: tiny inline-SVG charts (no chart library).
 * Line chart with crosshair tooltip, horizontal bars, columns and sparklines.
 * Tooltip text is set with textContent. Every chart has a table or label twin on its screen.
 * Classic script. Attaches to window.PCAP.charts.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP = root.PCAP || {};
  var U = PCAP.util;

  var SERIES = ['#2a78d6', '#eb6834', '#1baf7a']; /* validated categorical slots 1 to 3 */
  var STATUS = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' };
  var reg = {};
  var uid = 0;

  function nextId() { uid += 1; return 'c' + uid; }
  function reset() { reg = {}; }

  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var m = v / p;
    var n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
    return n * p;
  }

  /* ---------------------------------------------------------------- line chart */
  /* opts: { labels: [..], series: [{ name, color, values }], yMax, yTicks, bands: [{ from, to, color, label }], fmt, height, ariaLabel } */
  function lineChart(opts) {
    var id = nextId();
    var W = 640, H = opts.height || 250;
    var m = { l: 34, r: 128, t: 14, b: 30 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var n = opts.labels.length;
    var yMax = opts.yMax || niceMax(Math.max.apply(null, opts.series.map(function (s) { return Math.max.apply(null, s.values.filter(function (v) { return v != null; }).concat([0])); })));
    var ticks = opts.yTicks || [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax];
    var fmt = opts.fmt || function (v) { return String(Math.round(v)); };
    function x(i) { return m.l + (n === 1 ? pw / 2 : (pw * i) / (n - 1)); }
    function y(v) { return m.t + ph - (ph * v) / yMax; }

    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + U.esc(opts.ariaLabel || 'Line chart') + '" data-chart="' + id + '">';
    (opts.bands || []).forEach(function (b) {
      var yt = y(Math.min(b.to, yMax)), yb = y(b.from);
      s += '<rect x="' + m.l + '" y="' + yt + '" width="' + pw + '" height="' + Math.max(0, yb - yt) + '" fill="' + b.color + '" opacity="0.07"/>';
      s += '<line x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + yb + '" y2="' + yb + '" stroke="' + b.color + '" stroke-opacity="0.55" stroke-width="1"/>';
      s += '<text x="' + (m.l + 6) + '" y="' + (yb - 4) + '" class="axis-label">' + U.esc(b.label) + '</text>';
    });
    ticks.forEach(function (t) {
      s += '<line x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + y(t) + '" y2="' + y(t) + '" class="grid"/>';
      s += '<text x="' + (m.l - 6) + '" y="' + (y(t) + 4) + '" text-anchor="end" class="axis-label">' + U.esc(fmt(t)) + '</text>';
    });
    s += '<line x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + y(0) + '" y2="' + y(0) + '" class="baseline"/>';
    opts.labels.forEach(function (lab, i) {
      if (n > 8 && i % 2 === 1 && i !== n - 1) return;
      s += '<text x="' + x(i) + '" y="' + (H - 9) + '" text-anchor="middle" class="axis-label">' + U.esc(lab) + '</text>';
    });
    s += '<line class="crosshair" x1="0" x2="0" y1="' + m.t + '" y2="' + (m.t + ph) + '" visibility="hidden"/>';

    var ends = [];
    opts.series.forEach(function (ser, si) {
      var color = ser.color || SERIES[si % SERIES.length];
      var pts = [];
      ser.values.forEach(function (v, i) { if (v != null) pts.push([x(i), y(v)]); });
      if (pts.length) {
        s += '<polyline fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
        var last = pts[pts.length - 1];
        s += '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="4.5" fill="' + color + '" stroke="#fff" stroke-width="2"/>';
        ends.push({ y: last[1], x: last[0], label: ser.name + '  ' + fmt(ser.values[ser.values.length - 1]), color: color });
      }
    });
    /* End labels with leader lines when they would collide. */
    ends.sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < ends.length; i++) if (ends[i].ly == null) ends[i].ly = ends[i].y;
    if (ends.length) ends[0].ly = ends[0].y;
    for (var j = 1; j < ends.length; j++) if (ends[j].ly - ends[j - 1].ly < 15) ends[j].ly = ends[j - 1].ly + 15;
    ends.forEach(function (e) {
      var lx = m.l + pw + 12;
      if (Math.abs(e.ly - e.y) > 1) s += '<polyline points="' + (e.x + 6) + ',' + e.y + ' ' + (lx - 4) + ',' + e.ly + '" fill="none" stroke="#9aa3ae" stroke-width="1"/>';
      s += '<line x1="' + lx + '" x2="' + (lx + 10) + '" y1="' + e.ly + '" y2="' + e.ly + '" stroke="' + e.color + '" stroke-width="2.5" stroke-linecap="round"/>';
      s += '<text x="' + (lx + 15) + '" y="' + (e.ly + 4) + '" class="end-label">' + U.esc(e.label) + '</text>';
    });
    s += '<rect class="hit" x="' + m.l + '" y="' + m.t + '" width="' + pw + '" height="' + ph + '" fill="transparent" data-line="' + id + '" tabindex="0" aria-label="' + U.esc(opts.ariaLabel || 'chart') + ': use the table below for values"/>';
    s += '</svg>';
    reg[id] = { kind: 'line', labels: opts.labels, series: opts.series.map(function (ser, si) { return { name: ser.name, color: ser.color || SERIES[si % SERIES.length], values: ser.values }; }), x: { l: m.l, pw: pw, n: n, W: W }, fmt: fmt };
    return s;
  }

  /* Legend (always shown for two or more series). */
  function legend(items, kind) {
    return '<div class="legend">' + items.map(function (it, i) {
      var color = it.color || SERIES[i % SERIES.length];
      var key = kind === 'rect' ? '<span class="key-rect" style="background:' + color + '"></span>' : '<span class="key-line" style="background:' + color + '"></span>';
      return '<span class="legend-item">' + key + U.esc(it.name) + '</span>';
    }).join('') + '</div>';
  }

  /* ---------------------------------------------------------------- horizontal bars */
  /* opts: { items: [{ label, value, display, tip, color }], max, ariaLabel, labelWidth } */
  function hbars(opts) {
    var items = opts.items;
    var W = 560, rowH = 30, bar = 16;
    var lw = opts.labelWidth || 170, vw = 64;
    var pw = W - lw - vw - 8;
    var H = items.length * rowH + 6;
    var max = opts.max || niceMax(Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1])));
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + U.esc(opts.ariaLabel || 'Bar chart') + '">';
    s += '<line x1="' + lw + '" x2="' + lw + '" y1="0" y2="' + H + '" class="baseline"/>';
    items.forEach(function (it, i) {
      var y0 = i * rowH + 6;
      var w = Math.max(it.value > 0 ? 3 : 0, (pw * it.value) / max);
      var color = it.color || SERIES[0];
      s += '<text x="' + (lw - 8) + '" y="' + (y0 + bar / 2 + 4) + '" text-anchor="end" class="bar-label">' + U.esc(it.label) + '</text>';
      if (w > 0) {
        var r = Math.min(4, w);
        s += '<path d="M' + lw + ',' + y0 + ' h' + (w - r) + ' a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + ' v' + (bar - 2 * r) + ' a' + r + ',' + r + ' 0 0 1 -' + r + ',' + r + ' h-' + (w - r) + 'z" fill="' + color + '"/>';
      }
      s += '<rect x="' + lw + '" y="' + (y0 - 6) + '" width="' + (pw + vw) + '" height="' + rowH + '" fill="transparent" class="bar-hit" tabindex="0" data-tip="' + U.esc(it.tip || (it.label + ': ' + (it.display != null ? it.display : it.value))) + '"/>';
      s += '<text x="' + (lw + w + 6) + '" y="' + (y0 + bar / 2 + 4) + '" class="bar-value">' + U.esc(it.display != null ? it.display : String(it.value)) + '</text>';
    });
    s += '</svg>';
    return s;
  }

  /* ---------------------------------------------------------------- columns (histogram) */
  /* opts: { bins: [{ label, value, tip }], marker: { index, label }, ariaLabel } */
  function columns(opts) {
    var bins = opts.bins;
    var W = 560, H = 200;
    var m = { l: 30, r: 10, t: 22, b: 30 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var max = niceMax(Math.max.apply(null, bins.map(function (b) { return b.value; }).concat([1])));
    var slot = pw / bins.length;
    var bw = Math.min(24, slot - 6);
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + U.esc(opts.ariaLabel || 'Column chart') + '">';
    [0, max / 2, max].forEach(function (t) {
      var yy = m.t + ph - (ph * t) / max;
      s += '<line x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + yy + '" y2="' + yy + '" class="grid"/>';
      s += '<text x="' + (m.l - 6) + '" y="' + (yy + 4) + '" text-anchor="end" class="axis-label">' + Math.round(t) + '</text>';
    });
    bins.forEach(function (b, i) {
      var cx = m.l + slot * i + slot / 2;
      var h = (ph * b.value) / max;
      var x0 = cx - bw / 2, y0 = m.t + ph - h;
      if (h > 0) {
        var r = Math.min(4, h, bw / 2);
        s += '<path d="M' + x0 + ',' + (m.t + ph) + ' v-' + (h - r) + ' a' + r + ',' + r + ' 0 0 1 ' + r + ',-' + r + ' h' + (bw - 2 * r) + ' a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + ' v' + (h - r) + 'z" fill="' + (b.color || SERIES[0]) + '"/>';
      }
      s += '<rect x="' + (m.l + slot * i) + '" y="' + m.t + '" width="' + slot + '" height="' + ph + '" fill="transparent" class="bar-hit" tabindex="0" data-tip="' + U.esc(b.tip || (b.label + ': ' + b.value)) + '"/>';
      if (i % (bins.length > 10 ? 2 : 1) === 0 || i === bins.length - 1) s += '<text x="' + cx + '" y="' + (H - 10) + '" text-anchor="middle" class="axis-label">' + U.esc(b.label) + '</text>';
    });
    s += '<line x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + (m.t + ph) + '" y2="' + (m.t + ph) + '" class="baseline"/>';
    if (opts.marker) {
      var mx = m.l + slot * opts.marker.index;
      s += '<line x1="' + mx + '" x2="' + mx + '" y1="' + (m.t - 4) + '" y2="' + (m.t + ph) + '" stroke="' + STATUS.critical + '" stroke-width="1.5"/>';
      s += '<text x="' + (mx - 6) + '" y="' + (m.t + 6) + '" text-anchor="end" class="axis-label strong">' + U.esc(opts.marker.label) + '</text>';
    }
    s += '</svg>';
    return s;
  }

  /* ---------------------------------------------------------------- sparkline */
  function sparkline(values, opts) {
    opts = opts || {};
    var W = 110, H = 30, pad = 4;
    var vals = values.map(function (v) { return v == null ? 0 : v; });
    var max = Math.max.apply(null, vals.concat([opts.min || 0.0001]));
    var min = Math.min.apply(null, vals.concat([0]));
    var span = max - min || 1;
    function x(i) { return pad + ((W - 2 * pad) * i) / Math.max(1, vals.length - 1); }
    function y(v) { return H - pad - ((H - 2 * pad) * (v - min)) / span; }
    var pts = vals.map(function (v, i) { return x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join(' ');
    var lx = x(vals.length - 1), ly = y(vals[vals.length - 1]);
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true">' +
      '<polyline points="' + pts + '" fill="none" stroke="#9fb3c8" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + lx + '" cy="' + ly + '" r="3.2" fill="' + (opts.color || SERIES[0]) + '" stroke="#fff" stroke-width="1.5"/></svg>';
  }

  /* ---------------------------------------------------------------- tooltip layer */
  var tipEl = null;
  function tooltip() {
    if (!tipEl) tipEl = document.getElementById('viz-tooltip');
    return tipEl;
  }
  function showTip(clientX, clientY, build) {
    var t = tooltip();
    if (!t) return;
    while (t.firstChild) t.removeChild(t.firstChild);
    build(t);
    t.hidden = false;
    var r = t.getBoundingClientRect();
    var left = clientX + 14, top = clientY + 14;
    if (left + r.width > window.innerWidth - 8) left = clientX - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = clientY - r.height - 14;
    t.style.left = Math.max(8, left) + 'px';
    t.style.top = Math.max(8, top) + 'px';
  }
  function hideTip() {
    var t = tooltip();
    if (t) t.hidden = true;
    var xs = document.querySelectorAll('.crosshair');
    for (var i = 0; i < xs.length; i++) xs[i].setAttribute('visibility', 'hidden');
  }
  function textRow(parent, cls, text) {
    var d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    parent.appendChild(d);
    return d;
  }

  function onLineMove(hit, clientX, clientY) {
    var spec = reg[hit.getAttribute('data-line')];
    if (!spec) return;
    var svg = hit.ownerSVGElement;
    var box = svg.getBoundingClientRect();
    var scale = box.width / spec.x.W;
    var px = (clientX - box.left) / scale;
    var i = spec.x.n === 1 ? 0 : Math.round(((px - spec.x.l) / spec.x.pw) * (spec.x.n - 1));
    i = Math.max(0, Math.min(spec.x.n - 1, i));
    var cx = spec.x.l + (spec.x.n === 1 ? spec.x.pw / 2 : (spec.x.pw * i) / (spec.x.n - 1));
    var ch = svg.querySelector('.crosshair');
    if (ch) { ch.setAttribute('x1', cx); ch.setAttribute('x2', cx); ch.setAttribute('visibility', 'visible'); }
    showTip(clientX, clientY, function (t) {
      textRow(t, 'tip-title', spec.labels[i]);
      spec.series.forEach(function (s) {
        var row = document.createElement('div');
        row.className = 'tip-row';
        var key = document.createElement('span');
        key.className = 'key-line';
        key.style.background = s.color;
        var val = document.createElement('strong');
        val.textContent = s.values[i] == null ? 'n/a' : spec.fmt(s.values[i]);
        var name = document.createElement('span');
        name.className = 'tip-name';
        name.textContent = s.name;
        row.appendChild(key); row.appendChild(val); row.appendChild(name);
        t.appendChild(row);
      });
    });
  }

  function bindOnce() {
    if (bindOnce.done) return;
    bindOnce.done = true;
    document.addEventListener('pointermove', function (e) {
      var target = e.target;
      if (!target || !target.closest) return;
      var line = target.closest('[data-line]');
      if (line) { onLineMove(line, e.clientX, e.clientY); return; }
      var bar = target.closest('[data-tip]');
      if (bar) {
        showTip(e.clientX, e.clientY, function (t) { textRow(t, 'tip-title', bar.getAttribute('data-tip')); });
        return;
      }
      hideTip();
    });
    document.addEventListener('focusin', function (e) {
      var target = e.target;
      if (!target || !target.getAttribute) return;
      var r = target.getBoundingClientRect();
      if (target.hasAttribute('data-tip')) {
        showTip(r.left + r.width / 2, r.top, function (t) { textRow(t, 'tip-title', target.getAttribute('data-tip')); });
      } else if (target.hasAttribute('data-line')) {
        onLineMove(target, r.right - 2, r.top + 10);
      }
    });
    document.addEventListener('focusout', hideTip);
    window.addEventListener('scroll', hideTip, { passive: true });
  }

  PCAP.charts = {
    SERIES: SERIES,
    STATUS: STATUS,
    reset: reset,
    lineChart: lineChart,
    legend: legend,
    hbars: hbars,
    columns: columns,
    sparkline: sparkline,
    bind: bindOnce,
    hideTip: hideTip
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
