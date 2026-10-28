/*
 * 05-console.js — full console API capture + object inspector + Console panel
 *
 * Captures: log, info, warn, error, debug, table, time/timeEnd/timeLog,
 * count/countReset, group/groupEnd, trace, dir, assert, clear.
 * Console helpers installed on window: $, $$, $x, $_, $0, copy, clear,
 * inspect, keys, values, getListeners.
 */

var nativeCon = {};
var CON_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'table', 'time', 'timeEnd', 'timeLog',
  'count', 'countReset', 'group', 'groupCollapsed', 'groupEnd', 'trace', 'dir',
  'assert', 'clear'];
CON_METHODS.forEach(function (m) {
  /* save the exact own-property descriptor so destroyTool() can restore it */
  try { natives.conDesc[m] = Object.getOwnPropertyDescriptor(console, m); } catch (e) { natives.conDesc[m] = null; }
  nativeCon[m] = (typeof console[m] === 'function') ? console[m].bind(console) : function () {};
});

function conEmit(level, args, kind, extra) {
  if (!args || !args.length) args = [''];
  var parts = [];
  for (var i = 0; i < args.length; i++) parts.push(serialize(args[i], 0));
  var text = parts.join(' ');
  var entry = {
    t: Date.now(), level: level, text: text, count: 1, kind: kind || '',
    depth: ctx.groupDepth || 0
  };
  if (extra) for (var k in extra) entry[k] = extra[k];
  /* keep raw values for the object inspector (first expandable arg only) */
  if (!entry.vals) {
    for (var j = 0; j < args.length && j < 4; j++) {
      if (args[j] && typeof args[j] === 'object') {
        try { if (isExpandable(args[j])) { entry.val = args[j]; break; } } catch (e) { /* hostile object */ }
      }
    }
  }
  var last = ctx.conEntries[ctx.conEntries.length - 1];
  if (last && last.level === level && last.text === text && !kind && last.kind !== 'input' &&
      !entry.table && !entry.stack && !entry.depth) {
    last.count++;
  } else {
    ctx.conEntries.push(entry);
    if (ctx.conEntries.length > settings.maxConsole) {
      ctx.conEntries.splice(0, ctx.conEntries.length - settings.maxConsole);
    }
  }
  try { conRenderNew(); } catch (e) { pdError(e, 'conRender'); }
}

function conEcho(kind, text) {
  ctx.conEntries.push({ t: Date.now(), level: 'log', text: text, count: 1, kind: kind, depth: 0 });
  conRenderNew();
}

/* patch the whole console API (runs at script load).
 * Every patched method: our capture logic runs inside safe() so a hostile
 * argument (throwing getters, revoked proxies, …) can NEVER make the page's
 * console call throw — and the native console still receives everything. */
