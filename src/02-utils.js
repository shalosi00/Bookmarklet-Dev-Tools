/*
 * 02-utils.js — DOM helper, icons, formatting, clipboard, toast, modal, eval
 */

/* Tiny hyperscript: h('div.cls#id', {attrs|listeners}, kidsArray|text|Node) */
function h(sel, attrs, kids) {
  if (attrs && (typeof attrs === 'string' || typeof attrs === 'number' ||
                Array.isArray(attrs) || attrs instanceof Node)) {
    kids = (kids == null) ? attrs
      : (Array.isArray(kids) ? [attrs].concat(kids) : [attrs, kids]);
    attrs = null;
  }
  var m = /^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/.exec(sel || 'div');
  var el = document.createElement(m && m[1] ? m[1] : 'div');
  var rest = m ? m[2] : '';
  var re = /([.#])([\w-]+)/g, t;
  while ((t = re.exec(rest))) {
    if (t[1] === '.') el.classList.add(t[2]); else el.id = t[2];
  }
  if (attrs) {
    for (var k in attrs) {
      var v = attrs[k];
      if (v == null) continue;
      if (k === 'style' && typeof v === 'object') { for (var sk in v) { try { el.style[sk] = v[sk]; } catch (e) { /* noop */ } } }
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), safe(v, 'ui.' + k));
      else if (k === 'dataset') { for (var dk in v) { try { el.dataset[dk] = v[dk]; } catch (e) { /* noop */ } } }
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selectedIndex') { try { el[k] = v; } catch (e) { /* noop */ } }
      else { try { el.setAttribute(k, v); } catch (e) { /* noop */ } }
    }
  }
  addKids(el, kids);
  return el;
}
function addKids(el, kids) {
  if (kids == null) return;
  if (Array.isArray(kids)) { kids.forEach(function (kk) { addKids(el, kk); }); return; }
  if (kids instanceof Node) { el.appendChild(kids); return; }
  el.appendChild(document.createTextNode(String(kids)));
}

/* ---------------- inline SVG icons (feather-style, stroke=currentColor) --------- */
var ICONS = {
  console: '<path d="M4 17l6-6-6-6"/><path d="M12 19h8"/>',
  cmd: '<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  repeat: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  type: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  elements: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.83z"/><path d="M7 7h.01"/>',
  styles: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  network: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  sources: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>',
  storage: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  perf: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  utils: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  plugins: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  close: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
  back: '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>',
  up: '<path d="M18 15l-6-6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  inspect: '<circle cx="12" cy="12" r="10"/><path d="M22 12h-4"/><path d="M6 12H2"/><path d="M12 6V2"/><path d="M12 22v-4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  play: '<path d="M5 3l14 9-14 9V3z"/>',
  pause: '<path d="M6 4h4v16H6z"/><path d="M14 4h4v16h-4z"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  refresh: '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  shieldoff: '<path d="M19.69 14a6.9 6.9 0 0 0 .31-2V5l-8-3-3.16 1.18"/><path d="M4.73 4.73L4 5v7c0 6 8 10 8 10a20.29 20.29 0 0 0 5.62-4.38"/><path d="M1 1l22 22"/>',
  droplet: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  table: '<path d="M12 3v18"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  hash: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3L8 21"/><path d="M16 3l-2 18"/>',
  film: '<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><path d="M7 2v20"/><path d="M17 2v20"/><path d="M2 12h20"/><path d="M2 7h5"/><path d="M2 17h5"/><path d="M17 17h5"/><path d="M17 7h5"/>',
  code: '<polyline points="16 18 22 12 16 6 8 6 2 12 8 18 16 18"/>',
  file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  checkc: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
  xc: '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>',
  scroll: '<path d="M8 6l4-4 4 4"/><path d="M16 18l-4 4-4-4"/><path d="M12 2v20"/>'
};
function iconSvg(name, size) {
  return '<svg viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) +
    '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (ICONS[name] || '') + '</svg>';
}
function iconEl(name, size) {
  return h('span.pdt-ic', { innerHTML: iconSvg(name, size) });
}

/* ---------------- formatting ---------------- */
function fmtBytes(n) {
  if (n == null) return '—';
  n = Number(n);
  if (isNaN(n)) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}
