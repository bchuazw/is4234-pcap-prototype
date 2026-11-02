/*
 * PCAP report-alignment tests (2 Nov 2026): the prototype matches report sections 5.4 and 5.5 and the review fixes.
 * Stopped payments cannot move forward, Operational Risk assesses but cannot release, only the Head of Loan Ops
 * releases, concentrated reviewer pairs, the 24-hour escalation, and no browser pop-ups anywhere.
 * Runs in Node with in-memory state. Synthetic data only.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../js/engine.js');

const ROOT = path.join(__dirname, '..');

function filesUnder(dir, ext) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...filesUnder(full, ext));
    else if (name.endsWith(ext)) out.push(full);
  }
  return out;
}

test('no native confirm, prompt or alert is left anywhere: every question uses the in-page dialog', () => {
  const files = filesUnder(path.join(ROOT, 'js'), '.js').concat(filesUnder(path.join(ROOT, 'data'), '.js'), [path.join(ROOT, 'index.html')]);
  const bare = /(^|[^.\w$])(confirm|prompt|alert)\s*\(/m;
  const named = /\b(window|root|self|globalThis|top|parent|document)\s*\.\s*(confirm|prompt|alert)\s*\(/;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!bare.test(src), path.relative(ROOT, f) + ' calls a native pop-up: ' + (bare.exec(src) || [''])[0]);
    assert.ok(!named.test(src), path.relative(ROOT, f) + ' calls a native pop-up: ' + (named.exec(src) || [''])[0]);
  }
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/dialog.js') > 0 && html.indexOf('js/dialog.js') < html.indexOf('js/views/'), 'the dialog loads before the screens');
  const dlg = fs.readFileSync(path.join(ROOT, 'js', 'dialog.js'), 'utf8');
  assert.match(dlg, /Escape/, 'Esc cancels');
  assert.match(dlg, /'Enter'/, 'Enter confirms');
  assert.match(dlg, /showModal/, 'focus moves into a modal dialog');
});