(function installConsoleCapture() {
  function patch(method, fn) {
    try {
      Object.defineProperty(console, method, {
        value: fn, writable: true, configurable: true
      });
      stab().diag.console = true;
    } catch (e) { /* some pages lock console */ }
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (m) {
    patch(m, function () {
      var a = arguments;
      safe(function () { conEmit(m, a); }, 'console.' + m)();
      return nativeCon[m].apply(null, a);
    });
  });

  patch('table', function (data, props) {
    safe(function () {
      var tbl = null;
      try { tbl = buildTableData(data, props); } catch (e) { tbl = null; }
      if (tbl) conEmit('log', [tbl.caption || 'console.table'], '', { table: tbl });
      else conEmit('warn', ['console.table: data must be an array or object']);
    }, 'console.table')();
    try { nativeCon.table(data, props); } catch (e) { /* noop */ }
  });

  patch('time', function (label) {
    safe(function () {
      var lb = label || 'default';
      if (ctx.conTimers[lb] != null) conEmit('warn', ['Timer "' + lb + '" already exists']);
      else ctx.conTimers[lb] = netNow();
    }, 'console.time')();
    try { nativeCon.time(label); } catch (e) { /* noop */ }
  });
  function timerEmit(label) {
    var lb = label || 'default';
    var t0 = ctx.conTimers[lb];
    if (t0 == null) { conEmit('warn', ['Timer "' + lb + '" does not exist']); return null; }
    return fmtMs(netNow() - t0);
  }
  patch('timeLog', function (label) {
    safe(function () {
      var ms = timerEmit(label);
      if (ms != null) conEmit('log', [(label || 'default') + ': ' + ms]);
    }, 'console.timeLog')();
    try { nativeCon.timeLog(label); } catch (e) { /* noop */ }
  });
  patch('timeEnd', function (label) {
    safe(function () {
      var ms = timerEmit(label);
      if (ms != null) {
        delete ctx.conTimers[label || 'default'];
        conEmit('log', [(label || 'default') + ': ' + ms]);
      }
    }, 'console.timeEnd')();
    try { nativeCon.timeEnd(label); } catch (e) { /* noop */ }
  });

  patch('count', function (label) {
    safe(function () {
      var lb = label || 'default';
      ctx.conCounters[lb] = (ctx.conCounters[lb] || 0) + 1;
      conEmit('log', [lb + ': ' + ctx.conCounters[lb]]);
    }, 'console.count')();
    try { nativeCon.count(label); } catch (e) { /* noop */ }
  });
  patch('countReset', function (label) {
    safe(function () { delete ctx.conCounters[label || 'default']; }, 'console.countReset')();
    try { nativeCon.countReset(label); } catch (e) { /* noop */ }
  });

  function groupPatch(method, collapsed) {
    patch(method, function () {
      var a = arguments;
      safe(function () {
        var label = (a.length && serialize(a[0], 0)) || 'group';
        conEmit('log', ['\u25BE ' + label], '', { group: collapsed ? 'collapsed' : 'open' });
        ctx.groupDepth++;
      }, 'console.' + method)();
      try { nativeCon[method].apply(null, a); } catch (e) { /* noop */ }
    });
  }
  groupPatch('group', false);
  groupPatch('groupCollapsed', true);
  patch('groupEnd', function () {
    safe(function () { ctx.groupDepth = Math.max(0, ctx.groupDepth - 1); }, 'console.groupEnd')();
    try { nativeCon.groupEnd(); } catch (e) { /* noop */ }
  });

  patch('trace', function () {
    var a = arguments;
    safe(function () {
      var stack = '';
      try { stack = String(new Error().stack || '').split('\n').slice(1, 7).join('\n'); } catch (e) { /* noop */ }
      var msg = a.length ? Array.prototype.map.call(a, function (x) { return serialize(x, 0); }).join(' ') : 'console.trace';
      conEmit('log', [msg], '', { stack: stack || '(stack unavailable)' });
    }, 'console.trace')();
    try { nativeCon.trace(); } catch (e) { /* noop */ }
  });

  patch('dir', function (obj) {
    safe(function () { conEmit('log', [obj], 'dir'); }, 'console.dir')();
    try { nativeCon.dir(obj); } catch (e) { /* noop */ }
  });
  patch('assert', function (cond) {
    var a = arguments;
    safe(function () {
      if (!cond) {
        var rest = Array.prototype.slice.call(a, 1);
        conEmit('error', ['Assertion failed: ' + (rest.length ? rest.map(function (x) { return serialize(x, 0); }).join(' ') : 'console.assert')]);
      }
    }, 'console.assert')();
    try { nativeCon.assert.apply(null, a); } catch (e) { /* noop */ }
  });
  patch('clear', function () {
    safe(conClear, 'console.clear')();
    try { nativeCon.clear(); } catch (e) { /* noop */ }
  });

  /* window error handlers — wrapped so a hostile error reason can never
   * start an error -> handler -> error loop */
  onEvt(window, 'error', function (ev) {
    safe(function () {
      if (ev && ev.message && String(ev.message).indexOf('pdt-host') >= 0) return; /* our own UI errors */
      var loc = '';
      try { if (ev.filename) loc = ' @ ' + String(ev.filename).split('/').pop() + ':' + ev.lineno; } catch (e) { /* noop */ }
      conEmit('error', [((ev && ev.message) || 'Script error') + loc]);
    }, 'window.onerror')();
  }, true);
  onEvt(window, 'unhandledrejection', function (ev) {
    safe(function () {
      var r = ev && ev.reason;
      var msg;
      try { msg = (r && (r.stack || r.message)) || String(r); }
      catch (e) { msg = '(unserializable rejection reason)'; }
      conEmit('error', ['Unhandled promise rejection: ' + msg]);
    }, 'unhandledrejection')();
  });

  installConsoleHelpers();
})();