function fmtMs(n) {
  if (n == null || isNaN(n)) return '—';
  if (n < 1) return '<1 ms';
  if (n < 1000) return Math.round(n) + ' ms';
  return (n / 1000).toFixed(2) + ' s';
}
function fmtTime(ts) {
  var d = new Date(ts);
  function p(x) { return (x < 10 ? '0' : '') + x; }
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + (d.getMilliseconds() / 1000).toFixed(3).slice(2, 5);
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function truncate(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}
function clipUrl(u) {
  u = String(u);
  try {
    var url = new URL(u, location.href);
    var host = url.host, path = url.pathname + url.search;
    if (path.length > 42) path = path.slice(0, 20) + '…' + path.slice(-20);
    return host + path;
  } catch (e) { return truncate(u, 48); }
}
function debounce(fn, ms) {
  var t = null;
  return function () {
    var a = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function () { try { fn.apply(self, a); } catch (e) { pdError(e, 'debounce'); } }, ms || 150);
  };
}

/* ---------------- clipboard ---------------- */
function copyText(text, silent) {
  function done(ok) { if (!silent) toast(ok ? 'Copied to clipboard' : 'Copy failed — long-press to copy manually'); }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); });
      return;
    }
  } catch (e) { /* fall through */ }
  fallback();
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    (document.body || document.documentElement).appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    done(ok);
  }
}

