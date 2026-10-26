/*
 * 05-console.js — console capture (installed at load time) + Console panel
 */

var nativeCon = {};
['log', 'info', 'warn', 'error', 'debug'].forEach(function (m) {
  nativeCon[m] = (typeof console[m] === 'function') ? console[m].bind(console) : function () {};
});

function conEmit(level, args, kind) {
  if (!args || !args.length) args = [''];
  var parts = [];
  for (var i = 0; i < args.length; i++) parts.push(serialize(args[i], 0));
  var text = parts.join(' ');
  var last = ctx.conEntries[ctx.conEntries.length - 1];
  if (last && last.level === level && last.text === text && !kind && last.kind !== 'input') {
    last.count++;
  } else {
    ctx.conEntries.push({ t: Date.now(), level: level, text: text, count: 1, kind: kind || '' });
    if (ctx.conEntries.length > settings.maxConsole) {
      ctx.conEntries.splice(0, ctx.conEntries.length - settings.maxConsole);
    }
  }
  conRenderNew();
}

function conEcho(kind, text) {
  ctx.conEntries.push({ t: Date.now(), level: 'log', text: text, count: 1, kind: kind });
  conRenderNew();
}

/* patch console methods + global error trapping (runs at script load) */
(function installConsoleCapture() {
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (m) {
    try {
      Object.defineProperty(console, m, {
        value: function () { conEmit(m, arguments); nativeCon[m].apply(null, arguments); },
        writable: true, configurable: true
      });
    } catch (e) { /* some pages lock console */ }
  });
  window.addEventListener('error', function (ev) {
    if (ev.message && ev.message.indexOf('pdt-host') >= 0) return; /* our own UI errors — ignore spillover */
    var loc = '';
    try { if (ev.filename) loc = ' @ ' + String(ev.filename).split('/').pop() + ':' + ev.lineno; } catch (e) { /* noop */ }
    conEmit('error', [(ev.message || 'Script error') + loc]);
  }, true);
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason;
    var msg = (r && (r.stack || r.message)) || String(r);
    conEmit('error', ['Unhandled promise rejection: ' + msg]);
  });
})();

/* ---------------- console panel UI ---------------- */
var conListEl = null, conInputEl = null, histIdx = -1;

function conEntryNode(entry) {
  var timeEl = h('span.pdt-ct', fmtTime(entry.t));
  if (entry.kind === 'input') timeEl.textContent = '\u203A';
  var x = h('span.pdt-cx');
  if (entry.count > 1) x.appendChild(h('span.pdt-cnt', String(entry.count)));
  x.appendChild(document.createTextNode(entry.text));
  var row = h('.pdt-cent', { dataset: { lv: entry.level } }, [timeEl, x]);
  if (entry.kind) row.classList.add('kind-' + entry.kind);
  if (!conPassesFilter(entry)) row.classList.add('hide');
  return row;
}

function conPassesFilter(entry) {
  if (!ctx.conFilters[entry.level]) return false;
  if (ctx.conSearch && entry.text.toLowerCase().indexOf(ctx.conSearch.toLowerCase()) < 0) return false;
  return true;
}

function conRenderNew() {
  if (!conListEl) return;
  var nearBottom = conListEl.scrollHeight - conListEl.scrollTop - conListEl.clientHeight < 60;
  var frag = document.createDocumentFragment();
  for (var i = ctx.conRendered; i < ctx.conEntries.length; i++) frag.appendChild(conEntryNode(ctx.conEntries[i]));
  ctx.conRendered = ctx.conEntries.length;
  conListEl.appendChild(frag);
  while (conListEl.children.length > settings.maxConsole) conListEl.removeChild(conListEl.firstChild);
  if (nearBottom) conListEl.scrollTop = conListEl.scrollHeight;
}

function conRerenderAll() {
  if (!conListEl) return;
  conListEl.textContent = '';
  ctx.conRendered = 0;
  conRenderNew();
}

function conApplyFilter() {
  if (!conListEl) return;
  var kids = conListEl.children;
  for (var i = 0; i < kids.length; i++) {
    var lv = kids[i].dataset ? kids[i].dataset.lv : 'log';
    kids[i].classList.toggle('hide', !ctx.conFilters[lv]);
  }
}