/* ---------------- console.table data ---------------- */
function buildTableData(data, props) {
  if (data == null || typeof data !== 'object') return null;
  var rows = [], cols = [];
  var isArr = Array.isArray(data);
  var indices = isArr ? data.map(function (_, i) { return i; })
    : (typeof Map !== 'undefined' && data instanceof Map) ? Array.from(data.keys()) : Object.keys(data);
  var values = isArr ? data
    : (typeof Map !== 'undefined' && data instanceof Map) ? Array.from(data.values())
    : indices.map(function (k) { return data[k]; });

  /* value column keys */
  var valueKeys = [];
  values.forEach(function (v) {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      try { Object.keys(v).forEach(function (k) { if (valueKeys.indexOf(k) < 0) valueKeys.push(k); }); } catch (e) { /* noop */ }
    }
  });
  if (props && props.length) valueKeys = props.slice();
  cols = ['(index)'].concat(valueKeys.length ? valueKeys : ['Value']);

  indices.forEach(function (idx, i) {
    var v = values[i];
    var row = [String(idx)];
    if (valueKeys.length) {
      valueKeys.forEach(function (k) {
        var cell = (v && typeof v === 'object') ? v[k] : (valueKeys.length === 1 ? v : undefined);
        row.push(cell === undefined ? '' : truncate(serialize(cell, 1), 60));
      });
    } else {
      row.push(truncate(serialize(v, 1), 60));
    }
    rows.push(row);
  });
  if (rows.length > 200) rows = rows.slice(0, 200);
  return { cols: cols, rows: rows, caption: (isArr ? 'Array(' + data.length + ')' : 'Object') + ' · ' + rows.length + ' rows' };
}

/* ---------------- object inspector tree ---------------- */
function objTreeNode(key, val, depth) {
  var kind = objKind(val);
  var expandable = isExpandable(val);
  var row = h('.pdt-onode');
  row.style.paddingLeft = (depth * 14) + 'px';

  var tw = h('span.pdt-tw', expandable ? '\u25B8' : '');
  var keyEl = h('span.pdt-okey', key + ':');
  var valEl = h('span.pdt-oval.pdt-tv-' + kind);
  valEl.textContent = expandable ? objPreview(val) : serialize(val, 1);
  if (kind === 'string') valEl.textContent = '"' + valEl.textContent + '"';
  row.appendChild(tw); row.appendChild(keyEl); row.appendChild(valEl);

  if (expandable) {
    var built = false;
    var kidsWrap = null;
    tw.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!built) {
        built = true;
        kidsWrap = h('div.pdt-okids');
        var pairs = [];
        try {
          if (kind === 'array' || kind === 'object') {
            var keys = kind === 'array' ? val.map(function (_, i) { return String(i); }) : Object.keys(val);
            keys.slice(0, 100).forEach(function (k) { pairs.push([k, kind === 'array' ? val[Number(k)] : val[k]]); });
            if (keys.length > 100) kidsWrap.appendChild(h('.pdt-onode.more', { style: { paddingLeft: ((depth + 1) * 14) + 'px' } }, '\u2026 +' + (keys.length - 100) + ' more'));
          } else if (kind === 'map') {
            val.forEach(function (v, k) { if (pairs.length < 100) pairs.push([serialize(k, 1), v]); });
          } else if (kind === 'set') {
            var n = 0; val.forEach(function (v) { if (n++ < 100) pairs.push([String(n - 1), v]); });
          }
        } catch (e) { /* locked */ }
        pairs.forEach(function (p) {
          if (depth < 6) kidsWrap.appendChild(objTreeNode(p[0], p[1], depth + 1));
        });
        if (!pairs.length) kidsWrap.appendChild(h('.pdt-onode.more', { style: { paddingLeft: ((depth + 1) * 14) + 'px' } }, '(empty)'));
        row.parentNode.insertBefore(kidsWrap, row.nextSibling);
        tw.textContent = '\u25BE';
      } else if (kidsWrap) {
        var hidden = kidsWrap.style.display === 'none';
        kidsWrap.style.display = hidden ? '' : 'none';
        tw.textContent = hidden ? '\u25BE' : '\u25B8';
      }
    });
  }
  return row;
}