/* ---------------- toast + modal ---------------- */
var toastTimer = null;
function toast(msg) {
  if (!app) return;
  var t = app.querySelector('.pdt-toast');
  if (!t) { t = h('.pdt-toast'); app.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
}

function modal(title, build, wide) {
  var ov = h('.pdt-mov');
  var body = h('.pdt-mbody');
  var box = h('.pdt-modal' + (wide ? '.wide' : ''), [
    h('.pdt-mhead', [
      h('span.pdt-mtitle', truncate(title, 60)),
      h('button.pdt-ib', { type: 'button', 'aria-label': 'Close', onclick: close }, iconEl('close'))
    ]),
    body
  ]);
  function close() { if (ov.parentNode) ov.remove(); }
  ov.addEventListener('pointerdown', function (e) { if (e.target === ov) close(); });
  ov.appendChild(box);
  app.appendChild(ov);
  build(body, close);
  return { close: close, body: body };
}

function confirmModal(msg, yesLabel, onYes, danger) {
  modal('Confirm', function (body, close) {
    body.appendChild(h('p.pdt-mtext', msg));
    body.appendChild(h('.pdt-mfoot', [
      h('button.pdt-btn', { type: 'button', onclick: close }, 'Cancel'),
      h('button.pdt-btn' + (danger ? '.danger' : '.acc'), { type: 'button', onclick: function () { close(); onYes(); } }, yesLabel || 'OK')
    ]));
  });
}

/* Single-field input modal (used for CSS overrides, quick renames, …) */
function promptModal(title, label, value, cb, opts) {
  opts = opts || {};
  var inp = opts.multiline
    ? h('textarea.pdt-area', { rows: 4, spellcheck: 'false' })
    : h('input.pdt-input', { autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
  inp.value = value == null ? '' : String(value);
  modal(title, function (body, close) {
    body.appendChild(h('.pdt-label', label));
    body.appendChild(inp);
    if (opts.hint) body.appendChild(h('p.pdt-mtext', { style: { fontSize: '.82em' } }, opts.hint));
    body.appendChild(h('.pdt-mfoot', [
      h('button.pdt-btn', { type: 'button', onclick: close }, 'Cancel'),
      h('button.pdt-btn.acc', { type: 'button', onclick: function () { var v = inp.value; close(); cb(v); } }, opts.ok || 'Apply')
    ]));
    setTimeout(function () { try { inp.focus(); if (inp.select) inp.select(); } catch (e) { /* noop */ } }, 60);
  });
}

/* ---------------- serialization for console ---------------- */
function serialize(v, depth) {
  depth = depth || 0;
  try {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    var t = typeof v;
    if (t === 'string') return v.length > 10000 ? v.slice(0, 10000) + '… [truncated]' : v;
    if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
    if (t === 'function') return 'ƒ ' + (v.name || 'anonymous') + '()';
    if (t === 'symbol') return v.toString();
    if (v instanceof Error) return (v.stack ? String(v.stack) : v.name + ': ' + v.message);
    if (v instanceof Date) return v.toISOString();
    if (typeof Element !== 'undefined' && v instanceof Element) {
      var s = '<' + v.tagName.toLowerCase();
      if (v.id) s += '#' + v.id;
      if (v.classList && v.classList.length) s += '.' + Array.prototype.slice.call(v.classList, 0, 4).join('.');
      return s + '>';
    }
    if (typeof Window !== 'undefined' && v === window) return 'Window';
    if (depth > 3) return Array.isArray(v) ? '[…]' : '{…}';
    if (Array.isArray(v)) {
      return '[' + v.slice(0, 80).map(function (x) { return serialize(x, depth + 1); }).join(', ') +
        (v.length > 80 ? ', … +' + (v.length - 80) : '') + ']';
    }
    var keys = Object.keys(v);
    return '{ ' + keys.slice(0, 40).map(function (k) { return k + ': ' + serialize(v[k], depth + 1); }).join(', ') +
      (keys.length > 40 ? ', … +' + (keys.length - 40) + ' keys' : '') + ' }';
  } catch (e) {
    try { return String(v); } catch (e2) { return '[unserializable]'; }
  }
}

/* ---------------- eval in page (global) scope ---------------- */
function evalInPage(code) {
  try {
    var res = (0, eval)(code);
    ctx.lastResult = res;   /* keep $_ in sync for every eval path */
    return { ok: true, value: res };
  } catch (e) {
    return { ok: false, value: (e && (e.stack || e.message)) || String(e) };
  }
}

function downloadFile(name, content, mime) {
  try {
    var blob = new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    (document.body || document.documentElement).appendChild(a);
    a.click();
    setTimeout(function () { try { URL.revokeObjectURL(url); a.remove(); } catch (e) { /* noop */ } }, 400);
    toast('Downloading ' + name);
  } catch (e) { toast('Download failed'); }
}

/* ---------------- console command helpers ($ $0..$4 $$ $x copy inspect …) ---------------- */
function installConsoleHelpers() {
  function def(name, get, fn) {
    /* A descriptor may carry EITHER a getter OR a value — never both.
       (The old {get:null,value:fn} form throws TypeError on every engine,
        which silently disabled ALL helpers.) */
    var d = { configurable: true };
    if (typeof get === 'function') d.get = get;
    else { d.value = fn; d.writable = true; }
    try { Object.defineProperty(window, name, d); }
    catch (e) { /* page locks globals — skip silently */ }
  }
  def('$', null, function (sel, scope) { return (scope || document).querySelector(sel); });
  def('$$', null, function (sel, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(sel));
  });
  def('$x', null, function (xp, scope) {
    var out = [], r = null;
    try {
      r = document.evaluate(xp, scope || document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (var i = 0; i < r.snapshotLength; i++) out.push(r.snapshotItem(i));
    } catch (e) { /* invalid xpath */ }
    return out;
  });
  def('$_', function () { return ctx.lastResult; });
  def('$0', function () { return ctx.selHistory[0] || ctx.selected || null; });
  def('$1', function () { return ctx.selHistory[1] || null; });
  def('$2', function () { return ctx.selHistory[2] || null; });
  def('$3', function () { return ctx.selHistory[3] || null; });
  def('$4', function () { return ctx.selHistory[4] || null; });
  def('copy', null, function (text) { copyText(typeof text === 'string' ? text : serialize(text, 2)); });
  def('clear', null, function () { conClear(); });
  def('inspect', null, function (el) {
    if (el && el.nodeType === 1) { selectElement(el); }
    else toast('inspect(element) — pass a DOM element');
  });
  def('keys', null, function (o) { try { return Object.keys(o); } catch (e) { return []; } });
  def('values', null, function (o) { try { return Object.values(o); } catch (e) { return []; } });
  def('getListeners', null, function (el) { return listenersFor(el); });
  def('monitorEvents', null, function (el, types) {
    if (!el || !el.addEventListener) { toast('monitorEvents(element, [types])'); return; }
    types = types || ['click', 'input', 'change', 'keydown', 'scroll', 'touchstart'];
    types.forEach(function (t) {
      el.addEventListener(t, safe(function (e) {
        conEmit('info', ['[event] ' + (el.tagName || 'obj') + ' ' + t + ' ' + serialize({
          type: e.type, target: (e.target && e.target.tagName) || '?',
          key: e.key, x: e.clientX, y: e.clientY, value: (e.target && e.target.value || '').slice ? String(e.target.value).slice(0, 80) : undefined
        }, 1)]);
      }, 'monitorEvents'), { passive: true });
    });
    return 'Monitoring ' + types.join(', ') + ' — events print to the console';
  });
  def('pdt', function () { return window.__POCKET_DEVTOOLS__ || {}; });
}

/* ---------------- lightweight JSON-path pretty print for the object inspector ---------------- */
/* ---------------- hostile-object-safe kind detection ----------------
 * Objects logged to the console can be Proxies with throwing traps or
 * revoked proxies — every access must be guarded so inspecting them can
 * never throw into the page. */
function objKind(v) {
  if (v === null) return 'null';
  var t = typeof v;
  if (t !== 'object') return t;             /* covers function/symbol/… */
  try { if (Array.isArray(v)) return 'array'; } catch (e) { return 'opaque'; }
  function isA(C) { try { return v instanceof C; } catch (e) { return false; } }
  if (typeof Element !== 'undefined' && isA(Element)) return 'element';
  if (typeof Window !== 'undefined' && v === window) return 'window';
  if (isA(Date)) return 'date';
  if (isA(Error)) return 'error';
  if (isA(RegExp)) return 'regexp';
  if (typeof Map !== 'undefined' && isA(Map)) return 'map';
  if (typeof Set !== 'undefined' && isA(Set)) return 'set';
  return 'object';
}
function objPreview(v) {
  try {
    var k = objKind(v);
    if (k === 'array') return 'Array(' + v.length + ')';
    if (k === 'object') {
      try { return '{' + Object.keys(v).length + ' keys}'; } catch (e) { return '{…}'; }
    }
    if (k === 'map') return 'Map(' + v.size + ')';
    if (k === 'set') return 'Set(' + v.size + ')';
    return serialize(v, 0);
  } catch (e) { return '{…}'; }
}
function isExpandable(v) {
  try {
    var k = objKind(v);
    return k === 'array' || k === 'object' || k === 'map' || k === 'set';
  } catch (e) { return false; }
}

/* ---------------- color parsing / contrast (Utils > Color tool) ---------------- */
function parseColorStr(s) {
  s = String(s || '').trim().toLowerCase();
  var m;
  function num(x) { var v = parseFloat(x); return isNaN(v) ? null : v; }
  if ((m = /^#([0-9a-f]{3})$/.exec(s))) {
    return { r: parseInt(m[1].charAt(0) + m[1].charAt(0), 16), g: parseInt(m[1].charAt(1) + m[1].charAt(1), 16), b: parseInt(m[1].charAt(2) + m[1].charAt(2), 16) };
  }
  if ((m = /^#([0-9a-f]{6})$/.exec(s))) {
    return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
  }
  if ((m = /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/.exec(s))) {
    return { r: +m[1], g: +m[2], b: +m[3] };
  }
  if ((m = /^hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/.exec(s))) {
    var h = num(m[1]) / 360, sat = num(m[2]) / 100, li = num(m[3]) / 100;
    if (h == null || sat == null || li == null) return null;
    var q = li < 0.5 ? li * (1 + sat) : li + sat - li * sat, p = 2 * li - q;
    function hue2rgb(pp, qq, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return pp + (qq - pp) * 6 * t;
      if (t < 1 / 2) return qq;
      if (t < 2 / 3) return pp + (qq - pp) * (2 / 3 - t) * 6;
      return pp;
    }
    return { r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255), g: Math.round(hue2rgb(p, q, h) * 255), b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255) };
  }
  return null;
}
function rgbToHex(r, g, b) {
  function hx(v) { v = Math.max(0, Math.min(255, Math.round(v))); return ('0' + v.toString(16)).slice(-2); }
  return '#' + hx(r) + hx(g) + hx(b);
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  var h = 0, s = 0, l = (mx + mn) / 2;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (mx === g) h = ((b - r) / d + 2);
    else h = ((r - g) / d + 4);
    h *= 60;
  }
  return 'hsl(' + Math.round(h) + ', ' + Math.round(s * 100) + '%, ' + Math.round(l * 100) + '%)';
}
function relLuminance(r, g, b) {
  function ch(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
function contrastRatio(rgb1, rgb2) {
  var l1 = relLuminance(rgb1.r, rgb1.g, rgb1.b), l2 = relLuminance(rgb2.r, rgb2.g, rgb2.b);
  var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------------- base64 / JWT / encoding helpers (Utils > Transformer) ---------------- */
function b64EncodeUtf8(s) {
  try {
    var bytes = new TextEncoder().encode(String(s)), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  } catch (e) { return null; }
}
function b64DecodeUtf8(s) {
  try {
    var bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch (e) { return null; }
}
function jwtDecode(token) {
  token = String(token || '').trim();
  var parts = token.split('.');
  if (parts.length < 2) return null;
  var h = b64DecodeUtf8(parts[0]), p = b64DecodeUtf8(parts[1]);
  if (!h || !p) return null;
  try { return { header: JSON.parse(h), payload: JSON.parse(p), signature: parts[2] || '' }; }
  catch (e) { return null; }
}
function safeDecodeURIComponent(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}
