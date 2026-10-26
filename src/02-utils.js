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
      if (k === 'style' && typeof v === 'object') { for (var sk in v) el.style[sk] = v[sk]; }
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') { for (var dk in v) el.dataset[dk] = v[dk]; }
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selectedIndex') { try { el[k] = v; } catch (e) { /* noop */ } }
      else el.setAttribute(k, v);
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
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'
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
    t = setTimeout(function () { fn.apply(self, a); }, ms || 150);
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
    document.body.appendChild(ta);
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

/* ---------------- serialization for console ---------------- */
function serialize(v, depth) {
  depth = depth || 0;
  try {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    var t = typeof v;
    if (t === 'string') return v;
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
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
    toast('Downloading ' + name);
  } catch (e) { toast('Download failed'); }
}