/* ---------------- console panel UI ---------------- */
var conListEl = null, conInputEl = null, histIdx = -1;

function conEntryNode(entry) {
  var timeEl = h('span.pdt-ct', fmtTime(entry.t));
  if (entry.kind === 'input') timeEl.textContent = '\u203A';
  var x = h('span.pdt-cx');
  if (entry.count > 1) x.appendChild(h('span.pdt-cnt', String(entry.count)));
  x.appendChild(document.createTextNode(entry.text));

  if (entry.table) {
    var tb = h('table.pdt-table');
    var thd = h('thead');
    thd.appendChild(h('tr', entry.table.cols.map(function (c) { return h('th', String(c)); })));
    tb.appendChild(thd);
    var bod = h('tbody');
    entry.table.rows.forEach(function (r) {
      bod.appendChild(h('tr', r.map(function (c) { return h('td.pdt-mono', String(c)); })));
    });
    tb.appendChild(bod);
    x.appendChild(h('div.pdt-tblw', tb));
  }
  if (entry.stack) {
    x.appendChild(h('pre.pdt-stack', entry.stack));
  }

  var row = h('.pdt-cent', { dataset: { lv: entry.level } }, [timeEl, x]);
  if (entry.kind) row.classList.add('kind-' + entry.kind);
  if (entry.depth) row.style.paddingLeft = (10 + entry.depth * 16) + 'px';
  if (entry.group) { row.classList.add('group-head'); }

  /* object inspector toggle — hostile values must never break rendering */
  var hasVal = false;
  try { hasVal = !!(entry.val && isExpandable(entry.val)); } catch (e) { hasVal = false; }
  if (hasVal) {
    var pv = '{…}';
    try { pv = objPreview(entry.val); } catch (e) { /* hostile */ }
    var toggle = h('button.pdt-otog', pv);
    var built = false;
    toggle.addEventListener('click', safe(function (e) {
      e.stopPropagation();
      if (!built) {
        built = true;
        var wrap = h('div.pdt-otree');
        var kind = objKind(entry.val);
        var pairs = [];
        try {
          if (kind === 'array' || kind === 'object') {
            var keys = kind === 'array' ? entry.val.map(function (_, i) { return String(i); }) : Object.keys(entry.val);
            keys.slice(0, 100).forEach(function (k) { pairs.push([k, kind === 'array' ? entry.val[Number(k)] : entry.val[k]]); });
          } else if (kind === 'map') { entry.val.forEach(function (v, k) { if (pairs.length < 100) pairs.push([serialize(k, 1), v]); }); }
          else if (kind === 'set') { entry.val.forEach(function (v, i) { if (pairs.length < 100) pairs.push([String(i), v]); }); }
        } catch (e2) { /* locked */ }
        pairs.forEach(function (p) { wrap.appendChild(objTreeNode(p[0], p[1], 0)); });
        x.appendChild(wrap);
        toggle.classList.add('open');
        var t2 = '{…}'; try { t2 = objPreview(entry.val); } catch (e3) { /* hostile */ }
        toggle.textContent = '\u25BE ' + t2;
      } else {
        var tr = x.querySelector('.pdt-otree');
        if (tr) {
          var show = tr.style.display === 'none';
          tr.style.display = show ? '' : 'none';
          toggle.classList.toggle('open', show);
          var t3 = '{…}'; try { t3 = objPreview(entry.val); } catch (e4) { /* hostile */ }
          toggle.textContent = (show ? '\u25BE ' : '\u25B8 ') + t3;
        }
      }
    }, 'con.inspect'));
    x.appendChild(toggle);
  }
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
  for (var i = ctx.conRendered; i < ctx.conEntries.length; i++) {
    try { frag.appendChild(conEntryNode(ctx.conEntries[i])); }
    catch (e) { pdError(e, 'conNode'); }   /* one bad entry must not kill the batch */
  }
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
  ctx.lastResult = r.ok ? r.value : undefined;   /* $_ */
  var txt = serialize(r.value, 0);
  if (r.ok) {
    conEmit('log', ['\u2190 ' + txt], '', (r.value && isExpandable(r.value)) ? { val: r.value } : null);
  } else {
    conEmit('error', [txt]);
  }
}

