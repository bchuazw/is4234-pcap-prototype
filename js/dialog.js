/*
 * PCAP prototype: one small in-page dialog for "are you sure" questions and short written reasons.
 * It replaces the browser's own pop-ups, which look rough on a recording and stop automated tests.
 *
 * Keyboard friendly: focus moves into the dialog and stays there, Esc cancels, Enter confirms
 * (Shift+Enter starts a new line in a reason). It uses the theme colours, so it works in the light
 * and dark themes and at phone width. Only one dialog is open at a time.
 *
 * PCAP.dialog.ask({ title, text, ok, cancel, danger }) resolves true or false.
 * PCAP.dialog.reason({ title, text, label, value, placeholder, min, ok, cancel, danger }) resolves the
 * trimmed text, or null when cancelled. A reason shorter than min is refused in place, with a counter.
 * Classic script. Attaches to window.PCAP.dialog.
 */
(function (root) {
  'use strict';
  var PCAP = root.PCAP = root.PCAP || {};
  var current = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function focusEl(el) { if (!el) return; try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
  function countText(have, min) { return have >= min ? have + ' characters. Enough to record.' : have + ' of at least ' + min + ' characters.'; }

  function open(opts) {
    return new Promise(function (resolve) {
      if (current) current.finish(null);
      var doc = root.document;
      var input = opts.input || null;
      var dlg = doc.createElement('dialog');
      dlg.className = 'pdlg' + (opts.danger ? ' is-danger' : '');
      dlg.setAttribute('aria-labelledby', 'pdlg-title');
      if (opts.text) dlg.setAttribute('aria-describedby', 'pdlg-text');
      dlg.innerHTML = '<form class="pdlg-form" novalidate>' +
        '<h2 class="pdlg-title" id="pdlg-title">' + esc(opts.title) + '</h2>' +
        (opts.text ? '<p class="pdlg-text" id="pdlg-text">' + esc(opts.text) + '</p>' : '') +
        (input ? '<div class="field pdlg-field"><label class="flabel" for="pdlg-input">' + esc(input.label || 'Reason') + '</label>' +
          '<textarea id="pdlg-input" rows="3" placeholder="' + esc(input.placeholder || '') + '" aria-describedby="pdlg-count pdlg-err">' + esc(input.value || '') + '</textarea>' +
          (input.min ? '<p class="fcount" id="pdlg-count"></p>' : '') +
          '<p class="ferr" id="pdlg-err" role="alert" hidden></p></div>' : '') +
        '<div class="pdlg-btns"><button type="button" class="btn ghost" data-pdlg="cancel">' + esc(opts.cancel || 'Cancel') + '</button>' +
        '<button type="submit" class="btn ' + (opts.danger ? 'danger' : 'primary') + '" data-pdlg="ok">' + esc(opts.ok || 'OK') + '</button></div></form>';
      doc.body.appendChild(dlg);
      var back = doc.activeElement;
      var box = dlg.querySelector('#pdlg-input');
      var count = dlg.querySelector('#pdlg-count');
      var err = dlg.querySelector('#pdlg-err');
      var done = false;

      function refresh() {
        if (!count) return;
        var have = box.value.trim().length;
        count.textContent = countText(have, input.min);
        count.classList.toggle('is-ok', have >= input.min);
      }
      function finish(value) {
        if (done) return;
        done = true;
        current = null;
        try { if (dlg.open && typeof dlg.close === 'function') dlg.close(); } catch (e) { /* already closed */ }
        dlg.remove();
        if (back && back.isConnected && back !== doc.body) focusEl(back);
        resolve(value);
      }
      function dismiss() { finish(input ? null : false); }
      function accept() {
        if (!input) { finish(true); return; }
        var v = box.value.trim();
        if (input.min && v.length < input.min) {
          err.textContent = 'Write at least ' + input.min + ' characters (you have ' + v.length + '). ' + (input.why || 'It is recorded with your decision.');
          err.hidden = false;
          box.setAttribute('aria-invalid', 'true');
          focusEl(box);
          return;
        }
        finish(v);
      }

      dlg.addEventListener('cancel', function (e) { e.preventDefault(); dismiss(); });
      dlg.addEventListener('submit', function (e) { e.preventDefault(); accept(); });
      dlg.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-pdlg]') : null;
        if (b) { e.preventDefault(); if (b.getAttribute('data-pdlg') === 'ok') accept(); else dismiss(); return; }
        /* A click on the dimmed backdrop lands on the dialog element itself. */
        if (e.target === dlg) dismiss();
      });
      dlg.addEventListener('keydown', function (e) {
        var t = e.target;
        if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
        else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          /* Enter confirms, unless the focus is on Cancel, where Enter cancels. */
          e.preventDefault();
          if (t && t.getAttribute && t.getAttribute('data-pdlg') === 'cancel') dismiss(); else accept();
        }
        else if (e.key === 'Tab') {
          var f = Array.prototype.slice.call(dlg.querySelectorAll('textarea, button'));
          var i = f.indexOf(doc.activeElement);
          e.preventDefault();
          focusEl(f[e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i === f.length - 1 ? 0 : i + 1)]);
        }
        /* Keys stay inside the dialog: no desk shortcuts and no tour keys behind it. */
        e.stopPropagation();
      });
      if (box) box.addEventListener('input', function () { refresh(); if (!err.hidden) { err.hidden = true; box.removeAttribute('aria-invalid'); } });

      current = { finish: finish };
      if (typeof dlg.showModal === 'function') { try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); } } else dlg.setAttribute('open', '');
      refresh();
      if (box) { focusEl(box); try { box.setSelectionRange(box.value.length, box.value.length); } catch (e) { /* not a text field */ } }
      else focusEl(dlg.querySelector('[data-pdlg="ok"]'));
    });
  }

  PCAP.dialog = {
    ask: function (opts) { return open(opts || {}); },
    reason: function (opts) {
      opts = opts || {};
      return open({ title: opts.title, text: opts.text, ok: opts.ok, cancel: opts.cancel, danger: opts.danger,
        input: { label: opts.label, value: opts.value, placeholder: opts.placeholder, min: opts.min || 0, why: opts.why } });
    },
    isOpen: function () { return !!current; },
    close: function () { if (current) current.finish(null); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