function runCommand(code) {
  code = String(code || '').trim();
  if (!code) return;
  if (code === 'clear' || code === 'cls') { conClear(); return; }
  ctx.history.push(code);
  if (ctx.history.length > 100) ctx.history.shift();
  pdtSet('history', ctx.history);
  histIdx = -1;
  conEcho('input', code);
  var r = evalInPage(code);
  var txt = serialize(r.value, 0);
  if (txt === 'undefined' && r.ok) txt = 'undefined';
  conEmit(r.ok ? 'log' : 'error', [r.ok ? ('\u2190 ' + txt) : txt]);
}

function conClear() {
  ctx.conEntries = [];
  ctx.conRendered = 0;
  if (conListEl) conListEl.textContent = '';
}

registerPanel({
  id: 'console', label: 'Console', icon: 'console',
  render: function (panel) {
    var chips = {};
    [['all', 'All'], ['log', 'Log'], ['info', 'Info'], ['warn', 'Warn'], ['error', 'Error']].forEach(function (c) {
      chips[c[0]] = h('button.pdt-chip', { type: 'button' }, c[1]);
    });
    var search = h('input.pdt-input.pdt-grow', { type: 'search', placeholder: 'Filter messages' });
    search.addEventListener('input', debounce(function () {
      ctx.conSearch = search.value;
      conRerenderAll();
    }, 200));

    chips.all.classList.add('on');
    function setChip() {
      var all = ctx.conFilters.log && ctx.conFilters.info && ctx.conFilters.warn && ctx.conFilters.error;
      chips.all.classList.toggle('on', all);
    }
    chips.all.addEventListener('click', function () {
      var v = !chips.all.classList.contains('on');
      chips.log.classList.toggle('on', v); chips.info.classList.toggle('on', v);
      chips.warn.classList.toggle('on', v); chips.error.classList.toggle('on', v);
      ctx.conFilters = { log: v, info: v, warn: v, error: v };
      conApplyFilter(); setChip();
    });
    ['log', 'info', 'warn', 'error'].forEach(function (lv) {
      chips[lv].classList.add('on');
      chips[lv].addEventListener('click', function () {
        ctx.conFilters[lv] = !ctx.conFilters[lv];
        chips[lv].classList.toggle('on', ctx.conFilters[lv]);
        conApplyFilter(); setChip();
      });
    });

    conListEl = h('.pdt-clog');

    var input = h('input.pdt-input.pdt-grow', { type: 'text', placeholder: 'Run JavaScript…', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
    conInputEl = input;
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runCommand(input.value); input.value = ''; }
    });
    function hist(dir) {
      if (!ctx.history.length) return;
      if (histIdx === -1) histIdx = ctx.history.length;
      histIdx = Math.max(0, Math.min(ctx.history.length - 1, histIdx + dir));
      input.value = ctx.history[histIdx] || '';
      if (dir > 0 && histIdx >= ctx.history.length - 1) histIdx = ctx.history.length - 1;
    }
    function openFull() {
      var area = h('textarea.pdt-area', { placeholder: 'Type multiple lines of JavaScript, then Run', spellcheck: 'false' });
      area.value = input.value;
      var full = h('.pdt-cfull', [
        h('.pdt-row', [
          h('button.pdt-ib', { type: 'button', onclick: function () { full.remove(); input.focus(); } }, iconEl('close')),
          h('span.pdt-grow'),
          h('button.pdt-btn.acc', { type: 'button', onclick: function () { runCommand(area.value); full.remove(); } }, [iconEl('play', 14), 'Run'])
        ]),
        area
      ]);
      panel.appendChild(full);
      area.focus();
    }

    panel.appendChild(h('.pdt-toolbar', [
      chips.all, chips.log, chips.info, chips.warn, chips.error, search,
      h('button.pdt-ib', { type: 'button', title: 'Clear console', onclick: conClear }, iconEl('trash'))
    ]));
    panel.appendChild(conListEl);
    panel.appendChild(h('.pdt-cin', [
      h('button.pdt-ib', { type: 'button', title: 'Previous command', onclick: function () { hist(1); } }, iconEl('up')),
      h('button.pdt-ib', { type: 'button', title: 'Next command', onclick: function () { hist(-1); } }, iconEl('down')),
      input,
      h('button.pdt-ib', { type: 'button', title: 'Full-screen editor', onclick: openFull }, iconEl('maximize')),
      h('button.pdt-ib', { type: 'button', title: 'Run', onclick: function () { runCommand(input.value); input.value = ''; } }, iconEl('play'))
    ]));
    conRerenderAll();
  },
  onShow: function () { conRenderNew(); }
});