function conClear() {
  ctx.conEntries = [];
  ctx.conRendered = 0;
  ctx.groupDepth = 0;
  ctx.conTimers = {};
  if (conListEl) conListEl.textContent = '';
}

registerPanel({
  id: 'console', label: 'Console', icon: 'console',
  render: function (panel) {
    var chips = {};
    [['all', 'All'], ['log', 'Log'], ['info', 'Info'], ['warn', 'Warn'], ['error', 'Error'], ['debug', 'Debug']].forEach(function (c) {
      chips[c[0]] = h('button.pdt-chip', { type: 'button' }, c[1]);
    });
    var search = h('input.pdt-input.pdt-grow', { type: 'search', placeholder: 'Filter messages' });
    search.addEventListener('input', debounce(function () {
      ctx.conSearch = search.value;
      conRerenderAll();
    }, 200));

    chips.all.classList.add('on');
    function setChip() {
      var all = ctx.conFilters.log && ctx.conFilters.info && ctx.conFilters.warn && ctx.conFilters.error && ctx.conFilters.debug;
      chips.all.classList.toggle('on', all);
    }
    chips.all.addEventListener('click', function () {
      var v = !chips.all.classList.contains('on');
      chips.log.classList.toggle('on', v); chips.info.classList.toggle('on', v);
      chips.warn.classList.toggle('on', v); chips.error.classList.toggle('on', v);
      chips.debug.classList.toggle('on', v);
      ctx.conFilters = { log: v, info: v, warn: v, error: v, debug: v };
      conApplyFilter(); setChip();
    });
    ['log', 'info', 'warn', 'error', 'debug'].forEach(function (lv) {
      chips[lv].classList.add('on');
      chips[lv].addEventListener('click', function () {
        ctx.conFilters[lv] = !ctx.conFilters[lv];
        chips[lv].classList.toggle('on', ctx.conFilters[lv]);
        conApplyFilter(); setChip();
      });
    });

    conListEl = h('.pdt-clog');

    var input = h('input.pdt-input.pdt-grow', { type: 'text', placeholder: 'Run JavaScript\u2026 ($ $0 $$ $x copy \u2026)', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
    conInputEl = input;
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runCommand(input.value); input.value = ''; }
      else if (e.key === 'ArrowUp') { e.preventDefault(); hist(1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); hist(-1); }
    });
    function hist(dir) {
      if (!ctx.history.length) return;
      if (histIdx === -1) histIdx = ctx.history.length;
      /* dir=1 (up) walks to older entries (lower index); dir=-1 (down) to newer */
      histIdx = histIdx - dir;
      if (histIdx < 0) histIdx = 0;
      if (histIdx >= ctx.history.length) { histIdx = -1; input.value = ''; return; }
      input.value = ctx.history[histIdx] || '';
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
