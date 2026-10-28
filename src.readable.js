/*! Pocket DevTools v5.1.0 | MIT | improved fork of DeveloperExotic/Bookmarklet-Dev-Tools */
/* ===== 01-header.js ===== */
/*
 * Pocket DevTools v5.0 — mobile-first developer tools as a bookmarklet.
 * A clean, readable rewrite of the improved fork of
 * DeveloperExotic/Bookmarklet-Dev-Tools (MIT license).
 *
 * Source layout: src/01-header.js ... src/15-footer.js (concatenated by build.js)
 * The bookmarklet loads the built single file: src.js
 */
(function () {
  'use strict';

  /* Re-injection guard: if already loaded, just toggle the panel. */
  if (window.__POCKET_DEVTOOLS__) {
    try { window.__POCKET_DEVTOOLS__.toggle(); } catch (e) { /* noop */ }
    return;
  }

  var VERSION = '5.1.0';

  /* Build flavour. The userscript edition (pocket-devtools.user.js) sets this
   * flag right before the core runs: capture starts at document-start and the
   * sheet reopens automatically after a page refresh. */
  var IS_USERSCRIPT = window.__PDT_USERSCRIPT__ === true;

  /* ------------------------------------------------------------------ *
   * Settings (persisted in localStorage, namespaced with "pdt:")
   * ------------------------------------------------------------------ */
  var DEFAULTS = {
    theme: 'dark',        /* dark | light | amoled | auto */
    panelHeight: 55,      /* % of viewport height */
    fontSize: 'm',        /* s | m | l */
    maxConsole: 500,      /* max console entries kept */
    netBodyLimit: 65536,  /* response bytes captured per request */
    showFAB: true,
    fabX: null, fabY: null,
    lastTab: 'console',    /* panel re-opened on next load */
    usEnabled: true,       /* userscript: auto-inject on every page */
    usAutoOpenSheet: false,/* userscript: open the sheet on every page load */
    usExcluded: ''         /* userscript: comma/newline-separated host substrings to skip */
  };

  function loadSettings() {
    var s = {};
    try {
      var raw = localStorage.getItem('pdt:settings');
      if (raw) s = JSON.parse(raw) || {};
    } catch (e) { s = {}; }
    for (var k in DEFAULTS) if (!(k in s)) s[k] = DEFAULTS[k];
    return s;
  }
  var settings = loadSettings();

  /* Userscript site exclusion — decided before any hook or UI is installed,
   * so excluded sites stay 100% untouched. */
  if (IS_USERSCRIPT) {
    if (!settings.usEnabled) return;
    var exHost = (location.host || '').toLowerCase();
    var exPats = String(settings.usExcluded || '').split(/[\n,]+/);
    for (var xi = 0; xi < exPats.length; xi++) {
      var xp = exPats[xi].trim().toLowerCase();
      if (xp && exHost && exHost.indexOf(xp) >= 0) return;
    }
  }
  var saveTimer = null;
  function saveSettings() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem('pdt:settings', JSON.stringify(settings)); } catch (e) { /* noop */ }
    }, 250);
  }
  /* The debounced write must survive a refresh/navigation — flush it on
   * pagehide so settings (last tab, toggles…) are never lost mid-debounce. */
  window.addEventListener('pagehide', function () {
    clearTimeout(saveTimer);
    try { localStorage.setItem('pdt:settings', JSON.stringify(settings)); } catch (e) { /* noop */ }
  });

  /* ------------------------------------------------------------------ *
   * App storage helpers (snippets, plugins, console history)
   * ------------------------------------------------------------------ */
  function pdtGet(key, fallback) {
    try {
      var raw = localStorage.getItem('pdt:' + key);
      if (raw == null) return fallback;
      var v = JSON.parse(raw);
      return (v == null) ? fallback : v;
    } catch (e) { return fallback; }
  }
  function pdtSet(key, value) {
    try { localStorage.setItem('pdt:' + key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  /* Session-scoped storage: survives a page refresh, cleared when the tab
   * closes — used to remember whether the sheet was open (userscript mode). */
  function ssGet(key) {
    try { return sessionStorage.getItem('pdt:' + key); } catch (e) { return null; }
  }
  function ssSet(key, value) {
    try {
      if (value == null) sessionStorage.removeItem('pdt:' + key);
      else sessionStorage.setItem('pdt:' + key, value);
    } catch (e) { /* noop */ }
  }

  /* ------------------------------------------------------------------ *
   * Shared context
   * ------------------------------------------------------------------ */
  var ctx = {
    selected: null,                 /* currently selected element */
    selHistory: [],                 /* $0 .. $4 — last 5 selected elements */
    lastResult: undefined,          /* $_ — result of last console command */
    activeTab: (settings.lastTab && /^[a-z]+$/.test(settings.lastTab)) ? settings.lastTab : 'console',
    netEntries: [], netSeq: 0, netPaused: false,
    conEntries: [], conRendered: 0,
    conFilters: { log: true, info: true, warn: true, error: true, debug: true },
    conSearch: '',
    conTimers: {},                  /* console.time() labels */
    conCounters: {},                /* console.count() labels */
    groupDepth: 0,                  /* console.group() indent */
    blockList: pdtGet('blocklist', []),   /* network request blocker patterns */
    history: pdtGet('history', []),
    cssDisabled: false,
    outlineOn: false,
    snippets: pdtGet('snippets', []),
    plugins: pdtGet('plugins', [])
  };

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }


/* ===== 02-utils.js ===== */
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
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
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
      el.addEventListener(t, function (e) {
        conEmit('info', ['[event] ' + (el.tagName || 'obj') + ' ' + t + ' ' + serialize({
          type: e.type, target: (e.target && e.target.tagName) || '?',
          key: e.key, x: e.clientX, y: e.clientY, value: (e.target && e.target.value || '').slice ? String(e.target.value).slice(0, 80) : undefined
        }, 1)]);
      }, { passive: true });
    });
    return 'Monitoring ' + types.join(', ') + ' — events print to the console';
  });
  def('pdt', function () { return window.__POCKET_DEVTOOLS__ || {}; });
}

/* ---------------- lightweight JSON-path pretty print for the object inspector ---------------- */
function objKind(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  var t = typeof v;
  if (t === 'object') {
    if (typeof Element !== 'undefined' && v instanceof Element) return 'element';
    if (typeof Window !== 'undefined' && v === window) return 'window';
    if (v instanceof Date) return 'date';
    if (v instanceof Error) return 'error';
    if (v instanceof RegExp) return 'regexp';
    if (typeof Map !== 'undefined' && v instanceof Map) return 'map';
    if (typeof Set !== 'undefined' && v instanceof Set) return 'set';
    return 'object';
  }
  return t;
}
function objPreview(v) {
  var k = objKind(v);
  if (k === 'array') return 'Array(' + v.length + ')';
  if (k === 'object') {
    try { return '{' + Object.keys(v).length + ' keys}'; } catch (e) { return '{…}'; }
  }
  if (k === 'map') return 'Map(' + v.size + ')';
  if (k === 'set') return 'Set(' + v.size + ')';
  return serialize(v, 0);
}
function isExpandable(v) {
  var k = objKind(v);
  return k === 'array' || k === 'object' || k === 'map' || k === 'set';
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


/* ===== 03-css.js ===== */
/*
 * 03-css.js — all styles, injected inside a closed shadow root (isolated from page CSS)
 */
var CSS = [
':root{--fs:13px}',
'.pdt-root{position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:2147483647;',
'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;',
'font-size:var(--fs,13px);color:var(--fg);-webkit-font-smoothing:antialiased}',
'.pdt-root *,.pdt-root *::before,.pdt-root *::after{box-sizing:border-box;margin:0;padding:0}',
'.pdt-root{--bg:#1e1f24;--bg2:#26282f;--bg3:#30333b;--fg:#e8eaed;--fg2:#b3b7bf;--muted:#7c818a;',
'--border:#3a3d45;--accent:#5b9dff;--accent2:#2b4c7e;--ok:#3fb26f;--warn:#e0a63f;--err:#e0564f;',
'--mono:ui-monospace,"JetBrains Mono","Cascadia Mono",Menlo,Consolas,monospace}',
'.pdt-root[data-theme="light"]{--bg:#ffffff;--bg2:#f2f3f5;--bg3:#e7e9ee;--fg:#1c1e22;--fg2:#42474f;',
'--muted:#8a9099;--border:#d8dbe1;--accent:#2563eb;--accent2:#d6e3fb;--ok:#1f9d55;--warn:#b7791f;--err:#d64545}',
'.pdt-root[data-theme="amoled"]{--bg:#000;--bg2:#0a0a0c;--bg3:#16171b;--fg:#e6e7ea;--fg2:#a9adb4;',
'--muted:#63666d;--border:#232429;--accent:#6ea8ff;--accent2:#12233f;--ok:#34b56f;--warn:#dfa43c;--err:#e2564f}',
'.pdt-root[data-fs="s"]{--fs:12px}.pdt-root[data-fs="l"]{--fs:14.5px}',

'/* ---------- bottom sheet ---------- */',
'.pdt-sheet{position:absolute;left:0;right:0;bottom:0;height:var(--ph,55%);min-height:180px;',
'display:flex;flex-direction:column;pointer-events:auto;background:var(--bg);',
'border-top:1px solid var(--border);border-radius:16px 16px 0 0;',
'box-shadow:0 -10px 40px rgba(0,0,0,.5);transform:translateY(105%);transition:transform .28s cubic-bezier(.32,.72,.35,1)}',
'.pdt-sheet.open{transform:none}',
'.pdt-sheet.nodrag{transition:none}',
'.pdt-handle{flex:none;height:24px;display:flex;align-items:center;justify-content:center;touch-action:none;cursor:ns-resize}',
'.pdt-handle i{width:46px;height:5px;border-radius:3px;background:var(--muted);opacity:.55}',
'.pdt-head{flex:none;display:flex;align-items:center;gap:4px;padding:0 8px 6px}',
'.pdt-title{font-weight:700;font-size:1em;color:var(--fg);margin-right:auto;display:flex;align-items:center;gap:6px}',
'.pdt-title .pdt-ic{color:var(--accent);display:flex}',
'.pdt-ver{font-size:.8em;color:var(--muted);font-weight:400}',
'.pdt-ib{min-width:34px;height:34px;border:0;border-radius:9px;background:transparent;color:var(--fg2);',
'display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font:inherit}',
'.pdt-ib:active{background:var(--bg3)}',
'.pdt-tabs{flex:none;display:flex;gap:2px;overflow-x:auto;padding:0 8px 8px;border-bottom:1px solid var(--border);',
'scrollbar-width:none;-ms-overflow-style:none}',
'.pdt-tabs::-webkit-scrollbar{display:none}',
'.pdt-tab{flex:none;display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border:0;border-radius:9px;',
'background:transparent;color:var(--fg2);font:inherit;font-size:.9em;white-space:nowrap;cursor:pointer}',
'.pdt-tab .pdt-ic{display:flex;opacity:.85}',
'.pdt-tab.on{background:var(--bg3);color:var(--accent);font-weight:600}',
'.pdt-body{flex:1;position:relative;overflow:hidden}',
'.pdt-panel{position:absolute;inset:0;display:none;flex-direction:column;overflow:hidden}',
'.pdt-panel.on{display:flex}',

'/* ---------- generic bits ---------- */',
'.pdt-scroll{flex:1;overflow:auto;padding:10px;overscroll-behavior:contain}',
'.pdt-toolbar{flex:none;display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--border);',
'overflow-x:auto;scrollbar-width:none}',
'.pdt-toolbar::-webkit-scrollbar{display:none}',
'.pdt-btn{flex:none;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:9px;border:1px solid var(--border);',
'background:var(--bg2);color:var(--fg);font:inherit;font-size:.9em;cursor:pointer;white-space:nowrap}',
'.pdt-btn:active{background:var(--bg3)}',
'.pdt-btn.acc{background:var(--accent);border-color:transparent;color:#fff}',
'.pdt-btn.danger{background:var(--err);border-color:transparent;color:#fff}',
'.pdt-btn.ghost{background:transparent}',
'.pdt-btn.on{background:var(--accent2);border-color:var(--accent);color:var(--accent)}',
'.pdt-chip{flex:none;padding:5px 11px;border-radius:99px;border:1px solid var(--border);background:var(--bg2);',
'color:var(--fg2);font:inherit;font-size:.84em;cursor:pointer;white-space:nowrap}',
'.pdt-chip.on{background:var(--accent2);border-color:var(--accent);color:var(--accent);font-weight:600}',
'.pdt-input,.pdt-select,.pdt-area{width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:9px;',
'color:var(--fg);font:inherit;font-size:.95em;padding:8px 10px;min-width:0}',
'.pdt-area{font-family:var(--mono);font-size:.9em;line-height:1.45;resize:vertical;white-space:pre;tab-size:2}',
'.pdt-input:focus,.pdt-area:focus,.pdt-select:focus{outline:none;border-color:var(--accent)}',
'.pdt-input::placeholder,.pdt-area::placeholder{color:var(--muted)}',
'.pdt-label{display:block;font-size:.8em;color:var(--muted);margin:10px 0 4px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}',
'.pdt-row{display:flex;align-items:center;gap:6px}',
'.pdt-grow{flex:1;min-width:0}',
'.pdt-empty{padding:34px 20px;text-align:center;color:var(--muted);font-size:.95em;line-height:1.6}',
'.pdt-empty .pdt-btn{margin-top:12px}',
'.pdt-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:10px}',
'.pdt-kv{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid var(--border);font-size:.92em}',
'.pdt-kv:last-child{border-bottom:0}',
'.pdt-kv b{color:var(--muted);font-weight:500;flex:none}',
'.pdt-kv span{text-align:right;word-break:break-all;font-family:var(--mono);font-size:.92em}',
'.pdt-table{width:100%;border-collapse:collapse;font-size:.9em}',
'.pdt-table th{position:sticky;top:0;background:var(--bg);text-align:left;font-weight:600;color:var(--muted);',
'font-size:.85em;padding:7px 8px;border-bottom:1px solid var(--border);z-index:1}',
'.pdt-table td{padding:7px 8px;border-bottom:1px solid var(--border);vertical-align:top}',
'.pdt-table tr:active td{background:var(--bg2)}',
'.pdt-mono{font-family:var(--mono);font-size:.92em}',
'.pdt-badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:6px;font-family:var(--mono);',
'font-size:.82em;font-weight:700;letter-spacing:.02em}',
'.b-get{background:rgba(63,178,111,.15);color:#5dd08d}.b-get{color:var(--ok)}',
'.b-post{background:rgba(91,157,255,.15);color:var(--accent)}',
'.b-put,.b-patch{background:rgba(224,166,63,.15);color:var(--warn)}',
'.b-delete{background:rgba(224,86,79,.15);color:var(--err)}',
'.b-other{background:var(--bg3);color:var(--fg2)}',
'.s2{color:var(--ok)}.s3{color:var(--accent)}.s4{color:var(--warn)}.s5,.s0{color:var(--err)}.sp{color:var(--muted)}',
'.pdt-sub{flex:none;display:flex;gap:2px;padding:8px 10px 0;overflow-x:auto;scrollbar-width:none}',
'.pdt-sub::-webkit-scrollbar{display:none}',
'.pdt-subb{flex:none;padding:6px 12px;border:0;border-bottom:2px solid transparent;background:none;color:var(--fg2);',
'font:inherit;font-size:.9em;cursor:pointer;white-space:nowrap}',
'.pdt-subb.on{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}',

'/* ---------- console ---------- */',
'.pdt-clog{flex:1;overflow-y:auto;overflow-x:hidden;font-family:var(--mono);font-size:.88em;background:var(--bg)}',
'.pdt-cent{padding:4px 10px;border-bottom:1px solid var(--border);white-space:pre-wrap;word-break:break-word;',
'display:flex;gap:8px;align-items:baseline;line-height:1.5}',
'.pdt-cent:hover{background:var(--bg2)}',
'.pdt-cent .pdt-ct{color:var(--muted);font-size:.82em;flex:none;user-select:none}',
'.pdt-cent .pdt-cx{flex:1;min-width:0}',
'.pdt-cent[data-lv="error"]{color:var(--err);background:rgba(224,86,79,.06)}',
'.pdt-cent[data-lv="warn"]{color:var(--warn);background:rgba(224,166,63,.05)}',
'.pdt-cent[data-lv="info"]{color:var(--accent)}',
'.pdt-cent.kind-input .pdt-cx{color:var(--fg)}',
'.pdt-cent.kind-input .pdt-ct{color:var(--accent)}',
'.pdt-cnt{display:inline-block;min-width:18px;text-align:center;border-radius:99px;background:var(--bg3);',
'color:var(--fg2);font-size:.8em;padding:0 5px;margin-right:4px}',
'.pdt-cent.hide{display:none}',
'.pdt-cin{flex:none;display:flex;gap:6px;padding:8px;border-top:1px solid var(--border);align-items:center}',
'.pdt-cin .pdt-input{font-family:var(--mono)}',
'.pdt-cfull{position:absolute;inset:0;background:var(--bg);display:flex;flex-direction:column;z-index:4;padding:10px;gap:8px}',
'.pdt-cfull .pdt-area{flex:1}',

'/* ---------- elements tree ---------- */',
'.pdt-tree{font-family:var(--mono);font-size:.88em;padding:6px 4px}',
'.pdt-nrow{display:flex;align-items:baseline;gap:3px;padding:4px 6px;border-radius:7px;cursor:pointer;white-space:nowrap}',
'.pdt-nrow:hover{background:var(--bg2)}',
'.pdt-nrow.sel{background:var(--accent2);outline:1px solid var(--accent)}',
'.pdt-tw{flex:none;width:16px;color:var(--muted);display:inline-flex;justify-content:center;user-select:none;font-size:.8em}',
'.pdt-tag{color:var(--accent)}',
'.pdt-attr .an{color:var(--warn)}.pdt-attr .av{color:var(--ok)}',
'.pdt-ntext{color:var(--fg2);font-style:italic;white-space:pre;overflow:hidden;text-overflow:ellipsis;max-width:60vw}',
'.pdt-crumb{flex:none;display:flex;align-items:center;gap:2px;padding:6px 10px;overflow-x:auto;',
'border-bottom:1px solid var(--border);font-family:var(--mono);font-size:.85em;scrollbar-width:none}',
'.pdt-crumb::-webkit-scrollbar{display:none}',
'.pdt-crumb button{border:0;background:none;color:var(--accent);font:inherit;cursor:pointer;padding:3px 5px;border-radius:5px;white-space:nowrap}',
'.pdt-crumb button:active{background:var(--bg3)}',
'.pdt-crumb i{color:var(--muted);font-style:normal}',
'.pdt-crumb button.cur{color:var(--fg);font-weight:700}',

'/* ---------- box model ---------- */',
'.pdt-bm{font-family:var(--mono);font-size:.85em;max-width:420px;margin:0 auto}',
'.pdt-bm .z{border:1px solid var(--border);text-align:center;padding:4px;color:var(--muted)}',
'.pdt-bm .zm{background:rgba(224,166,63,.14);border-color:rgba(224,166,63,.5)}',
'.pdt-bm .zb{background:rgba(224,86,79,.14);border-color:rgba(224,86,79,.5)}',
'.pdt-bm .zp{background:rgba(91,157,255,.14);border-color:rgba(91,157,255,.5)}',
'.pdt-bm .zc{background:rgba(63,178,111,.14);border-color:rgba(63,178,111,.5);color:var(--fg);padding:14px 8px}',
'.pdt-bm .lbl{font-size:.85em;color:var(--muted)}',

'/* ---------- network ---------- */',
'.pdt-nrow2{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border);cursor:pointer}',
'.pdt-nrow2:active{background:var(--bg2)}',
'.pdt-nrow2 .u{flex:1;min-width:0;font-family:var(--mono);font-size:.85em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'.pdt-nrow2 .m{color:var(--muted);font-size:.8em;flex:none}',
'.pdt-reqgrid{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:.88em;padding:4px 0}',
'.pdt-reqgrid b{color:var(--muted);font-weight:500}',
'.pdt-reqgrid span{font-family:var(--mono);word-break:break-all}',
'.pdt-sec{margin:12px 0 4px;font-size:.8em;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.05em}',

'/* ---------- code viewer ---------- */',
'.pdt-viewer{flex:1;display:flex;overflow:auto;font-family:var(--mono);font-size:.85em;line-height:1.55;background:var(--bg)}',
'.pdt-gutter{position:sticky;left:0;flex:none;padding:8px 8px 16px;text-align:right;color:var(--muted);',
'background:var(--bg2);user-select:none;white-space:pre;border-right:1px solid var(--border);opacity:.7}',
'.pdt-codepre{flex:none;padding:8px 14px 16px;white-space:pre}',
'.tk-str{color:var(--ok)}.tk-com{color:var(--muted);font-style:italic}.tk-kw{color:var(--accent)}',
'.tk-num{color:var(--warn)}.tk-tag{color:var(--err)}.tk-attr{color:var(--warn)}',

'/* ---------- waterfall / fps ---------- */',
'.pdt-wf{margin:3px 0 10px}',
'.pdt-wfb{position:relative;height:22px;background:var(--bg2);border-radius:5px;overflow:hidden;margin:3px 0}',
'.pdt-wfb i{position:absolute;top:0;bottom:0;background:var(--accent);border-radius:3px;min-width:2px}',
'.pdt-wfb span{position:absolute;inset:0;display:flex;align-items:center;padding:0 8px;font-size:.8em;',
'font-family:var(--mono);color:var(--fg);text-shadow:0 1px 2px rgba(0,0,0,.5);pointer-events:none}',
'.pdt-fps{display:flex;align-items:center;gap:14px;flex-wrap:wrap}',
'.pdt-fpsnum{font-size:2.1em;font-weight:700;font-family:var(--mono)}',
'.pdt-fps canvas{background:var(--bg2);border-radius:8px}',
'.pdt-swatch{display:inline-flex;align-items:center;gap:6px;margin:3px;padding:5px 9px;border:1px solid var(--border);',
'border-radius:9px;background:var(--bg2);cursor:pointer;font-family:var(--mono);font-size:.82em}',
'.pdt-swatch i{width:15px;height:15px;border-radius:4px;border:1px solid rgba(128,128,128,.4)}',

'/* ---------- FAB, toast, modal ---------- */',
'.pdt-fab{position:absolute;width:48px;height:48px;border-radius:50%;background:var(--bg2);',
'border:1px solid var(--border);color:var(--accent);display:flex;align-items:center;justify-content:center;',
'pointer-events:auto;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.45);touch-action:none;user-select:none;',
'-webkit-user-select:none;-webkit-tap-highlight-color:transparent}',
'.pdt-fab:active{transform:scale(.94)}',
'.pdt-root.sheet-open .pdt-fab{display:none}',
'.pdt-toast{position:absolute;top:16px;left:50%;transform:translateX(-50%) translateY(-12px);background:var(--bg3);',
'color:var(--fg);padding:9px 16px;border-radius:99px;font-size:.9em;opacity:0;pointer-events:none;',
'transition:all .25s;box-shadow:0 4px 16px rgba(0,0,0,.4);border:1px solid var(--border);max-width:86vw;white-space:nowrap;',
'overflow:hidden;text-overflow:ellipsis}',
'.pdt-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}',
'.pdt-mov{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;',
'padding:16px;pointer-events:auto;z-index:10}',
'.pdt-modal{background:var(--bg);border:1px solid var(--border);border-radius:14px;width:100%;max-width:480px;',
'max-height:82%;display:flex;flex-direction:column;box-shadow:0 10px 44px rgba(0,0,0,.55)}',
'.pdt-modal.wide{max-width:640px}',
'.pdt-mhead{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 8px 10px 14px;',
'border-bottom:1px solid var(--border);font-weight:700}',
'.pdt-mbody{flex:1;overflow:auto;padding:14px}',
'.pdt-mtext{color:var(--fg2);line-height:1.55;margin-bottom:14px}',
'.pdt-mfoot{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}',

'/* ---------- settings ---------- */',
'.pdt-themegrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}',
'.pdt-themecard{border:2px solid var(--border);border-radius:12px;overflow:hidden;cursor:pointer;background:var(--bg2)}',
'.pdt-themecard.on{border-color:var(--accent)}',
'.pdt-themecard .pv{height:52px;display:flex;flex-direction:column;gap:4px;padding:8px}',
'.pdt-themecard .pv i{border-radius:3px}',
'.pdt-themecard .nm{font-size:.78em;text-align:center;padding:5px 2px;color:var(--fg2)}',
'.pdt-seg{display:flex;border:1px solid var(--border);border-radius:9px;overflow:hidden}',
'.pdt-seg button{flex:1;border:0;background:var(--bg2);color:var(--fg2);font:inherit;font-size:.88em;',
'padding:8px 4px;cursor:pointer}',
'.pdt-seg button.on{background:var(--accent2);color:var(--accent);font-weight:700}',
'input[type=range]{width:100%;accent-color:var(--accent)}',
'.pdt-ic{display:inline-flex;line-height:0}'
].join('\n');


/* ===== 04-shell.js ===== */
/*
 * 04-shell.js — host element, closed shadow root, bottom sheet, tabs, FAB, drag-resize
 */

var hostEl = null, root = null, app = null, sheetEl = null, tabsEl = null, bodyEl = null, fabEl = null;
var panelDefs = [];
var panelEls = {};

function registerPanel(def) { panelDefs.push(def); }

var mq = (typeof matchMedia === 'function') ? matchMedia('(prefers-color-scheme: dark)') : null;

function resolvedTheme() {
  if (settings.theme === 'auto') return (mq && mq.matches) ? 'dark' : 'light';
  return settings.theme;
}
function applyTheme() {
  if (app) app.dataset.theme = resolvedTheme();
}
if (mq && mq.addEventListener) {
  mq.addEventListener('change', function () { if (settings.theme === 'auto') applyTheme(); });
}

function buildShell() {
  hostEl = document.createElement('div');
  hostEl.id = 'pdt-host';
  hostEl.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none';
  try {
    root = hostEl.attachShadow ? hostEl.attachShadow({ mode: 'closed' }) : hostEl;
  } catch (e) { root = hostEl; }

  var styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  root.appendChild(styleEl);

  app = h('.pdt-root', { dataset: { theme: resolvedTheme(), fs: settings.fontSize } });

  /* --- bottom sheet --- */
  sheetEl = h('.pdt-sheet');
  sheetEl.style.setProperty('--ph', settings.panelHeight + '%');
  sheetEl.appendChild(h('.pdt-handle', h('i')));
  sheetEl.appendChild(h('.pdt-head', [
    h('span.pdt-title', [iconEl('console'), 'Pocket DevTools', h('span.pdt-ver', 'v' + VERSION)]),
    h('button.pdt-ib', { type: 'button', title: 'Inspect element', onclick: function () { toggleInspect(); } }, iconEl('inspect')),
    h('button.pdt-ib', { type: 'button', title: 'Close', onclick: function () { closeSheet(); } }, iconEl('close'))
  ]));
  tabsEl = h('.pdt-tabs');
  sheetEl.appendChild(tabsEl);
  bodyEl = h('.pdt-body');
  sheetEl.appendChild(bodyEl);
  app.appendChild(sheetEl);

  /* --- FAB (reopen button) --- */
  fabEl = h('.pdt-fab', { title: 'Open Pocket DevTools' });
  fabEl.innerHTML = iconSvg('console', 20);
  positionFab();
  app.appendChild(fabEl);
  setupFabDrag();

  root.appendChild(app);
  (document.body || document.documentElement).appendChild(hostEl);
  /* Auto-open rules:
   *   bookmarklet — the user just asked for it, always open;
   *   userscript  — open only if "always open" is enabled, or the sheet was
   *                 open before the refresh (session flag) — otherwise stay in
   *                 the background and offer the FAB. */
  var wantOpen = !IS_USERSCRIPT || settings.usAutoOpenSheet || ssGet('open') === '1';
  if (wantOpen) requestAnimationFrame(function () { openSheet(); });

  buildTabs();
  switchTab(ctx.activeTab);
  setupResizeDrag();
  setupKeys();
}

/* ---------------- tabs ---------------- */
function buildTabs() {
  panelDefs.forEach(function (p) {
    var b = h('button.pdt-tab', { type: 'button', dataset: { tab: p.id } }, [iconEl(p.icon, 14), p.label]);
    b.addEventListener('click', function () { switchTab(p.id); });
    tabsEl.appendChild(b);
  });
}
function switchTab(id) {
  ctx.activeTab = id;
  if (!tabsEl) return; /* UI not built yet (document-start) — remember only */
  var btns = root.querySelectorAll('.pdt-tab');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('on', btns[i].dataset.tab === id);
  }
  for (var pid in panelEls) panelEls[pid].classList.toggle('on', pid === id);
  var def = null;
  for (var j = 0; j < panelDefs.length; j++) if (panelDefs[j].id === id) def = panelDefs[j];
  if (!def) return;
  var panel = panelEls[id];
  if (!panel) {
    panel = h('.pdt-panel.on'); /* new panels start active — the toggle loop above ran before creation */
    bodyEl.appendChild(panel);
    panelEls[id] = panel; /* set BEFORE render so panels can self-reference */
    try { def.render(panel); } catch (e) {
      panel.appendChild(h('.pdt-empty', 'Panel error: ' + (e && e.message)));
      conEmit('error', ['Panel "' + def.id + '" failed to render: ' + (e && (e.message || e))]);
    }
  }
  var cur = root.querySelector('.pdt-tab[data-tab="' + id + '"]');
  if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  if (def.onShow) { try { def.onShow(); } catch (e) { /* noop */ } }
  /* persist the active tab so the next session re-opens here */
  if (settings.lastTab !== id) { settings.lastTab = id; saveSettings(); }
}

/* ---------------- open/close ---------------- */
function openSheet() {
  if (!sheetEl) { ssSet('open', '1'); return; } /* pre-DOM: remember intent */
  sheetEl.classList.add('open');
  app.classList.add('sheet-open');
  ssSet('open', '1'); /* userscript: reopen after refresh while still open */
  if (ctx.activeTab) switchTab(ctx.activeTab);
}
function closeSheet() {
  if (!sheetEl) { ssSet('open', null); return; }
  sheetEl.classList.remove('open');
  app.classList.remove('sheet-open');
  ssSet('open', null);
  if (inspectOn) stopInspect(true);
}
function toggleSheet() {
  if (!sheetEl) { ssSet('open', null); return; }
  sheetEl.classList.contains('open') ? closeSheet() : openSheet();
}

/* ---------------- resize drag (handle) ---------------- */
function setupResizeDrag() {
  var handle = sheetEl.querySelector('.pdt-handle');
  var dragging = false, startY = 0, startH = 0;
  handle.addEventListener('pointerdown', function (e) {
    dragging = true; startY = e.clientY;
    startH = sheetEl.getBoundingClientRect().height;
    sheetEl.classList.add('nodrag');
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    e.preventDefault();
  });
  handle.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dh = startY - e.clientY;
    var vh = window.innerHeight || 1;
    var pct = ((startH + dh) / vh) * 100;
    pct = Math.max(22, Math.min(92, pct));
    settings.panelHeight = Math.round(pct);
    sheetEl.style.setProperty('--ph', pct + '%');
  });
  function end(e) {
    if (!dragging) return;
    dragging = false;
    sheetEl.classList.remove('nodrag');
    saveSettings();
  }
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

/* ---------------- FAB ---------------- */
function positionFab() {
  if (settings.fabX != null && settings.fabY != null) {
    fabEl.style.left = settings.fabX + '%';
    fabEl.style.top = settings.fabY + '%';
    fabEl.style.right = 'auto'; fabEl.style.bottom = 'auto';
  } else {
    fabEl.style.left = 'auto'; fabEl.style.top = 'auto';
    fabEl.style.right = '14px'; fabEl.style.bottom = '18px';
  }
  fabEl.style.display = settings.showFAB ? 'flex' : 'none';
}
function setupFabDrag() {
  var moved = false, sx = 0, sy = 0;
  fabEl.addEventListener('pointerdown', function (e) {
    moved = false; sx = e.clientX; sy = e.clientY;
    try { fabEl.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
  });
  fabEl.addEventListener('pointermove', function (e) {
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    moved = true;
    var r = app.getBoundingClientRect();
    var x = Math.max(0, Math.min(r.width - 48, e.clientX - 24));
    var y = Math.max(0, Math.min(r.height - 48, e.clientY - 24));
    fabEl.style.left = x + 'px'; fabEl.style.top = y + 'px';
    fabEl.style.right = 'auto'; fabEl.style.bottom = 'auto';
  });
  fabEl.addEventListener('pointerup', function (e) {
    if (moved) {
      var r = app.getBoundingClientRect();
      var wPct = (48 / r.width) * 100, hPct = (48 / r.height) * 100;
      var xPct = ((parseFloat(fabEl.style.left) + 24) / r.width) * 100;
      var yPct = ((parseFloat(fabEl.style.top) + 24) / r.height) * 100;
      /* snap horizontally to the nearest screen edge */
      xPct = xPct < 50 ? 3 : (97 - wPct);
      xPct = Math.max(2, Math.min(96, xPct));
      yPct = Math.max(4, Math.min(96 - hPct, yPct));
      settings.fabX = Math.round(xPct); settings.fabY = Math.round(yPct);
      saveSettings();
      positionFab();
    } else {
      openSheet();
    }
  });
}

/* ---------------- keyboard shortcuts (desktop) ---------------- */
function setupKeys() {
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (inspectOn) { stopInspect(true); return; }
      var mo = root.querySelector('.pdt-mov');
      if (mo) { mo.remove(); return; }
      closeSheet();
    }
    if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault(); toggleInspect();
    }
  }, true);
}


/* ===== 05-console.js ===== */
/*
 * 05-console.js — full console API capture + object inspector + Console panel
 *
 * Captures: log, info, warn, error, debug, table, time/timeEnd/timeLog,
 * count/countReset, group/groupEnd, trace, dir, assert, clear.
 * Console helpers installed on window: $, $$, $x, $_, $0, copy, clear,
 * inspect, keys, values, getListeners.
 */

var nativeCon = {};
['log', 'info', 'warn', 'error', 'debug', 'table', 'time', 'timeEnd', 'timeLog',
 'count', 'countReset', 'group', 'groupCollapsed', 'groupEnd', 'trace', 'dir',
 'assert', 'clear'].forEach(function (m) {
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
      if (args[j] && isExpandable(args[j])) { entry.val = args[j]; break; }
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
  conRenderNew();
}

function conEcho(kind, text) {
  ctx.conEntries.push({ t: Date.now(), level: 'log', text: text, count: 1, kind: kind, depth: 0 });
  conRenderNew();
}

/* patch the whole console API (runs at script load) */
(function installConsoleCapture() {
  function patch(method, fn) {
    try {
      Object.defineProperty(console, method, {
        value: fn, writable: true, configurable: true
      });
    } catch (e) { /* some pages lock console */ }
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (m) {
    patch(m, function () { conEmit(m, arguments); nativeCon[m].apply(null, arguments); });
  });

  patch('table', function (data, props) {
    var tbl = buildTableData(data, props);
    if (tbl) conEmit('log', [tbl.caption || 'console.table'], '', { table: tbl });
    else conEmit('warn', ['console.table: data must be an array or object']);
    try { nativeCon.table(data, props); } catch (e) { /* noop */ }
  });

  patch('time', function (label) {
    label = label || 'default';
    if (ctx.conTimers[label] != null) conEmit('warn', ['Timer "' + label + '" already exists']);
    else ctx.conTimers[label] = netNow();
    try { nativeCon.time(label); } catch (e) { /* noop */ }
  });
  function timerEmit(method, label) {
    label = label || 'default';
    var t0 = ctx.conTimers[label];
    if (t0 == null) { conEmit('warn', ['Timer "' + label + '" does not exist']); return null; }
    return fmtMs(netNow() - t0);
  }
  patch('timeLog', function (label) {
    var ms = timerEmit('timeLog', label);
    if (ms != null) { conEmit('log', [(label || 'default') + ': ' + ms]); try { nativeCon.timeLog(label); } catch (e) { /* noop */ } }
  });
  patch('timeEnd', function (label) {
    var ms = timerEmit('timeEnd', label);
    if (ms != null) {
      delete ctx.conTimers[label];
      conEmit('log', [(label || 'default') + ': ' + ms]);
      try { nativeCon.timeEnd(label); } catch (e) { /* noop */ }
    }
  });

  patch('count', function (label) {
    label = label || 'default';
    ctx.conCounters[label] = (ctx.conCounters[label] || 0) + 1;
    conEmit('log', [label + ': ' + ctx.conCounters[label]]);
    try { nativeCon.count(label); } catch (e) { /* noop */ }
  });
  patch('countReset', function (label) {
    label = label || 'default';
    delete ctx.conCounters[label];
    try { nativeCon.countReset(label); } catch (e) { /* noop */ }
  });

  function groupPatch(method, collapsed) {
    patch(method, function () {
      var label = (arguments.length && serialize(arguments[0], 0)) || 'group';
      conEmit('log', ['\u25BE ' + label], '', { group: collapsed ? 'collapsed' : 'open' });
      ctx.groupDepth++;
      try { nativeCon[method].apply(null, arguments); } catch (e) { /* noop */ }
    });
  }
  groupPatch('group', false);
  groupPatch('groupCollapsed', true);
  patch('groupEnd', function () {
    ctx.groupDepth = Math.max(0, ctx.groupDepth - 1);
    try { nativeCon.groupEnd(); } catch (e) { /* noop */ }
  });

  patch('trace', function () {
    var stack = '';
    try { stack = String(new Error().stack || '').split('\n').slice(1, 7).join('\n'); } catch (e) { /* noop */ }
    var msg = arguments.length ? Array.prototype.map.call(arguments, function (a) { return serialize(a, 0); }).join(' ') : 'console.trace';
    conEmit('log', [msg], '', { stack: stack || '(stack unavailable)' });
    try { nativeCon.trace(); } catch (e) { /* noop */ }
  });

  patch('dir', function (obj) {
    conEmit('log', [obj], 'dir');
    try { nativeCon.dir(obj); } catch (e) { /* noop */ }
  });
  patch('assert', function (cond) {
    if (!cond) {
      var rest = Array.prototype.slice.call(arguments, 1);
      conEmit('error', ['Assertion failed: ' + (rest.length ? rest.map(function (a) { return serialize(a, 0); }).join(' ') : 'console.assert')]);
    }
    try { nativeCon.assert.apply(null, arguments); } catch (e) { /* noop */ }
  });
  patch('clear', function () {
    conClear();
    try { nativeCon.clear(); } catch (e) { /* noop */ }
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

  /* object inspector toggle */
  if (entry.val && isExpandable(entry.val)) {
    var toggle = h('button.pdt-otog', objPreview(entry.val));
    var built = false;
    toggle.addEventListener('click', function (e) {
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
          } else if (kind === 'map') { entry.val.forEach(function (v, k) { pairs.push([serialize(k, 1), v]); }); }
          else if (kind === 'set') { entry.val.forEach(function (v, i) { pairs.push([String(i), v]); }); }
        } catch (e2) { /* locked */ }
        pairs.forEach(function (p) { wrap.appendChild(objTreeNode(p[0], p[1], 0)); });
        x.appendChild(wrap);
        toggle.classList.add('open');
        toggle.textContent = '\u25BE ' + objPreview(entry.val);
      } else {
        var tr = x.querySelector('.pdt-otree');
        if (tr) {
          var show = tr.style.display === 'none';
          tr.style.display = show ? '' : 'none';
          toggle.classList.toggle('open', show);
          toggle.textContent = (show ? '\u25BE ' : '\u25B8 ') + objPreview(entry.val);
        }
      }
    });
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


/* ===== 06-elements.js ===== */
/*
 * 06-elements.js — inspect mode (touch-friendly), DOM tree, selected-element editor,
 *                event listener capture, Edit HTML, XPath
 */

var inspectOn = false, ovlBox = null, ovlLabel = null;
var elTreeEl = null, elDetailEl = null, elEvEl = null, elSub = 'tree';

/* ---------------- event listener capture (installed at load) ----------------
 * Records every addEventListener()/removeEventListener() call made AFTER DevTools
 * loaded (up to 5000), so the Events tab can list them per element. */
var evtListeners = [];
var EVT_CAP = 5000;
(function installListenerCapture() {
  try {
    var AEL = EventTarget.prototype.addEventListener;
    var REL = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, opts) {
      try {
        if (typeof fn === 'function' && evtListeners.length < EVT_CAP) {
          evtListeners.push({
            el: this, type: type, fn: fn,
            capture: !!(opts && (opts.capture === true || (typeof opts === 'object' && opts.capture))),
            once: !!(opts && typeof opts === 'object' && opts.once),
            passive: !!(opts && typeof opts === 'object' && opts.passive)
          });
        }
      } catch (e) { /* noop */ }
      return AEL.apply(this, arguments);
    };
    EventTarget.prototype.removeEventListener = function (type, fn, opts) {
      try {
        var cap = !!(opts && (opts.capture === true || (typeof opts === 'object' && opts.capture)));
        for (var i = 0; i < evtListeners.length; i++) {
          var L = evtListeners[i];
          if (L.el === this && L.type === type && L.fn === fn && L.capture === cap) { evtListeners.splice(i, 1); break; }
        }
      } catch (e) { /* noop */ }
      return REL.apply(this, arguments);
    };
  } catch (e) { /* prototype locked */ }
})();

function listenersFor(el) {
  var out = [];
  try {
    evtListeners.forEach(function (L) {
      if (L.el === el) {
        out.push({
          type: L.type, capture: L.capture, once: L.once, passive: L.passive,
          name: L.fn.name || 'anonymous',
          code: truncate(String(L.fn).replace(/\s+/g, ' '), 200)
        });
      }
    });
  } catch (e) { /* noop */ }
  /* inline on* handlers are always visible */
  if (el && el.nodeType === 1 && el.attributes) {
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (/^on[a-z]+$/i.test(a.name)) {
        out.push({ type: a.name.slice(2), capture: false, once: false, passive: false, name: '(inline ' + a.name + ')', code: truncate(a.value, 200) });
      }
    }
  }
  return out;
}

function xpathFor(el) {
  if (!el || el.nodeType !== 1) return '';
  if (el.id) return '//*[@id="' + el.id + '"]';
  var parts = [];
  var node = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    var s = node.tagName.toLowerCase();
    var p = node.parentElement;
    if (p) {
      var sibs = Array.prototype.filter.call(p.children, function (c) { return c.tagName === node.tagName; });
      if (sibs.length > 1) s += '[' + (sibs.indexOf(node) + 1) + ']';
    }
    parts.unshift(s);
    node = node.parentElement;
  }
  return '/' + (node && node === document.documentElement ? 'html/' : '') + parts.join('/');
}

/* ---------------- inspect mode ---------------- */
function toggleInspect() { inspectOn ? stopInspect(true) : startInspect(); }

function startInspect() {
  if (inspectOn) return;
  inspectOn = true;
  ovlBox = document.createElement('div');
  ovlBox.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #5b9dff;' +
    'background:rgba(91,157,255,.12);border-radius:3px;display:none;box-shadow:0 0 0 1px rgba(0,0,0,.35)';
  ovlLabel = document.createElement('div');
  ovlLabel.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;display:none;' +
    'background:#1e1f24;color:#fff;font:600 11px/1.4 -apple-system,Roboto,sans-serif;padding:3px 8px;' +
    'border-radius:6px;white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis';
  document.body.appendChild(ovlBox);
  document.body.appendChild(ovlLabel);
  document.addEventListener('touchstart', inspTouch, true);
  document.addEventListener('touchmove', inspTouch, true);
  document.addEventListener('touchend', inspEnd, true);
  document.addEventListener('mousemove', inspMouse, true);
  document.addEventListener('click', inspClick, true);
  toast('Inspect: touch an element, release to select');
  var b = root.querySelector('.pdt-ib[title="Inspect element"]');
  if (b) b.style.color = 'var(--accent)';
}

function stopInspect(cancel) {
  if (!inspectOn) return;
  inspectOn = false;
  document.removeEventListener('touchstart', inspTouch, true);
  document.removeEventListener('touchmove', inspTouch, true);
  document.removeEventListener('touchend', inspEnd, true);
  document.removeEventListener('mousemove', inspMouse, true);
  document.removeEventListener('click', inspClick, true);
  if (ovlBox) { ovlBox.remove(); ovlBox = null; }
  if (ovlLabel) { ovlLabel.remove(); ovlLabel = null; }
  var b = root ? root.querySelector('.pdt-ib[title="Inspect element"]') : null;
  if (b) b.style.color = '';
  if (!cancel) toast('Inspection off');
}

function inspTarget(x, y) {
  /* hide our own UI from hit-testing */
  var el = null;
  try { el = document.elementFromPoint(x, y); } catch (e) { return null; }
  while (el && (el === hostEl || (hostEl && hostEl.contains(el)))) el = el.parentElement;
  if (el === document.documentElement || el === document.body) return el;
  return el;
}

function drawHighlight(el) {
  if (!ovlBox || !el) return;
  var r = el.getBoundingClientRect();
  if (r.width < 1 && r.height < 1) { ovlBox.style.display = 'none'; ovlLabel.style.display = 'none'; return; }
  ovlBox.style.display = 'block';
  ovlBox.style.left = r.left + 'px'; ovlBox.style.top = r.top + 'px';
  ovlBox.style.width = r.width + 'px'; ovlBox.style.height = r.height + 'px';
  var desc = el.tagName.toLowerCase();
  if (el.id) desc += '#' + el.id;
  if (el.classList && el.classList.length) desc += '.' + Array.prototype.slice.call(el.classList, 0, 3).join('.');
  desc += '  ' + Math.round(r.width) + ' \u00D7 ' + Math.round(r.height);
  ovlLabel.style.display = 'block';
  ovlLabel.textContent = desc;
  ovlLabel.style.left = Math.max(4, Math.min(window.innerWidth - 160, r.left)) + 'px';
  ovlLabel.style.top = (r.top > 30 ? (r.top - 26) : (r.bottom + 6)) + 'px';
}

var inspLast = null, inspStart = null;
function inspTouch(e) {
  var t = e.touches[0];
  if (!t) return;
  if (!inspStart) inspStart = { x: t.clientX, y: t.clientY, t: Date.now() };
  inspLast = inspTarget(t.clientX, t.clientY);
  drawHighlight(inspLast);
}
function inspEnd(e) {
  var st = inspStart; inspStart = null;
  var el = inspLast; inspLast = null;
  if (!el) return;
  if (st && Date.now() - st.t < 700) {
    selectElement(el);
    stopInspect(false);
    e.preventDefault();
    /* swallow the click that follows the tap */
    document.addEventListener('click', function swallow(ev) {
      ev.stopPropagation(); ev.preventDefault();
      document.removeEventListener('click', swallow, true);
    }, true);
  }
}
function inspMouse(e) {
  if (e.pointerType === 'touch') return;
  inspLast = inspTarget(e.clientX, e.clientY);
  drawHighlight(inspLast);
}
function inspClick(e) {
  if (e.pointerType === 'touch') return;
  e.preventDefault(); e.stopPropagation();
  if (inspLast) { selectElement(inspLast); stopInspect(false); }
}

/* ---------------- selection ---------------- */
function selectElement(el) {
  ctx.selected = el;
  /* $0 .. $4 history (like DevTools) — dedupe consecutive, cap 5 */
  if (ctx.selHistory[0] !== el) {
    ctx.selHistory.unshift(el);
    if (ctx.selHistory.length > 5) ctx.selHistory.length = 5;
  }
  elSub = 'detail';
  if (panelEls.elements) {
    renderElementsPanel();
    expandTo(el);
  }
  switchTab('elements');
}
function expandTo(el) {
  var node = el;
  while (node && node !== document) {
    try { node.__pdtOpen = true; } catch (e) { break; }
    node = node.parentElement;
  }
  if (panelEls.elements) renderTree();
}

function cssSelectorFor(el) {
  if (el.id) return '#' + el.id;
  var parts = [];
  var node = el;
  while (node && node.nodeType === 1 && parts.length < 5) {
    var s = node.tagName.toLowerCase();
    if (node.id) { parts.unshift('#' + node.id); break; }
    var p = node.parentElement;
    if (p) {
      var sibs = Array.prototype.filter.call(p.children, function (c) { return c.tagName === node.tagName; });
      if (sibs.length > 1) s += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
    }
    parts.unshift(s);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

/* ---------------- DOM tree ---------------- */
function renderTree() {
  if (!elTreeEl) return;
  elTreeEl.textContent = '';
  elTreeEl.appendChild(treeNode(document.documentElement, 0));
}

function treeNode(el, depth) {
  var wrap = h('.pdt-node');
  var kids = Array.prototype.slice.call(el.childNodes).filter(function (n) {
    if (n.nodeType === 3) return n.textContent.trim().length > 0;
    return n.nodeType === 1;
  });
  var open = !!el.__pdtOpen;
  var tw = h('span.pdt-tw', open ? '\u25BE' : (kids.length ? '\u25B8' : ''));
  tw.addEventListener('click', function (e) {
    e.stopPropagation();
    el.__pdtOpen = !el.__pdtOpen;
    renderTree();
  });
  var label = h('span.pdt-nrow', [tw]);
  if (ctx.selected === el) label.classList.add('sel');
  var tagSpan = h('span.pdt-tag', '<' + el.tagName.toLowerCase());
  label.appendChild(tagSpan);
  if (el.id) label.appendChild(h('span.pdt-attr', [h('span.an', ' id='), h('span.av', '"' + el.id + '"')]));
  if (el.classList && el.classList.length) {
    label.appendChild(h('span.pdt-attr', [h('span.an', ' class='), h('span.av', '"' + Array.prototype.slice.call(el.classList).join(' ') + '"')]));
  }
  label.appendChild(h('span.pdt-tag', '>'));
  label.addEventListener('click', function () {
    if (ctx.selected === el) { elSub = 'detail'; renderElementsPanel(); }
    else { ctx.selected = el; renderTree(); renderDetail(); }
  });
  wrap.appendChild(indent(depth, label));
  if (open && kids.length) {
    kids.forEach(function (n) {
      if (n.nodeType === 3) {
        wrap.appendChild(indent(depth + 1, h('.pdt-nrow.pdt-ntext', '"' + truncate(n.textContent.trim(), 64) + '"')));
      } else {
        wrap.appendChild(treeNode(n, depth + 1));
      }
    });
  }
  return wrap;
}
function indent(depth, rowEl) {
  if (!depth) return rowEl;
  var sp = h('span', { style: { display: 'inline-block', width: depth * 14 + 'px' } });
  return h('span', [sp, rowEl]);
}

/* ---------------- detail (selected element) ---------------- */
function renderDetail() {
  if (!elDetailEl) return;
  elDetailEl.textContent = '';
  var el = ctx.selected;
  if (!el || !el.isConnected) {
    elDetailEl.appendChild(h('.pdt-empty', 'No element selected.\nUse the crosshair button or Inspect mode.', [
      h('div', [h('button.pdt-btn.acc', { type: 'button', onclick: function () { startInspect(); } }, [iconEl('inspect', 14), 'Inspect element'])])
    ]));
    return;
  }

  /* breadcrumb */
  var crumb = h('.pdt-crumb');
  var chain = [];
  var n = el;
  while (n && n.nodeType === 1 && chain.length < 8) { chain.unshift(n); n = n.parentElement; }
  chain.forEach(function (c, i) {
    if (i) crumb.appendChild(h('i', ' \u203A '));
    var b = h('button', c.tagName.toLowerCase() + (c.id ? '#' + c.id : ''));
    if (c === el) b.classList.add('cur');
    b.addEventListener('click', function () { ctx.selected = c; renderDetail(); renderTree(); });
    crumb.appendChild(b);
  });

  /* info */
  var r = el.getBoundingClientRect();
  var info = h('.pdt-card', [
    kv('Tag', el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')),
    kv('Selector', cssSelectorFor(el)),
    kv('Size', Math.round(r.width) + ' \u00D7 ' + Math.round(r.height) + ' px'),
    kv('Position', Math.round(r.left) + ', ' + Math.round(r.top) + ' (viewport)')
  ]);

  /* classes with toggle chips */
  var clsCard = null;
  if (el.classList && el.classList.length) {
    var chips = h('.pdt-row', { style: { flexWrap: 'wrap' } });
    Array.prototype.forEach.call(el.classList, function (c) {
      var chip = h('button.pdt-chip.on', c);
      chip.addEventListener('click', function () {
        el.classList.toggle(c);
        chip.classList.toggle('on', el.classList.contains(c));
      });
      chips.appendChild(chip);
    });
    clsCard = h('.pdt-card', [h('.pdt-label', 'Classes (tap to toggle)'), chips]);
  }

  /* actions */
  var actions = h('.pdt-row', { style: { flexWrap: 'wrap' } }, [
    h('button.pdt-btn', { type: 'button', onclick: function () { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Scrolled to element'); } }, [iconEl('eye', 14), 'Scroll to']),
    h('button.pdt-btn', { type: 'button', onclick: function () { copyText(el.outerHTML); } }, [iconEl('copy', 14), 'Copy HTML']),
    h('button.pdt-btn', { type: 'button', onclick: function () { copyText(cssSelectorFor(el)); } }, [iconEl('copy', 14), 'Copy selector']),
    h('button.pdt-btn', { type: 'button', onclick: function () { copyText(xpathFor(el)); } }, [iconEl('copy', 14), 'Copy XPath']),
    h('button.pdt-btn', { type: 'button', onclick: function () { editOuterHtml(el); } }, [iconEl('edit', 14), 'Edit HTML']),
    h('button.pdt-btn.danger', { type: 'button', onclick: function () {
      confirmModal('Delete this element from the page?', 'Delete', function () {
        var p = el.parentElement;
        if (p) { p.removeChild(el); ctx.selected = p; renderDetail(); renderTree(); toast('Element deleted'); }
      }, true);
    } }, [iconEl('trash', 14), 'Delete'])
  ]);

  /* attributes editor */
  var attrsCard = h('.pdt-card');
  attrsCard.appendChild(h('.pdt-label', 'Attributes'));
  var attrRows = [];
  var attrList = h('div');
  function renderAttrs() {
    attrList.textContent = '';
    attrRows = [];
    Array.prototype.forEach.call(el.attributes, function (a) {
      var nameEl = h('input.pdt-input', { value: a.name, style: { width: '34%' }, readOnly: true });
      var valEl = h('input.pdt-input.pdt-grow', { value: a.value });
      var del = h('button.pdt-ib', { type: 'button', onclick: function () {
        el.removeAttribute(a.name); renderDetail();
      } }, iconEl('trash', 14));
      var row = h('.pdt-row', { style: { marginBottom: '6px' } }, [nameEl, valEl, del]);
      attrRows.push({ name: a.name, input: valEl });
      attrList.appendChild(row);
    });
    if (!el.attributes.length) attrList.appendChild(h('.pdt-empty', 'No attributes'));
  }
  renderAttrs();
  var newName = h('input.pdt-input', { placeholder: 'name', style: { width: '34%' } });
  var newVal = h('input.pdt-input.pdt-grow', { placeholder: 'value' });
  attrList.appendChild(h('.pdt-row', [newName, newVal,
    h('button.pdt-ib', { type: 'button', onclick: function () {
      if (!newName.value.trim()) { toast('Attribute name required'); return; }
      el.setAttribute(newName.value.trim(), newVal.value);
      renderDetail();
    } }, iconEl('plus', 14))
  ]));
  attrsCard.appendChild(attrList);

  elDetailEl.appendChild(crumb);
  elDetailEl.appendChild(h('.pdt-scroll', [info, clsCard, attrsCard, h('.pdt-label', 'Actions'), actions]));
}

function kv(k, v) { return h('.pdt-kv', [h('b', k), h('span', String(v))]); }

/* ---------------- edit outer HTML ---------------- */
function editOuterHtml(el) {
  var area = h('textarea.pdt-area', { rows: 10, spellcheck: 'false' });
  area.value = el.outerHTML;
  modal('Edit HTML — ' + el.tagName.toLowerCase(), function (body, close) {
    body.appendChild(area);
    body.appendChild(h('.pdt-mfoot', [
      h('button.pdt-btn', { type: 'button', onclick: close }, 'Cancel'),
      h('button.pdt-btn.acc', { type: 'button', onclick: function () {
        try {
          var p = el.parentElement, idx = -1;
          if (p) idx = Array.prototype.indexOf.call(p.children, el);
          var tpl = document.createElement('template');
          tpl.innerHTML = area.value;
          if (!tpl.content.firstChild) { toast('Nothing to insert — element removed'); close(); return; }
          if (p) {
            p.replaceChild(tpl.content.firstChild, el);
            var next = p.children[idx] || p.firstElementChild;
            if (next) { ctx.selected = next; }
          } else {
            el.outerHTML = area.value;
          }
          close(); renderDetail(); renderTree(); toast('HTML updated');
        } catch (e) { toast('Edit failed: ' + (e.message || e)); }
      } }, 'Apply')
    ]));
  }, true);
}

/* ---------------- events sub-tab ---------------- */
function renderEvents() {
  if (!elEvEl) return;
  elEvEl.textContent = '';
  var stats = h('.pdt-card');
  stats.appendChild(kv('Listeners captured', String(evtListeners.length)));
  stats.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em', color: 'var(--muted)', marginTop: '6px' } },
    'Listeners are recorded from the moment DevTools loads. Handlers attached earlier by the page, and those added via inline on* attributes, are detected per element below.'));
  elEvEl.appendChild(stats);

  var el = ctx.selected;
  if (!el || !el.isConnected) {
    elEvEl.appendChild(h('.pdt-empty', 'Select an element (crosshair button) to see its listeners.'));
  } else {
    var list = listenersFor(el);
    var card = h('.pdt-card');
    card.appendChild(h('.pdt-label', 'Listeners on ' + (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')) + ' (' + list.length + ')'));
    if (!list.length) card.appendChild(h('.pdt-empty', 'No listeners on this element.'));
    list.forEach(function (L) {
      var flags = [L.capture ? 'capture' : 'bubble', L.once ? 'once' : '', L.passive ? 'passive' : '']
        .filter(Boolean).join(', ');
      card.appendChild(h('.pdt-evl', [
        h('.pdt-row', [
          h('span.pdt-badge.b-post', L.type),
          h('span.pdt-grow.pdt-mono', { style: { fontSize: '.85em' } }, L.name),
          h('span', { style: { fontSize: '.78em', color: 'var(--muted)' } }, flags)
        ]),
        h('pre.pdt-mono', { style: { fontSize: '.78em', color: 'var(--fg2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '4px 0 8px' } }, L.code)
      ]));
    });
    elEvEl.appendChild(card);
  }

  /* busiest elements */
  var perEl = new Map();
  evtListeners.forEach(function (L) {
    var k = (L.el && L.el.tagName) ? (L.el === window ? 'window' : L.el === document ? 'document' :
      L.el.tagName.toLowerCase() + (L.el.id ? '#' + L.el.id : '')) : '(detached)';
    perEl.set(k, (perEl.get(k) || 0) + 1);
  });
  if (perEl.size) {
    var top = Array.from(perEl.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
    var c2 = h('.pdt-card');
    c2.appendChild(h('.pdt-label', 'Most listeners (all elements)'));
    top.forEach(function (t) { c2.appendChild(kv(t[0], t[1])); });
    elEvEl.appendChild(c2);
  }
}

/* ---------------- panel ---------------- */
function renderElementsPanel() {
  if (!panelEls.elements) return;
  var panel = panelEls.elements;
  panel.textContent = '';
  var subTree = h('button.pdt-subb' + (elSub === 'tree' ? '.on' : ''), 'Tree');
  var subDet = h('button.pdt-subb' + (elSub === 'detail' ? '.on' : ''), 'Selected');
  var subEv = h('button.pdt-subb' + (elSub === 'events' ? '.on' : ''), 'Events');
  subTree.addEventListener('click', function () { elSub = 'tree'; renderElementsPanel(); });
  subDet.addEventListener('click', function () { elSub = 'detail'; renderElementsPanel(); });
  subEv.addEventListener('click', function () { elSub = 'events'; renderElementsPanel(); });

  var top = h('.pdt-toolbar', [
    h('button.pdt-btn', { type: 'button', onclick: function () { startInspect(); } }, [iconEl('inspect', 14), 'Inspect']),
    h('span.pdt-grow')
  ]);
  panel.appendChild(top);
  panel.appendChild(h('.pdt-sub', [subTree, subDet, subEv]));

  elTreeEl = h('.pdt-scroll');
  elDetailEl = h('.pdt-scroll');
  elEvEl = h('.pdt-scroll');
  if (elSub !== 'tree') elTreeEl.style.display = 'none';
  if (elSub !== 'detail') elDetailEl.style.display = 'none';
  if (elSub !== 'events') elEvEl.style.display = 'none';
  panel.appendChild(elTreeEl);
  panel.appendChild(elDetailEl);
  panel.appendChild(elEvEl);
  renderTree();
  renderDetail();
  renderEvents();
}

registerPanel({
  id: 'elements', label: 'Elements', icon: 'elements',
  render: function (panel) {
    panelEls.elements = panel;
    renderElementsPanel();
  },
  onShow: function () { if (ctx.selected && !ctx.selected.isConnected) { ctx.selected = null; renderDetail(); } }
});


/* ===== 07-styles.js ===== */
/*
 * 07-styles.js — box model diagram, computed styles, inline CSS editor,
 *                page color swatches, stylesheet tools
 */

var stSub = 'box';
var stBoxEl = null, stCompEl = null, stColorsEl = null;

function renderStylesPanel() {
  if (!panelEls.styles) return;
  var panel = panelEls.styles;
  panel.textContent = '';

  if (!ctx.selected || !ctx.selected.isConnected) {
    panel.appendChild(h('.pdt-empty', [
      'Select an element first (Elements tab or Inspect mode).',
      h('div', [h('button.pdt-btn.acc', { type: 'button', onclick: function () { startInspect(); } }, [iconEl('inspect', 14), 'Inspect element'])])
    ]));
    return;
  }

  var subs = [['box', 'Box Model'], ['computed', 'Computed'], ['inline', 'Inline CSS'], ['colors', 'Colors'], ['sheets', 'Sheets']];
  var subBar = h('.pdt-sub');
  subs.forEach(function (s) {
    var b = h('button.pdt-subb' + (stSub === s[0] ? '.on' : ''), s[1]);
    b.addEventListener('click', function () { stSub = s[0]; renderStylesPanel(); });
    subBar.appendChild(b);
  });
  panel.appendChild(subBar);

  var scroll = h('.pdt-scroll');
  panel.appendChild(scroll);
  if (stSub === 'box') scroll.appendChild(buildBoxModel());
  else if (stSub === 'computed') scroll.appendChild(buildComputed());
  else if (stSub === 'inline') scroll.appendChild(buildInlineEditor());
  else if (stSub === 'colors') { stColorsEl = scroll; scroll.appendChild(buildColors()); }
  else scroll.appendChild(buildSheets());
}

/* ---------------- box model ---------------- */
function buildBoxModel() {
  var el = ctx.selected;
  var cs = getComputedStyle(el);
  var m = [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft];
  var b = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth];
  var p = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft];
  var r = el.getBoundingClientRect();

  function zone() { /* flat representation below is used instead */ }
  var _ = zone; /* keep signature simple */
  function zbox(cls, top, right, bottom, left, centerLabel, centerSub) {
    var inner = h('div.z.' + cls, { style: { margin: '2px' } }, [
      h('div.lbl', top), h('div.lbl', right), h('div.lbl', centerLabel), h('div.lbl', left), h('div.lbl', bottom)
    ]);
    if (centerSub) inner.appendChild(h('div.lbl', centerSub));
    return inner;
  }

  var diagram = h('.pdt-bm', [
    zbox('zm', m[0], m[1], m[2], m[3], 'margin'),
    zbox('zb', b[0], b[1], b[2], b[3], 'border'),
    zbox('zp', p[0], p[1], p[2], p[3], 'padding'),
    zbox('zc', '', '', '', '', Math.round(r.width) + ' \u00D7 ' + Math.round(r.height) + ' px', el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''))
  ]);

  var info = h('.pdt-card', [
    kv('Content size', Math.round(r.width - px(p[1]) - px(p[3]) - px(b[1]) - px(b[3])) + ' \u00D7 ' +
      Math.round(r.height - px(p[0]) - px(p[2]) - px(b[0]) - px(b[2])) + ' px'),
    kv('Border box', Math.round(r.width) + ' \u00D7 ' + Math.round(r.height) + ' px'),
    kv('box-sizing', cs.boxSizing),
    kv('display', cs.display),
    kv('position', cs.position),
    kv('z-index', cs.zIndex === 'auto' ? 'auto' : cs.zIndex),
    kv('overflow', cs.overflow + ' / ' + cs.overflowY)
  ]);
  return h('div', [diagram, h('div', { style: { height: '12px' } }), info]);
}
function px(s) { var v = parseFloat(s); return isNaN(v) ? 0 : v; }

/* ---------------- computed styles ---------------- */
var COMPUTED_GROUPS = [
  ['Layout', ['display', 'position', 'width', 'height', 'margin', 'padding', 'border', 'box-sizing', 'flex-direction', 'justify-content', 'align-items', 'grid-template-columns', 'gap', 'overflow', 'float', 'z-index']],
  ['Typography', ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'text-transform', 'text-decoration', 'white-space', 'color']],
  ['Visual', ['background-color', 'background-image', 'opacity', 'border-radius', 'box-shadow', 'transform', 'filter', 'cursor', 'pointer-events', 'visibility']],
  ['Flex/Grid item', ['flex', 'flex-grow', 'flex-shrink', 'align-self', 'order', 'grid-area']]
];
function buildComputed() {
  var el = ctx.selected;
  var cs = getComputedStyle(el);
  var wrap = h('div');
  var search = h('input.pdt-input', { type: 'search', placeholder: 'Filter properties', style: { marginBottom: '10px' } });
  var list = h('div');
  function draw() {
    list.textContent = '';
    var q = search.value.toLowerCase();
    COMPUTED_GROUPS.forEach(function (g) {
      var rows = [];
      g[1].forEach(function (prop) {
        var v = '';
        try { v = cs.getPropertyValue(prop); } catch (e) { return; }
        if (!v) return;
        if (q && (prop + ' ' + v).toLowerCase().indexOf(q) < 0) return;
        rows.push(kv(prop, truncate(v, 90)));
      });
      if (rows.length) {
        list.appendChild(h('.pdt-label', g[0]));
        rows.forEach(function (r) { list.appendChild(r); });
      }
    });
    if (!list.children.length) list.appendChild(h('.pdt-empty', 'No matching properties'));
  }
  search.addEventListener('input', debounce(draw, 150));
  draw();
  wrap.appendChild(search);
  wrap.appendChild(list);
  return wrap;
}

/* ---------------- inline CSS editor ---------------- */
function buildInlineEditor() {
  var el = ctx.selected;
  var area = h('textarea.pdt-area', { rows: 8, spellcheck: 'false', placeholder: 'color: red; font-size: 20px;' });
  area.value = el.style.cssText || '';
  var out = h('div', [
    h('.pdt-label', 'element.style { }'),
    area,
    h('.pdt-row', { style: { marginTop: '10px' } }, [
      h('button.pdt-btn.acc', { type: 'button', onclick: function () {
        el.setAttribute('style', area.value);
        toast('Inline styles applied');
        renderStylesPanel();
      } }, [iconEl('check', 14), 'Apply live']),
      h('button.pdt-btn.danger', { type: 'button', onclick: function () {
        el.removeAttribute('style'); area.value = ''; toast('Inline styles removed');
      } }, [iconEl('trash', 14), 'Clear all'])
    ])
  ]);
  return out;
}

/* ---------------- colors ---------------- */
function collectColors() {
  var found = {};
  function add(v) {
    v = String(v || '').trim();
    if (!v || v === '' || v === 'none' || v === 'transparent' || v.indexOf('var(') === 0) return;
    if (/^(#([0-9a-f]{3,8})|rgba?\(|hsla?\()/i.test(v)) found[v] = 1;
  }
  try {
    var cs = getComputedStyle(ctx.selected);
    ['color', 'background-color', 'border-top-color', 'outline-color', 'text-decoration-color', 'fill', 'stroke', 'caret-color'].forEach(function (p) { add(cs.getPropertyValue(p)); });
  } catch (e) { /* noop */ }
  try {
    Array.prototype.forEach.call(document.styleSheets, function (ss) {
      var rules = ss.cssRules;
      if (!rules) return;
      Array.prototype.forEach.call(rules, function (r) {
        var s = r.style;
        if (!s) return;
        for (var i = 0; i < s.length; i++) {
          var prop = s[i];
          if (/color|background|border|fill|stroke|outline/i.test(prop)) add(s.getPropertyValue(prop));
        }
      });
    });
  } catch (e) { /* CORS-protected sheets */ }
  return Object.keys(found).slice(0, 80);
}
function buildColors() {
  var cols = collectColors();
  if (!cols.length) return h('.pdt-empty', 'No colors found');
  var grid = h('div', { style: { display: 'flex', flexWrap: 'wrap' } });
  cols.forEach(function (c) {
    grid.appendChild(h('button.pdt-swatch', { type: 'button', onclick: function () { copyText(c); } }, [
      h('i', { style: { background: c } }), c
    ]));
  });
  return h('div', [h('.pdt-label', 'Tap a color to copy it'), grid]);
}

/* ---------------- stylesheets ---------------- */
function buildSheets() {
  var wrap = h('div');
  var sheets = [];
  try { sheets = Array.prototype.slice.call(document.styleSheets); } catch (e) { /* noop */ }
  if (!sheets.length) wrap.appendChild(h('.pdt-empty', 'No stylesheets found'));

  sheets.forEach(function (ss, i) {
    var count = 0, access = true;
    try { count = ss.cssRules ? ss.cssRules.length : 0; } catch (e) { access = false; }
    var name = ss.href ? clipUrl(ss.href) : 'inline <style> #' + (i + 1);
    var dis = ss.disabled;
    var card = h('.pdt-card', [
      h('.pdt-row', [
        h('span.pdt-grow.pdt-mono', truncate(name, 46)),
        h('button.pdt-ib', { type: 'button', title: 'Copy CSS', onclick: function () {
          copyStylesheet(ss);
        } }, iconEl('copy', 14))
      ]),
      kv('Rules', access ? String(count) : 'blocked (CORS)'),
      h('button.pdt-btn' + (dis ? '' : '.on'), { type: 'button', style: { marginTop: '6px' }, onclick: function () {
        try { ss.disabled = !ss.disabled; renderStylesPanel(); } catch (e) { toast('Cannot toggle this sheet'); }
      } }, [iconEl('eye', 14), dis ? 'Enable sheet' : 'Disable sheet'])
    ]);
    wrap.appendChild(card);
  });

  /* live page CSS editor */
  var area = h('textarea.pdt-area', { rows: 6, spellcheck: 'false', placeholder: '/* custom CSS applied to this page */\n* { outline: 1px solid rgba(255,0,0,.3); }' });
  var existing = document.getElementById('pdt-page-css');
  if (existing) area.value = existing.textContent;
  wrap.appendChild(h('.pdt-label', 'Custom page CSS (live)'));
  wrap.appendChild(area);
  wrap.appendChild(h('.pdt-row', { style: { marginTop: '8px' } }, [
    h('button.pdt-btn.acc', { type: 'button', onclick: function () {
      var st = document.getElementById('pdt-page-css');
      if (!st) {
        st = document.createElement('style');
        st.id = 'pdt-page-css';
        (document.head || document.documentElement).appendChild(st);
      }
      st.textContent = area.value;
      toast('Custom CSS applied');
    } }, [iconEl('check', 14), 'Apply CSS']),
    h('button.pdt-btn', { type: 'button', onclick: function () {
      var st = document.getElementById('pdt-page-css');
      if (st) st.remove();
      area.value = '';
      toast('Custom CSS removed');
    } }, [iconEl('trash', 14), 'Remove'])
  ]));
  return wrap;
}
function copyStylesheet(ss) {
  var text = '';
  try {
    if (ss.href) {
      fetch(ss.href).then(function (r) { return r.text(); }).then(function (t) { copyText(t); }, function () { toast('Could not fetch stylesheet'); });
      return;
    }
    Array.prototype.forEach.call(ss.cssRules, function (r) { text += r.cssText + '\n\n'; });
    copyText(text);
  } catch (e) { toast('Stylesheet blocked by CORS'); }
}

registerPanel({
  id: 'styles', label: 'Styles', icon: 'styles',
  render: function (panel) { panelEls.styles = panel; renderStylesPanel(); },
  onShow: renderStylesPanel
});


/* ===== 08-network.js ===== */
/*
 * 08-network.js — XHR / fetch / WebSocket interception + request list + detail view
 */

var netListEl = null, netDetailId = null, netFilterType = 'all', netSearchVal = '';
var netRenderQueued = false;

function netNow() { return (performance && performance.now) ? performance.now() : Date.now(); }

function netAdd(type, meta) {
  if (ctx.netPaused) return null;
  /* keep the SAME object so later updates (loadend, fetch settle) are reflected live */
  var e = meta;
  e.id = ++ctx.netSeq;
  e.type = type;
  e.method = e.method || 'GET';
  e.url = e.url || '';
  e.finalUrl = e.finalUrl || e.url;
  e.status = (e.status != null) ? e.status : null;
  e.pending = (e.pending !== false);
  e.reqHeaders = e.reqHeaders || {};
  e.reqBody = (e.reqBody !== undefined) ? e.reqBody : null;
  e.resHeaders = e.resHeaders || null;
  e.resBody = (e.resBody !== undefined) ? e.resBody : null;
  e.size = (e.size != null) ? e.size : null;
  e.start = (e.start != null) ? e.start : netNow();
  e.duration = (e.duration != null) ? e.duration : null;
  e.error = e.error || null;
  e.msgs = e.msgs || 0;
  e.t = Date.now();
  ctx.netEntries.push(e);
  if (ctx.netEntries.length > 300) ctx.netEntries.splice(0, ctx.netEntries.length - 300);
  netTouch();
  return e;
}
function netTouch() {
  if (!netRenderQueued && panelEls.network) {
    netRenderQueued = true;
    requestAnimationFrame(function () { netRenderQueued = false; renderNetList(); });
  }
}

/* ---------------- request blocker ----------------
 * Persistent list of URL substring patterns. Matching XHR / fetch / sendBeacon
 * requests never leave the browser; they appear in the list with status BLK. */
function isBlocked(url) {
  if (!ctx.blockList || !ctx.blockList.length) return false;
  var u = String(url || '');
  for (var i = 0; i < ctx.blockList.length; i++) {
    var b = ctx.blockList[i];
    if (b.on && b.pattern && u.indexOf(b.pattern) >= 0) return true;
  }
  return false;
}
function saveBlockList() { pdtSet('blocklist', ctx.blockList); }

function manageBlocker() {
  modal('Request blocker', function (body, close) {
    function draw() {
      body.textContent = '';
      var addIn = h('input.pdt-input.pdt-grow', { placeholder: 'URL contains… e.g. doubleclick.net', autocapitalize: 'off', spellcheck: 'false' });
      var addBtn = h('button.pdt-btn.acc', { type: 'button' }, [iconEl('plus', 14), 'Block']);
      addBtn.addEventListener('click', function () {
        var p = addIn.value.trim();
        if (!p) { toast('Enter a URL fragment'); return; }
        ctx.blockList.push({ pattern: p, on: true });
        saveBlockList(); draw();
      });
      body.appendChild(h('.pdt-row', [addIn, addBtn]));
      if (!ctx.blockList.length) {
        body.appendChild(h('.pdt-empty', 'No blocking rules yet.\nAdd a URL fragment to block matching requests (ads, trackers, analytics…).'));
        return;
      }
      ctx.blockList.forEach(function (b, i) {
        var row = h('.pdt-row', { style: { margin: '6px 0' } }, [
          h('button.pdt-chip' + (b.on ? '.on' : ''), { type: 'button', style: { fontFamily: 'var(--mono)' } }, truncate(b.pattern, 32)),
          h('button.pdt-ib', { type: 'button', title: 'Delete rule', onclick: function () {
            ctx.blockList.splice(i, 1); saveBlockList(); draw();
          } }, iconEl('trash', 14))
        ]);
        row.firstChild.addEventListener('click', function () {
          b.on = !b.on; saveBlockList(); draw();
        });
        body.appendChild(row);
      });
      body.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em', color: 'var(--muted)' } },
        'Rules apply to XHR, fetch and sendBeacon requests made after the rule was added. ' +
        'Blocked requests show as BLK in the list. Rules persist across page loads.'));
    }
    draw();
  });
}

/* ---------------- hooks (installed at load) ---------------- */
function reqBodyText(body) {
  if (body == null) return null;
  if (typeof body === 'string') return truncate(body, 20000);
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return truncate(body.toString(), 20000);
  if (typeof FormData !== 'undefined' && body instanceof FormData) return '[FormData]';
  if (typeof Blob !== 'undefined' && body instanceof Blob) return '[Blob ' + fmtBytes(body.size) + ']';
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) return '[ArrayBuffer ' + fmtBytes(body.byteLength) + ']';
  try { return truncate(String(body), 20000); } catch (e) { return '[unserializable body]'; }
}

(function installNetworkHooks() {
  /* ---- XMLHttpRequest ---- */
  try {
    var XO = XMLHttpRequest.prototype.open,
        XS = XMLHttpRequest.prototype.send,
        XH = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function (m, u) {
      this.__pdt = { method: String(m || 'GET').toUpperCase(), url: String(u || ''), reqHeaders: {} };
      return XO.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
      if (this.__pdt) this.__pdt.reqHeaders[k] = v;
      return XH.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      var xhr = this, meta = xhr.__pdt || (xhr.__pdt = { method: 'GET', url: '', reqHeaders: {} });
      meta.start = netNow();
      meta.reqBody = reqBodyText(body);
      if (isBlocked(meta.url)) {
        meta.pending = false;
        meta.blocked = true;
        meta.status = null;
        meta.duration = 0;
        meta.error = 'Blocked by Pocket DevTools request blocker';
        netAdd('XHR', meta);
        try { this.abort(); } catch (e) { /* noop */ }
        return;
      }
      var entry = netAdd('XHR', meta);
      xhr.addEventListener('loadend', function () {
        meta.pending = false;
        meta.status = xhr.status;
        meta.finalUrl = xhr.responseURL || meta.url;
        meta.duration = netNow() - meta.start;
        try { meta.resHeaders = xhr.getAllResponseHeaders() || null; } catch (e) { /* noop */ }
        try {
          var rt = xhr.responseText;
          meta.size = rt ? rt.length : (xhr.response && xhr.response.size) || null;
          if (rt && (!settings.netBodyLimit || rt.length <= settings.netBodyLimit)) meta.resBody = rt;
          else if (rt) meta.resBody = truncate(rt, settings.netBodyLimit || 0) + '\n… (truncated)';
        } catch (e) { meta.resBody = '[binary or blocked response: ' + (xhr.responseType || 'unknown') + ']'; }
        if (entry) { netTouch(); }
      });
      return XS.apply(this, arguments);
    };
  } catch (e) { conEmit('warn', ['DevTools: could not hook XMLHttpRequest']); }

  /* ---- fetch ---- */
  try {
    var OF = window.fetch;
    if (OF) {
      window.fetch = function (input, init) {
        var meta = {
          method: ((init && init.method) || (input && input.method) || 'GET').toUpperCase(),
          url: (typeof input === 'string') ? input : (input && input.url) || String(input),
          reqHeaders: {}, start: netNow()
        };
        if (isBlocked(meta.url)) {
          netAdd('Fetch', {
            method: meta.method, url: meta.url, reqHeaders: {}, start: netNow(),
            pending: false, blocked: true, status: null, duration: 0,
            error: 'Blocked by Pocket DevTools request blocker'
          });
          return Promise.reject(new TypeError('Blocked by Pocket DevTools request blocker'));
        }
        if (init && init.headers) {
          try {
            if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
              init.headers.forEach(function (v, k) { meta.reqHeaders[k] = v; });
            } else if (typeof init.headers === 'object') {
              for (var hk in init.headers) meta.reqHeaders[hk] = init.headers[hk];
            }
          } catch (e) { /* noop */ }
        }
        if (init && init.body != null) meta.reqBody = reqBodyText(init.body);
        var entry = netAdd('Fetch', meta);
        var p = OF.apply(this, arguments);
        p.then(function (res) {
          meta.pending = false;
          meta.status = res.status;
          meta.finalUrl = res.url || meta.url;
          meta.duration = netNow() - meta.start;
          var rh = {};
          try { res.headers.forEach(function (v, k) { rh[k] = v; }); meta.resHeaders = rh; } catch (e) { /* noop */ }
          try {
            if (settings.netBodyLimit > 0) {
              res.clone().text().then(function (t) {
                meta.size = t ? t.length : 0;
                meta.resBody = (t.length > settings.netBodyLimit) ? truncate(t, settings.netBodyLimit) + '\n… (truncated)' : t;
                netTouch();
              }, function () { /* body unreadable */ });
            }
          } catch (e) { /* noop */ }
          netTouch();
        }, function (err) {
          meta.pending = false;
          meta.status = 0;
          meta.error = (err && err.message) || 'network error';
          meta.duration = netNow() - meta.start;
          netTouch();
        });
        return p;
      };
    }
  } catch (e) { conEmit('warn', ['DevTools: could not hook fetch']); }

  /* ---- sendBeacon ---- */
  try {
    var OB = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
    if (OB) {
      navigator.sendBeacon = function (url, data) {
        netAdd('Beacon', {
          method: 'POST', url: String(url), reqBody: reqBodyText(data),
          pending: false, status: isBlocked(url) ? null : 204, blocked: isBlocked(url),
          duration: 0, error: isBlocked(url) ? 'Blocked by request blocker' : null
        });
        if (isBlocked(url)) return true;
        return OB(url, data);
      };
    }
  } catch (e) { /* noop */ }

  /* ---- WebSocket ---- */
  try {
    var WS = window.WebSocket;
    if (WS) {
      var PWS = function (url, protocols) {
        var ws = (protocols !== undefined) ? new WS(url, protocols) : new WS(url);
        var e = netAdd('WS', { method: 'WS', url: String(url), pending: false, status: 101, resBody: '' });
        if (e) {
          ws.addEventListener('open', function () { e.resBody = '[connected]\n'; netTouch(); });
          ws.addEventListener('close', function () { e.status = 1006; e.resBody += '[closed]\n'; e.duration = netNow() - e.start; netTouch(); });
          ws.addEventListener('error', function () { e.error = 'WebSocket error'; netTouch(); });
          ws.addEventListener('message', function (ev) {
            e.msgs++;
            var d = (typeof ev.data === 'string') ? ev.data : '[binary frame]';
            e.resBody += '\u2193 ' + truncate(d, 300) + '\n';
            e.size = (e.size || 0) + d.length;
            netTouch();
          });
        }
        return ws;
      };
      PWS.prototype = WS.prototype;
      try {
        for (var wk in WS) PWS[wk] = WS[wk];
        PWS.CONNECTING = 0; PWS.OPEN = 1; PWS.CLOSING = 2; PWS.CLOSED = 3;
      } catch (e) { /* noop */ }
      window.WebSocket = PWS;
    }
  } catch (e) { conEmit('warn', ['DevTools: could not hook WebSocket']); }
})();

/* ---------------- rendering ---------------- */
function netPasses(e) {
  if (netFilterType !== 'all' && e.type.toLowerCase() !== netFilterType) return false;
  if (netSearchVal && e.url.toLowerCase().indexOf(netSearchVal.toLowerCase()) < 0) return false;
  return true;
}

function renderNetList() {
  if (!netListEl) return;
  netListEl.textContent = '';
  var shown = ctx.netEntries.filter(netPasses);
  if (!shown.length) {
    netListEl.appendChild(h('.pdt-empty', ctx.netEntries.length ?
      'No requests match the current filter' :
      'No requests captured yet.\nRequests made after DevTools loaded appear here.'));
    return;
  }
  var frag = document.createDocumentFragment();
  for (var i = shown.length - 1; i >= 0; i--) frag.appendChild(netRow(shown[i]));
  netListEl.appendChild(frag);
}

function netRow(e) {
  var statusCls = e.blocked ? 's4' : e.pending ? 'sp' : (e.status >= 500 || e.status === 0) ? 's5' :
    e.status >= 400 ? 's4' : e.status >= 300 ? 's3' : 's2';
  var statusTxt = e.blocked ? 'BLK' : e.pending ? '…' : (e.status || 'ERR');
  var method = e.method || 'GET';
  var mcls = 'b-' + ({ GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'delete' }[method] || 'other');

  var left = h('span', { style: { display: 'flex', flexDirection: 'column', gap: '2px', flex: '1', minWidth: '0' } }, [
    h('span.u', clipUrl(e.finalUrl || e.url)),
    h('span.m', [h('span.pdt-badge.' + mcls, method + (e.type === 'WS' ? ' · WS' : '')),
      e.msgs ? ' ' + e.msgs + ' msgs' : ''])
  ]);
  var right = h('span', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flex: 'none' } }, [
    h('span.m.' + statusCls, statusTxt + (e.error ? ' !' : '')),
    h('span.m', (e.duration != null ? fmtMs(e.duration) : '—') + ' · ' + (e.size != null ? fmtBytes(e.size) : '—'))
  ]);
  var row = h('.pdt-nrow2', [left, right]);
  row.addEventListener('click', function () { netDetailId = e.id; renderNetDetail(); });
  return row;
}

function renderNetDetail() {
  if (!panelEls.network) return;
  var panel = panelEls.network;
  var e = null;
  for (var i = 0; i < ctx.netEntries.length; i++) if (ctx.netEntries[i].id === netDetailId) e = ctx.netEntries[i];
  if (!e) { netDetailId = null; renderNetPanel(); return; }

  panel.textContent = '';
  var back = h('button.pdt-ib', { type: 'button', onclick: function () { netDetailId = null; renderNetPanel(); } }, iconEl('back'));
  panel.appendChild(h('.pdt-toolbar', [back,
    h('button.pdt-ib', { type: 'button', title: 'Copy URL', onclick: function () { copyText(e.finalUrl || e.url); } }, iconEl('copy')),
    h('button.pdt-ib', { type: 'button', title: 'Copy as cURL', onclick: function () { copyText(netCurl(e)); } }, iconEl('external')),
    h('button.pdt-ib', { type: 'button', title: 'Copy as fetch()', onclick: function () { copyText(netFetchSnippet(e)); } }, iconEl('code')),
    h('button.pdt-ib', { type: 'button', title: 'Copy response', onclick: function () { copyText(e.resBody || ''); } }, iconEl('download')),
    h('button.pdt-ib', { type: 'button', title: 'Block this URL', onclick: function () {
      var u = e.finalUrl || e.url;
      try { u = new URL(u, location.href).host; } catch (e2) { /* keep raw */ }
      ctx.blockList.push({ pattern: u, on: true });
      saveBlockList(); toast('Blocked: ' + u);
    } }, iconEl('shield'))
  ]));

  var sc = h('.pdt-scroll');
  sc.appendChild(h('.pdt-card', [
    kv('URL', e.finalUrl || e.url),
    kv('Method', e.method + '  (' + e.type + ')'),
    kv('Status', e.pending ? 'pending…' : (e.status || 'error') + (e.error ? ' — ' + e.error : '')),
    kv('Time', e.duration != null ? fmtMs(e.duration) : '—'),
    kv('Size', e.size != null ? fmtBytes(e.size) : '—'),
    kv('Captured', fmtTime(e.t))
  ]));

  if (e.reqHeaders && Object.keys(e.reqHeaders).length) {
    sc.appendChild(h('.pdt-sec', 'Request headers'));
    sc.appendChild(headerTable(e.reqHeaders));
  }
  if (e.reqBody) {
    sc.appendChild(h('.pdt-sec', 'Request body'));
    sc.appendChild(codeBlock(e.reqBody, null));
  }
  if (e.resHeaders) {
    sc.appendChild(h('.pdt-sec', 'Response headers'));
    sc.appendChild(typeof e.resHeaders === 'string' ? rawText(e.resHeaders) : headerTable(e.resHeaders));
  }
  if (e.resBody != null && e.resBody !== '') {
    sc.appendChild(h('.pdt-sec', 'Response'));
    var pretty = tryPrettyJson(e.resBody);
    sc.appendChild(codeBlock(pretty != null ? pretty : e.resBody, pretty != null ? 'js' : null));
  } else if (!e.pending) {
    sc.appendChild(h('.pdt-sec', 'Response'));
    sc.appendChild(h('.pdt-empty', 'No response body captured'));
  }
  panel.appendChild(sc);
}

function headerTable(headers) {
  var rows = [];
  for (var k in headers) rows.push(kv(k, truncate(String(headers[k]), 300)));
  return h('.pdt-card', rows);
}
function rawText(s) {
  var pre = h('pre.pdt-mono', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', padding: '8px' } });
  pre.textContent = s;
  return pre;
}
function tryPrettyJson(s) {
  if (typeof s !== 'string' || s.length < 2 || s.length > 1000000) return null;
  var t = s.trim();
  if (t[0] !== '{' && t[0] !== '[') return null;
  try { return JSON.stringify(JSON.parse(t), null, 2); } catch (e) { return null; }
}
function netCurl(e) {
  var url = (e.finalUrl || e.url).replace(/'/g, "'\\''");
  var parts = ["curl '" + url + "'"];
  if (e.method && e.method !== 'GET') parts.push('-X ' + e.method);
  for (var k in e.reqHeaders) {
    parts.push("  -H '" + k + ": " + String(e.reqHeaders[k]).replace(/'/g, "'\\''") + "'");
  }
  if (e.reqBody) parts.push("  --data-raw '" + String(e.reqBody).replace(/'/g, "'\\''") + "'");
  return parts.join(' \\\n');
}

function netFetchSnippet(e) {
  var opts = { method: e.method || 'GET' };
  var hdrs = {};
  for (var k in e.reqHeaders) hdrs[k] = e.reqHeaders[k];
  if (Object.keys(hdrs).length) opts.headers = hdrs;
  if (e.reqBody && e.method !== 'GET' && e.method !== 'HEAD') opts.body = e.reqBody;
  return 'fetch(' + JSON.stringify(e.finalUrl || e.url) + ', ' + JSON.stringify(opts, null, 2) + ')';
}

/* ---------------- HAR export ---------------- */
function buildHar() {
  var entries = [];
  ctx.netEntries.forEach(function (e) {
    if (e.blocked || e.pending || !e.url) return;
    function hdrs(obj) {
      var out = [];
      if (typeof obj === 'string') {
        obj.split('\r\n').forEach(function (line) {
          var i = line.indexOf(':');
          if (i > 0) out.push({ name: line.slice(0, i).trim(), value: line.slice(i + 1).trim() });
        });
      } else if (obj) {
        for (var k in obj) out.push({ name: k, value: String(obj[k]) });
      }
      return out;
    }
    var body = (typeof e.resBody === 'string') ? e.resBody : '';
    entries.push({
      startedDateTime: new Date(e.t).toISOString(),
      time: Math.round(e.duration || 0),
      request: {
        method: e.method || 'GET',
        url: e.finalUrl || e.url,
        httpVersion: '',
        cookies: [],
        headers: hdrs(e.reqHeaders),
        queryString: [],
        headersSize: -1,
        bodySize: e.reqBody ? e.reqBody.length : 0,
        postData: e.reqBody ? { mimeType: (e.reqHeaders['Content-Type'] || e.reqHeaders['content-type'] || 'text/plain'), text: String(e.reqBody).slice(0, 16384) } : undefined
      },
      response: {
        status: e.status || 0,
        statusText: '',
        httpVersion: '',
        cookies: [],
        headers: hdrs(e.resHeaders),
        content: { size: e.size || (body ? body.length : 0), mimeType: '', text: body.slice(0, 524288) },
        redirectURL: '',
        headersSize: -1,
        bodySize: e.size || 0
      },
      cache: {},
      timings: { blocked: 0, dns: -1, connect: -1, send: 0, wait: Math.round(e.duration || 0), receive: 0, ssl: -1 }
    });
  });
  return {
    log: {
      version: '1.2',
      creator: { name: 'Pocket DevTools', version: VERSION, comment: 'https://github.com/shalosi00/Bookmarklet-Dev-Tools' },
      entries: entries
    }
  };
}
function exportHar() {
  var har = buildHar();
  if (!har.log.entries.length) { toast('No completed requests to export'); return; }
  var name = 'pdt-' + (location.host || 'page').replace(/[^a-z0-9.-]/gi, '_') + '-' +
    new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.har';
  downloadFile(name, JSON.stringify(har, null, 1), 'application/json');
}

function renderNetPanel() {
  if (!panelEls.network) return;
  var panel = panelEls.network;
  panel.textContent = '';
  if (netDetailId != null) { renderNetDetail(); return; }

  var chips = {};
  [['all', 'All'], ['xhr', 'XHR'], ['fetch', 'Fetch'], ['ws', 'WS']].forEach(function (c) {
    chips[c[0]] = h('button.pdt-chip' + (netFilterType === c[0] ? '.on' : ''), c[1]);
    chips[c[0]].addEventListener('click', function () {
      netFilterType = c[0];
      renderNetPanel();
    });
  });
  var search = h('input.pdt-input.pdt-grow', { type: 'search', placeholder: 'Filter URL' });
  search.addEventListener('input', debounce(function () { netSearchVal = search.value; renderNetList(); }, 200));
  var count = h('span', { style: { color: 'var(--muted)', fontSize: '.85em', flex: 'none' } },
    ctx.netEntries.length + ' req');

  var pauseBtn = h('button.pdt-ib', { type: 'button', title: ctx.netPaused ? 'Resume capture' : 'Pause capture' }, iconEl(ctx.netPaused ? 'play' : 'pause'));
  pauseBtn.addEventListener('click', function () {
    ctx.netPaused = !ctx.netPaused;
    toast(ctx.netPaused ? 'Network capture paused' : 'Network capture resumed');
    renderNetPanel();
  });

  var blockedCount = ctx.blockList.filter(function (b) { return b.on; }).length;
  var blockBtn = h('button.pdt-ib', { type: 'button', title: 'Request blocker' + (blockedCount ? ' (' + blockedCount + ' active)' : '') },
    iconEl(blockedCount ? 'shield' : 'shieldoff'));
  if (blockedCount) blockBtn.style.color = 'var(--warn)';
  blockBtn.addEventListener('click', manageBlocker);

  panel.appendChild(h('.pdt-toolbar', [
    chips.all, chips.xhr, chips.fetch, chips.ws, search, count, pauseBtn, blockBtn,
    h('button.pdt-ib', { type: 'button', title: 'Export HAR', onclick: exportHar }, iconEl('save')),
    h('button.pdt-ib', { type: 'button', title: 'Clear', onclick: function () { ctx.netEntries = []; renderNetPanel(); } }, iconEl('trash'))
  ]));
  netListEl = h('.pdt-scroll', { style: { padding: '0' } });
  panel.appendChild(netListEl);
  renderNetList();
}

registerPanel({
  id: 'network', label: 'Network', icon: 'network',
  render: function (panel) { panelEls.network = panel; renderNetPanel(); },
  onShow: function () { if (netDetailId == null) renderNetList(); }
});


/* ===== 09-api.js ===== */
/*
 * 09-api.js — API tester panel: a mini REST client (method / URL / headers /
 *             body), saved requests, response inspector. Requests are sent
 *             through the page's fetch (which Pocket DevTools hooks), so they
 *             also show up in the Network panel.
 */

var apiSub = 'builder';
var apiSaved = pdtGet('apireqs', []);
var apiHistory = [];
var apiLast = null;           /* last response meta for the viewer */

function renderApiPanel() {
  if (!panelEls.api) return;
  var panel = panelEls.api;
  panel.textContent = '';

  var subs = [['builder', 'Request'], ['saved', 'Saved (' + apiSaved.length + ')'], ['history', 'History']];
  var subBar = h('.pdt-sub');
  subs.forEach(function (s) {
    var b = h('button.pdt-subb' + (apiSub === s[0] ? '.on' : ''), s[1]);
    b.addEventListener('click', function () { apiSub = s[0]; renderApiPanel(); });
    subBar.appendChild(b);
  });
  panel.appendChild(subBar);
  var sc = h('.pdt-scroll');
  panel.appendChild(sc);
  if (apiSub === 'builder') sc.appendChild(buildApiBuilder());
  else if (apiSub === 'saved') sc.appendChild(buildApiSaved());
  else sc.appendChild(buildApiHistory());
}

/* shared form state (kept while the panel lives) */
var apiForm = null;
function apiFormState() {
  if (!apiForm) {
    apiForm = {
      method: 'GET',
      url: '',
      headers: [{ k: '', v: '' }],   /* key/value rows */
      body: '',
      ctype: 'none'                   /* none | json | form | text */
    };
  }
  return apiForm;
}

function apiCollectHeaders(rows) {
  var out = {};
  rows.forEach(function (r) {
    var k = (r.k || '').trim();
    if (!k) return;
    out[k] = r.v || '';
  });
  return out;
}

function apiSend() {
  var f = apiFormState();
  var url = f.url.trim();
  if (!url) { toast('Enter a URL first'); return; }
  var headers = apiCollectHeaders(f.headers);
  var body = null;
  if (f.method !== 'GET' && f.method !== 'HEAD' && f.body.trim()) {
    body = f.body;
    if (f.ctype === 'json' && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    } else if (f.ctype === 'form' && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }
  var t0 = netNow();
  apiLast = { pending: true, url: url, method: f.method, t: Date.now() };
  apiHistory.unshift({ method: f.method, url: url, t: Date.now(), ok: null });
  if (apiHistory.length > 25) apiHistory.pop();

  toast('Sending ' + f.method + ' ' + truncate(url, 40) + '…');
  fetch(url, {
    method: f.method,
    headers: headers,
    body: body,
    /* same-origin credentials often needed for internal APIs */
    credentials: 'same-origin'
  }).then(function (res) {
    var rh = {};
    try { res.headers.forEach(function (v, k) { rh[k] = v; }); } catch (e) { /* noop */ }
    var p = res.body ? res.text() : Promise.resolve('');
    return p.then(function (txt) {
      apiLast = {
        pending: false, ok: true, url: url, method: f.method,
        status: res.status, statusText: res.statusText,
        headers: rh, body: txt, dur: netNow() - t0, t: Date.now(), finalUrl: res.url
      };
      apiHistory[0].ok = res.status;
      renderApiPanel();
    }, function () {
      apiLast = {
        pending: false, ok: true, url: url, method: f.method,
        status: res.status, statusText: res.statusText,
        headers: rh, body: '(response body unreadable)', dur: netNow() - t0, t: Date.now(), finalUrl: res.url
      };
      apiHistory[0].ok = res.status;
      renderApiPanel();
    });
  }, function (err) {
    apiLast = {
      pending: false, ok: false, url: url, method: f.method,
      error: (err && err.message) || 'network error', dur: netNow() - t0, t: Date.now()
    };
    apiHistory[0].ok = 0;
    renderApiPanel();
  });
  apiSub = 'builder';
  renderApiPanel();
}

/* ---------------- builder ---------------- */
function buildApiBuilder() {
  var wrap = h('div');
  var f = apiFormState();

  /* method + URL row */
  var methodSel = h('select.pdt-select', { style: { width: '104px', flex: 'none', fontFamily: 'var(--mono)' } });
  ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].forEach(function (m) {
    var o = h('option', m);
    o.value = m;
    if (m === f.method) o.selected = true;
    methodSel.appendChild(o);
  });
  methodSel.addEventListener('change', function () { f.method = methodSel.value; });

  var urlIn = h('input.pdt-input.pdt-grow.pdt-mono', {
    type: 'text', placeholder: 'https://api.example.com/path?q=1',
    autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false'
  });
  urlIn.value = f.url;
  urlIn.addEventListener('input', function () { f.url = urlIn.value; });
  urlIn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); apiSend(); }
  });

  wrap.appendChild(h('.pdt-label', 'Request'));
  wrap.appendChild(h('.pdt-row', [methodSel, urlIn]));

  /* headers */
  var hdrCard = h('.pdt-card');
  hdrCard.appendChild(h('.pdt-label', 'Headers'));
  var hdrList = h('div');
  function drawHeaders() {
    hdrList.textContent = '';
    f.headers.forEach(function (row, i) {
      var kIn = h('input.pdt-input.pdt-mono', { placeholder: 'Header', value: row.k, autocapitalize: 'off', spellcheck: 'false', style: { width: '42%' } });
      var vIn = h('input.pdt-input.pdt-mono', { placeholder: 'Value', value: row.v, autocapitalize: 'off', spellcheck: 'false' });
      kIn.addEventListener('input', function () { row.k = kIn.value; });
      vIn.addEventListener('input', function () { row.v = vIn.value; });
      hdrList.appendChild(h('.pdt-row', { style: { marginBottom: '6px' } }, [
        kIn, vIn,
        h('button.pdt-ib', { type: 'button', title: 'Remove', onclick: function () { f.headers.splice(i, 1); drawHeaders(); } }, iconEl('trash', 14))
      ]));
    });
    var addK = h('input.pdt-input.pdt-mono', { placeholder: 'Header', style: { width: '42%' } });
    var addV = h('input.pdt-input.pdt-mono', { placeholder: 'Value' });
    hdrList.appendChild(h('.pdt-row', [addK, addV,
      h('button.pdt-ib', { type: 'button', title: 'Add header', onclick: function () {
        f.headers.push({ k: addK.value, v: addV.value });
        drawHeaders();
      } }, iconEl('plus', 14))
    ]));
  }
  drawHeaders();
  hdrCard.appendChild(hdrList);
  wrap.appendChild(hdrCard);

  /* body */
  var bodyCard = h('.pdt-card');
  bodyCard.appendChild(h('.pdt-label', 'Body'));
  var ctSeg = h('.pdt-seg');
  [['none', 'None'], ['json', 'JSON'], ['form', 'Form'], ['text', 'Text']].forEach(function (c) {
    var b = h('button' + (f.ctype === c[0] ? '.on' : ''), c[1]);
    b.addEventListener('click', function () {
      f.ctype = c[0];
      bodyCard.querySelectorAll('.pdt-seg button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      area.style.display = c[0] === 'none' ? 'none' : '';
    });
    ctSeg.appendChild(b);
  });
  bodyCard.appendChild(ctSeg);
  var area = h('textarea.pdt-area', { rows: 6, placeholder: '{ "key": "value" }', spellcheck: 'false' });
  area.value = f.body;
  area.style.display = f.ctype === 'none' ? 'none' : '';
  area.addEventListener('input', function () { f.body = area.value; });
  bodyCard.appendChild(h('div', { style: { marginTop: '8px' } }, area));
  if (f.ctype === 'json') {
    bodyCard.appendChild(h('button.pdt-btn', { type: 'button', style: { marginTop: '8px' }, onclick: function () {
      try {
        area.value = JSON.stringify(JSON.parse(area.value), null, 2);
        f.body = area.value;
        toast('JSON formatted');
      } catch (e) { toast('Invalid JSON: ' + (e.message || e)); }
    } }, [iconEl('code', 14), 'Format JSON']));
  }
  wrap.appendChild(bodyCard);

  /* actions */
  wrap.appendChild(h('.pdt-row', { style: { margin: '10px 0' } }, [
    h('button.pdt-btn.acc', { type: 'button', onclick: apiSend }, [iconEl('play', 15), 'Send']),
    h('button.pdt-btn', { type: 'button', onclick: function () {
      if (!f.url.trim()) { toast('Enter a URL first'); return; }
      promptModal('Save request', 'Name', (f.method + ' ' + clipUrl(f.url)).slice(0, 48), function (name) {
        name = (name || '').trim();
        if (!name) name = f.method + ' ' + truncate(f.url, 30);
        apiSaved.push({ id: uid(), name: name, method: f.method, url: f.url, headers: f.headers.slice(), body: f.body, ctype: f.ctype });
        pdtSet('apireqs', apiSaved);
        toast('Request saved');
      });
    } }, [iconEl('save', 14), 'Save']),
    h('button.pdt-btn', { type: 'button', onclick: function () {
      copyText(apiCurl(f.method, f.url, apiCollectHeaders(f.headers), f.body));
    } }, [iconEl('external', 14), 'cURL'])
  ]));

  /* response viewer */
  if (apiLast) wrap.appendChild(buildApiResponse(apiLast));
  return wrap;
}

function apiCurl(method, url, headers, body) {
  var parts = ["curl '" + String(url).replace(/'/g, "'\\''") + "'"];
  if (method && method !== 'GET') parts.push('-X ' + method);
  for (var k in headers) parts.push("  -H '" + k + ": " + String(headers[k]).replace(/'/g, "'\\''") + "'");
  if (body && method !== 'GET' && method !== 'HEAD') parts.push("  --data-raw '" + String(body).replace(/'/g, "'\\''") + "'");
  return parts.join(' \\\n');
}

function buildApiResponse(r) {
  var wrap = h('div');
  wrap.appendChild(h('.pdt-label', 'Response'));

  if (r.pending) {
    wrap.appendChild(h('.pdt-card', h('.pdt-mtext', 'Sending…')));
    return wrap;
  }
  if (!r.ok) {
    wrap.appendChild(h('.pdt-card', [
      kv('Error', r.error || 'request failed'),
      kv('Elapsed', fmtMs(r.dur))
    ]));
    return wrap;
  }

  var statusColor = r.status >= 500 ? 'var(--err)' : r.status >= 400 ? 'var(--warn)' : r.status >= 300 ? 'var(--accent)' : 'var(--ok)';
  var head = h('.pdt-card');
  head.appendChild(h('.pdt-row', [
    h('span.pdt-mono', { style: { fontSize: '1.25em', fontWeight: '700', color: statusColor } }, String(r.status)),
    h('span.pdt-grow', r.statusText || ''),
    h('span.pdt-mono', { style: { color: 'var(--muted)', fontSize: '.85em' } }, fmtMs(r.dur) + ' · ' + fmtBytes((r.body || '').length))
  ]));
  head.appendChild(kv('Final URL', truncate(r.finalUrl || r.url, 120)));
  wrap.appendChild(head);

  if (r.headers && Object.keys(r.headers).length) {
    var hc = h('.pdt-card');
    hc.appendChild(h('.pdt-label', 'Response headers'));
    for (var k in r.headers) hc.appendChild(kv(k, truncate(String(r.headers[k]), 200)));
    wrap.appendChild(hc);
  }

  if (r.body) {
    var bc = h('.pdt-card');
    var pretty = tryPrettyJson(r.body);
    var imgType = '';
    for (var hk in (r.headers || {})) {
      if (hk.toLowerCase() === 'content-type' && /^image\//i.test(r.headers[hk])) imgType = r.headers[hk];
    }
    bc.appendChild(h('.pdt-label', 'Body'));
    if (imgType) {
      bc.appendChild(h('img', { src: r.finalUrl || r.url, style: { maxWidth: '100%', borderRadius: '8px', border: '1px solid var(--border)' } }));
    } else {
      bc.appendChild(codeBlock(pretty != null ? pretty : r.body, pretty != null ? 'js' : null));
    }
    bc.appendChild(h('.pdt-row', { style: { marginTop: '8px' } }, [
      h('button.pdt-btn', { type: 'button', onclick: function () { copyText(r.body); } }, [iconEl('copy', 14), 'Copy body']),
      h('button.pdt-btn', { type: 'button', onclick: function () {
        var fname = 'response-' + Date.now() + (pretty != null ? '.json' : '.txt');
        downloadFile(fname, r.body, pretty != null ? 'application/json' : 'text/plain');
      } }, [iconEl('download', 14), 'Download'])
    ]));
    wrap.appendChild(bc);
  }
  return wrap;
}

/* ---------------- saved requests ---------------- */
function buildApiSaved() {
  var wrap = h('div');
  if (!apiSaved.length) {
    return h('.pdt-empty', 'No saved requests yet.\nBuild a request, then tap Save to keep it here — it persists across page loads.');
  }
  apiSaved.forEach(function (s) {
    wrap.appendChild(h('.pdt-card', [
      h('.pdt-row', [
        h('span.pdt-badge.b-' + ({ GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'delete' }[s.method] || 'other'), s.method),
        h('b.pdt-grow', { style: { fontSize: '.9em' } }, truncate(s.name, 36))
      ]),
      h('div.pdt-mono', { style: { fontSize: '.8em', color: 'var(--muted)', wordBreak: 'break-all', margin: '6px 0' } }, truncate(s.url, 90)),
      h('.pdt-row', [
        h('button.pdt-btn.acc', { type: 'button', onclick: function () {
          var f = apiFormState();
          f.method = s.method; f.url = s.url;
          f.headers = (s.headers && s.headers.length ? s.headers : [{ k: '', v: '' }]).map(function (r) { return { k: r.k, v: r.v }; });
          f.body = s.body || ''; f.ctype = s.ctype || 'none';
          apiSub = 'builder'; renderApiPanel(); toast('Loaded into builder');
        } }, [iconEl('edit', 13), 'Load']),
        h('button.pdt-ib', { type: 'button', title: 'Send now', onclick: function () {
          var f = apiFormState();
          f.method = s.method; f.url = s.url;
          f.headers = (s.headers && s.headers.length ? s.headers : [{ k: '', v: '' }]).map(function (r) { return { k: r.k, v: r.v }; });
          f.body = s.body || ''; f.ctype = s.ctype || 'none';
          apiSend();
        } }, iconEl('play', 15)),
        h('button.pdt-ib', { type: 'button', title: 'Delete', onclick: function () {
          confirmModal('Delete saved request "' + s.name + '"?', 'Delete', function () {
            apiSaved = apiSaved.filter(function (x) { return x.id !== s.id; });
            pdtSet('apireqs', apiSaved);
            renderApiPanel();
          }, true);
        } }, iconEl('trash', 14))
      ])
    ]));
  });
  return wrap;
}

/* ---------------- history ---------------- */
function buildApiHistory() {
  var wrap = h('div');
  if (!apiHistory.length) {
    return h('.pdt-empty', 'Requests sent from the API tester appear here (this session only).');
  }
  var c = h('.pdt-card');
  apiHistory.forEach(function (hh) {
    var st = hh.ok == null ? '…' : (hh.ok || 'ERR');
    var col = hh.ok == null ? 'var(--muted)' : hh.ok >= 400 || hh.ok === 0 ? 'var(--err)' : 'var(--ok)';
    c.appendChild(h('.pdt-row', { style: { padding: '4px 0' } }, [
      h('span.pdt-mono', { style: { color: col, fontWeight: '700', flex: 'none', width: '38px' } }, String(st)),
      h('span.pdt-badge.b-' + ({ GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'delete' }[hh.method] || 'other'), hh.method),
      h('span.pdt-grow.pdt-mono', { style: { fontSize: '.8em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, clipUrl(hh.url))
    ]));
  });
  wrap.appendChild(c);
  return wrap;
}

registerPanel({
  id: 'api', label: 'API', icon: 'send',
  render: function (panel) { panelEls.api = panel; renderApiPanel(); },
  onShow: renderApiPanel
});


/* ===== 10-page.js ===== */
/*
 * 09-page.js — Page panel: metadata / Open Graph, headings outline, links,
 *              images, accessibility audit, tech detection.
 */

var pgSub = 'overview';

function flashEl(el) {
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var old = el.style.outline;
    el.style.outline = '3px solid #5b9dff';
    el.style.outlineOffset = '1px';
    setTimeout(function () { el.style.outline = old; }, 2200);
  } catch (e) { /* noop */ }
}

function metaContent(name) {
  var el = document.querySelector('meta[name="' + name + '"]') ||
    document.querySelector('meta[property="' + name + '"]');
  return el ? (el.content || '') : '';
}

function renderPagePanel() {
  if (!panelEls.page) return;
  var panel = panelEls.page;
  panel.textContent = '';
  var subs = [['overview', 'Overview'], ['head', 'Headings'], ['links', 'Links'],
    ['imgs', 'Images'], ['a11y', 'A11y'], ['tech', 'Tech']];
  var subBar = h('.pdt-sub');
  subs.forEach(function (s) {
    var b = h('button.pdt-subb' + (pgSub === s[0] ? '.on' : ''), s[1]);
    b.addEventListener('click', function () { pgSub = s[0]; renderPagePanel(); });
    subBar.appendChild(b);
  });
  panel.appendChild(subBar);
  var sc = h('.pdt-scroll');
  panel.appendChild(sc);
  if (pgSub === 'overview') sc.appendChild(buildPgOverview());
  else if (pgSub === 'head') sc.appendChild(buildPgHeadings());
  else if (pgSub === 'links') sc.appendChild(buildPgLinks());
  else if (pgSub === 'imgs') sc.appendChild(buildPgImages());
  else if (pgSub === 'a11y') sc.appendChild(buildPgA11y());
  else sc.appendChild(buildPgTech());
}

/* ---------------- overview: metadata ---------------- */
function buildPgOverview() {
  var wrap = h('div');
  var doctype = '';
  try { doctype = document.doctype ? document.doctype.name : '(missing)'; } catch (e) { /* noop */ }

  var canon = '';
  try {
    var cLink = document.querySelector('link[rel="canonical"]');
    canon = metaContent('canonical') || (cLink && cLink.href) || '(missing)';
  } catch (e) { canon = '(missing)'; }

  var card = h('.pdt-card', [
    kv('Title', truncate(document.title || '(empty)', 90)),
    kv('Description', truncate(metaContent('description') || '(missing)', 120)),
    kv('Canonical', truncate(canon, 90)),
    kv('Language', document.documentElement.lang || '(missing)'),
    kv('Charset', (document.characterSet || '(unknown)') + ' · doctype: ' + doctype),
    kv('Viewport', metaContent('viewport') || '(missing)'),
    kv('Robots', metaContent('robots') || '(none)'),
    kv('Theme color', metaContent('theme-color') || '(none)'),
    kv('Color scheme', metaContent('color-scheme') || '(none)'),
    kv('Generator', metaContent('generator') || '(none)'),
    kv('Revision', (document.lastModified || '—') + ' (lastModified)'),
    kv('URL', truncate(location.href, 100))
  ]);
  wrap.appendChild(card);

  /* Open Graph / Twitter */
  var ogTags = [];
  try {
    Array.prototype.forEach.call(document.querySelectorAll('meta[property^="og:"], meta[name^="og:"], meta[name^="twitter:"]'), function (m) {
      var key = (m.getAttribute('property') || m.getAttribute('name') || '').trim();
      var val = (m.content || '').trim();
      if (key && val) ogTags.push([key, val]);
    });
  } catch (e) { /* noop */ }
  if (ogTags.length) {
    var og = h('.pdt-card');
    og.appendChild(h('.pdt-label', 'Social preview (' + ogTags.length + ' tags)'));
    ogTags.slice(0, 30).forEach(function (t) { og.appendChild(kv(t[0], truncate(t[1], 80))); });
    wrap.appendChild(og);
  } else {
    wrap.appendChild(h('.pdt-card', h('.pdt-mtext', { style: { fontSize: '.85em' } },
      'No Open Graph or Twitter Card tags — social shares of this page will render without a preview.')));
  }
  return wrap;
}

/* ---------------- headings outline ---------------- */
function buildPgHeadings() {
  var wrap = h('div');
  var heads = [];
  try { heads = Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3,h4,h5,h6')); } catch (e) { /* noop */ }
  if (!heads.length) return h('.pdt-empty', 'No heading tags (h1\u2013h6) found.');

  var counts = {};
  heads.forEach(function (hd) { counts[hd.tagName.toLowerCase()] = (counts[hd.tagName.toLowerCase()] || 0) + 1; });
  wrap.appendChild(h('.pdt-card', [
    kv('Total headings', String(heads.length)),
    kv('h1 count', String(counts.h1 || 0) + (counts.h1 === 1 ? ' (ideal)' : counts.h1 ? ' (\u22652 — should be one per page)' : ' (missing — bad for SEO)')),
    kv('Breakdown', ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(function (t) { return t + ':' + (counts[t] || 0); }).join(' · '))
  ]));

  var list = h('.pdt-card');
  list.appendChild(h('.pdt-label', 'Outline (tap to scroll)'));
  heads.slice(0, 200).forEach(function (hd) {
    var lvl = parseInt(hd.tagName.slice(1), 10);
    var text = (hd.textContent || '').trim().replace(/\s+/g, ' ');
    var row = h('.pdt-hrow', { style: { paddingLeft: ((lvl - 1) * 14) + 'px' } }, [
      h('span.pdt-badge.b-h' + lvl, 'h' + lvl),
      h('span.pdt-grow', truncate(text || '(empty heading)', 60))
    ]);
    row.addEventListener('click', function () { flashEl(hd); });
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}

/* ---------------- links ---------------- */
function buildPgLinks() {
  var wrap = h('div');
  var links = [];
  try { links = Array.prototype.slice.call(document.querySelectorAll('a[href]')); } catch (e) { /* noop */ }
  var internal = 0, external = 0, anchors = 0, blank = 0, nofollow = 0, empty = 0;
  var seen = {};
  var uniq = [];
  links.forEach(function (a) {
    var href = a.getAttribute('href') || '';
    var host = '';
    try { host = new URL(a.href, location.href).host; } catch (e) { host = ''; }
    var key = host + '|' + href;
    if (!seen[key]) { seen[key] = 1; uniq.push(a); }
    if (!href) empty++;
    else if (href.charAt(0) === '#') anchors++;
    else if (host && host !== location.host) { external++; if (a.rel && a.rel.indexOf('nofollow') >= 0) nofollow++; }
    else internal++;
    if (a.target === '_blank') blank++;
  });

  wrap.appendChild(h('.pdt-card', [
    kv('Total links', String(links.length) + ' (' + uniq.length + ' unique URLs)'),
    kv('Internal', String(internal)),
    kv('External', String(external) + (nofollow ? ' (' + nofollow + ' nofollow)' : '')),
    kv('In-page anchors', String(anchors)),
    kv('Opens in new tab', String(blank)),
    kv('Empty href', String(empty))
  ]));

  var list = h('.pdt-card');
  list.appendChild(h('.pdt-label', 'All links (tap to copy URL)'));
  uniq.slice(0, 150).forEach(function (a) {
    var href = a.getAttribute('href') || '';
    var text = (a.textContent || '').trim().replace(/\s+/g, ' ');
    var host = '';
    try { host = new URL(a.href, location.href).host; } catch (e) { /* noop */ }
    var isExt = host && host !== location.host;
    var row = h('.pdt-hrow', [
      h('span.pdt-badge.' + (isExt ? 'b-other' : 'b-get'), isExt ? 'ext' : 'int'),
      h('span.pdt-grow', [
        h('div', truncate(text || '(no text)', 46)),
        h('div.pdt-mono', { style: { fontSize: '.82em', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          truncate(href, 64))
      ])
    ]);
    row.addEventListener('click', function () { copyText(a.href || href, true); toast('Copied: ' + truncate(a.href || href, 60)); });
    list.appendChild(row);
  });
  if (uniq.length > 150) list.appendChild(h('.pdt-label', '\u2026 and ' + (uniq.length - 150) + ' more'));
  wrap.appendChild(list);
  return wrap;
}

/* ---------------- images ---------------- */
function buildPgImages() {
  var wrap = h('div');
  var imgs = [];
  try { imgs = Array.prototype.slice.call(document.images); } catch (e) { /* noop */ }
  if (!imgs.length) return h('.pdt-empty', 'No <img> elements found.');

  var broken = [], noAlt = [], distorted = [], lazy = 0, huge = [];
  imgs.forEach(function (img) {
    if (img.complete && img.naturalWidth === 0) broken.push(img);
    if (!img.hasAttribute('alt')) noAlt.push(img);
    if (img.loading === 'lazy') lazy++;
    var w = img.naturalWidth, d = img.getBoundingClientRect().width;
    if (w > 40 && d > 40) {
      var ratio = Math.round(w / Math.max(1, d));
      if (ratio >= 3) huge.push([img, ratio]);
    }
    /* dimension mismatch (displayed smaller than natural by a lot) */
    var nw = img.naturalWidth, nh = img.naturalHeight;
    var dw = img.getBoundingClientRect().width, dh = img.getBoundingClientRect().height;
    if (nw > 20 && nh > 20 && dw > 20 && dh > 20) {
      var natRatio = nw / nh, disRatio = dw / dh;
      if (Math.abs(natRatio - disRatio) / Math.max(natRatio, disRatio) > 0.25) distorted.push(img);
    }
  });

  wrap.appendChild(h('.pdt-card', [
    kv('Images', String(imgs.length)),
    kv('Broken', String(broken.length)),
    kv('Missing alt', String(noAlt.length)),
    kv('Aspect-distorted', String(distorted.length)),
    kv('Lazy-loaded', String(lazy))
  ]));

  function issueList(title, arr, descFn) {
    if (!arr.length) return null;
    var c = h('.pdt-card');
    c.appendChild(h('.pdt-label', title + ' (' + arr.length + ')'));
    arr.slice(0, 50).forEach(function (img) {
      var row = h('.pdt-hrow', [
        h('span.pdt-grow.pdt-mono', { style: { fontSize: '.8em' } },
          truncate(img.currentSrc || img.src || '(empty src)', 56))
      ].concat(descFn ? [h('span', { style: { fontSize: '.8em', color: 'var(--muted)' } }, descFn(img))] : []));
      row.addEventListener('click', function () { flashEl(img); });
      c.appendChild(row);
    });
    return c;
  }
  var b1 = issueList('Broken images', broken, null);
  if (b1) wrap.appendChild(b1);
  var b2 = issueList('Images without alt', noAlt, null);
  if (b2) wrap.appendChild(b2);
  var b3 = issueList('Distorted (stretched)', distorted, null);
  if (b3) wrap.appendChild(b3);
  if (!broken.length && !noAlt.length && !distorted.length) {
    wrap.appendChild(h('.pdt-card', h('.pdt-mtext', { style: { fontSize: '.85em' } },
      'No image issues detected. All images have alt text and are rendered at their natural aspect ratio.')));
  }
  return wrap;
}

/* ---------------- accessibility audit ---------------- */
function buildPgA11y() {
  var wrap = h('div');
  var issues = [];
  function addIssue(sev, msg, els) {
    issues.push({ sev: sev, msg: msg, els: els || [] });
  }

  /* language */
  if (!document.documentElement.lang) addIssue('err', '<html> has no lang attribute', [document.documentElement]);
  /* title */
  if (!document.title) addIssue('err', 'Page has no <title>');
  else if (document.title.length > 70) addIssue('warn', 'Title is very long (' + document.title.length + ' chars)');
  /* description */
  if (!metaContent('description')) addIssue('warn', 'No meta description');
  /* viewport */
  if (!metaContent('viewport')) addIssue('warn', 'No viewport meta tag');
  /* images alt */
  var noAlt = [];
  try { noAlt = Array.prototype.filter.call(document.images, function (i) { return !i.hasAttribute('alt'); }); } catch (e) { /* noop */ }
  if (noAlt.length) addIssue('err', noAlt.length + ' image(s) missing alt attribute', noAlt);
  /* inputs without labels */
  var noLabel = [];
  try {
    noLabel = Array.prototype.filter.call(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'), function (f) {
      if (f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || f.getAttribute('title')) return false;
      if (f.id && document.querySelector('label[for="' + CSS.escape(f.id) + '"]')) return false;
      var p = f.closest('label');
      if (p) return false;
      return true;
    });
  } catch (e) { /* noop */ }
  if (noLabel.length) addIssue('err', noLabel.length + ' form control(s) without a label', noLabel);
  /* buttons / links without accessible text */
  var noText = [];
  try {
    noText = Array.prototype.filter.call(document.querySelectorAll('button, a[href]'), function (b) {
      var txt = (b.textContent || '').trim();
      var aria = b.getAttribute('aria-label') || b.getAttribute('aria-labelledby');
      var img = b.querySelector('img[alt]:not([alt=""]), svg[aria-label]');
      return !txt && !aria && !img;
    });
  } catch (e) { /* noop */ }
  if (noText.length) addIssue('err', noText.length + ' button/link(s) without accessible text', noText);
  /* iframes without title */
  var noTitled = [];
  try { noTitled = Array.prototype.filter.call(document.querySelectorAll('iframe'), function (f) { return !f.title; }); } catch (e) { /* noop */ }
  if (noTitled.length) addIssue('warn', noTitled.length + ' iframe(s) without title', noTitled);
  /* tables without th */
  var noTh = [];
  try {
    noTh = Array.prototype.filter.call(document.querySelectorAll('table'), function (t) {
      return !t.querySelector('th');
    });
  } catch (e) { /* noop */ }
  if (noTh.length) addIssue('warn', noTh.length + ' table(s) without header cells', noTh);

  var errCount = issues.filter(function (i) { return i.sev === 'err'; }).length;
  var warnCount = issues.length - errCount;
  var score = Math.max(0, 100 - errCount * 12 - warnCount * 5);

  var head = h('.pdt-card');
  var big = h('.pdt-fpsnum', String(score) + '/100');
  big.style.fontSize = '1.7em';
  big.style.color = score >= 85 ? 'var(--ok)' : score >= 60 ? 'var(--warn)' : 'var(--err)';
  head.appendChild(h('.pdt-row', [big, h('span.pdt-grow', [
    h('div', errCount + ' error(s) · ' + warnCount + ' warning(s)'),
    h('div', { style: { fontSize: '.82em', color: 'var(--muted)' } }, 'Quick heuristic audit — not a full WCAG check')
  ])]));
  wrap.appendChild(head);

  if (!issues.length) {
    wrap.appendChild(h('.pdt-card', h('.pdt-mtext', { style: { fontSize: '.85em' } },
      'No common issues found. Language, title, labels, alt text, and accessible names all check out.')));
    return wrap;
  }

  issues.forEach(function (iss) {
    var c = h('.pdt-card');
    c.appendChild(h('.pdt-row', [
      iconEl(iss.sev === 'err' ? 'xc' : 'alert', 16),
      h('span.pdt-grow', iss.msg)
    ]));
    (iss.els || []).slice(0, 12).forEach(function (el) {
      var tag = el === document.documentElement ? 'html' :
        el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');
      var row = h('button.pdt-chip', { type: 'button', style: { marginTop: '6px' } }, '\u2192 ' + truncate(tag, 24));
      row.addEventListener('click', function () { flashEl(el); });
      c.appendChild(row);
    });
    wrap.appendChild(c);
  });
  return wrap;
}

/* ---------------- tech detection ---------------- */
function buildPgTech() {
  var wrap = h('div');

  /* frameworks */
  var fw = [];
  function fwAdd(name, test) { try { var v = test(); if (v) fw.push([name, v]); } catch (e) { /* noop */ } }
  fwAdd('jQuery', function () { return window.jQuery && window.jQuery.fn && window.jQuery.fn.jquery ? 'v' + window.jQuery.fn.jquery : null; });
  fwAdd('React', function () {
    var r = document.querySelector('[data-reactroot], [data-reactid]');
    return (window.React && window.React.version && 'v' + window.React.version) || (r ? 'detected' : null);
  });
  fwAdd('Vue', function () { return window.Vue && window.Vue.version ? 'v' + window.Vue.version : null; });
  fwAdd('Angular', function () {
    return (window.ng && window.ng.version && 'v' + window.ng.version.full) ||
      (document.querySelector('[ng-version]') && document.querySelector('[ng-version]').getAttribute('ng-version')) || null;
  });
  fwAdd('Svelte', function () { return document.querySelector('[class*="svelte-"]') ? 'detected' : null; });
  fwAdd('Next.js', function () { return document.getElementById('__NEXT_DATA__') ? 'detected' : null; });
  fwAdd('Nuxt', function () { return window.__NUXT__ || document.getElementById('__nuxt') ? 'detected' : null; });
  fwAdd('WordPress', function () { return document.querySelector('meta[name="generator"][content*="WordPress"]') ? 'detected' : null; });
  fwAdd('Bootstrap', function () {
    return document.querySelector('link[href*="bootstrap"]') ? 'detected' : null;
  });
  fwAdd('Google Analytics', function () { return window.ga || window.gtag || window.dataLayer ? 'detected' : null; });
  fwAdd('Google Tag Manager', function () { return document.querySelector('script[src*="googletagmanager.com"]') ? 'detected' : null; });
  fwAdd('Cloudflare Beacon', function () { return document.querySelector('script[src*="cloudflareinsights.com"]') ? 'detected' : null; });

  var fwCard = h('.pdt-card');
  fwCard.appendChild(h('.pdt-label', 'Detected libraries & services'));
  if (fw.length) fw.forEach(function (f) { fwCard.appendChild(kv(f[0], f[1])); });
  else fwCard.appendChild(h('.pdt-mtext', { style: { fontSize: '.85em' } }, 'No common libraries detected.'));
  wrap.appendChild(fwCard);

  /* scripts */
  var scripts = [], inlineScripts = 0, asyncS = 0, deferS = 0;
  try {
    scripts = Array.prototype.slice.call(document.querySelectorAll('script[src]')).map(function (s) { return s.src; });
    inlineScripts = Array.prototype.filter.call(document.querySelectorAll('script:not([src])'), function (s) {
      return (s.textContent || '').trim().length > 0;
    }).length;
    asyncS = document.querySelectorAll('script[src][async]').length;
    deferS = document.querySelectorAll('script[src][defer]').length;
  } catch (e) { /* noop */ }
  wrap.appendChild(h('.pdt-card', [
    kv('External scripts', String(scripts.length) + ' (' + asyncS + ' async, ' + deferS + ' defer)'),
    kv('Inline scripts', String(inlineScripts))
  ]));
  if (scripts.length) {
    var sc2 = h('.pdt-card');
    sc2.appendChild(h('.pdt-label', 'Script URLs (tap to copy)'));
    scripts.slice(0, 60).forEach(function (src) {
      var row = h('.pdt-hrow', [h('span.pdt-grow.pdt-mono', { style: { fontSize: '.8em' } }, clipUrl(src))]);
      row.addEventListener('click', function () { copyText(src, true); toast('Copied script URL'); });
      sc2.appendChild(row);
    });
    wrap.appendChild(sc2);
  }

  /* stylesheets */
  var sheets = [];
  try {
    sheets = Array.prototype.slice.call(document.querySelectorAll('link[rel="stylesheet"]')).map(function (l) { return l.href; });
  } catch (e) { /* noop */ }
  var inlineStyles = document.querySelectorAll('style').length;
  wrap.appendChild(h('.pdt-card', [
    kv('Stylesheets', String(sheets.length) + ' external, ' + inlineStyles + ' inline')
  ]));
  if (sheets.length) {
    var sh = h('.pdt-card');
    sh.appendChild(h('.pdt-label', 'Stylesheet URLs'));
    sheets.slice(0, 40).forEach(function (href) {
      sh.appendChild(h('.pdt-hrow', [h('span.pdt-grow.pdt-mono', { style: { fontSize: '.8em' } }, clipUrl(href))]));
    });
    wrap.appendChild(sh);
  }

  /* storage usage */
  var stCard = h('.pdt-card');
  stCard.appendChild(h('.pdt-label', 'Storage estimate'));
  stCard.appendChild(h('.pdt-mtext', { style: { fontSize: '.85em' } }, 'Checking\u2026'));
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(function (est) {
      stCard.textContent = '';
      stCard.appendChild(h('.pdt-label', 'Storage estimate'));
      stCard.appendChild(kv('Used', fmtBytes(est.usage || 0)));
      stCard.appendChild(kv('Quota', fmtBytes(est.quota || 0)));
    }, function () { stCard.textContent = ''; stCard.appendChild(h('.pdt-label', 'Storage estimate: unavailable')); });
  } else {
    stCard.textContent = '';
    stCard.appendChild(h('.pdt-label', 'Storage estimate: not supported'));
  }
  wrap.appendChild(stCard);
  return wrap;
}

registerPanel({
  id: 'page', label: 'Page', icon: 'file',
  render: function (panel) { panelEls.page = panel; renderPagePanel(); },
  onShow: renderPagePanel
});


/* ===== 11-sources.js ===== */
/*
 * 09-sources.js — page HTML / CSS / JS viewers with line numbers, copy, download
 */

var srcSub = 'html';

function codeBlock(code, lang) {
  code = String(code == null ? '' : code);
  if (code.length > 300000) code = code.slice(0, 300000) + '\n… [truncated at 300 KB]';
  var lines = code.split('\n');
  var nums = [];
  for (var i = 1; i <= lines.length; i++) nums.push(i);
  var gutter = h('div.pdt-gutter');
  gutter.textContent = nums.join('\n');
  var pre = h('div.pdt-codepre');
  pre.innerHTML = highlight(code, lang);
  return h('.pdt-viewer', [gutter, pre]);
}

/* Single-pass token highlighter. escapeHtml() only escapes & < >, so quotes stay raw. */
function highlight(code, lang) {
  var s = escapeHtml(code);
  var re, fn;
  if (lang === 'js') {
    re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`[^`]*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\b(var|let|const|function|return|if|else|for|while|do|switch|case|break|continue|new|typeof|instanceof|try|catch|finally|throw|class|extends|super|this|null|undefined|true|false|async|await|yield|delete|void)\b|\b(\d+\.?\d*)\b/g;
    fn = function (m, com, str, kw, num) {
      if (com) return '<span class="tk-com">' + com + '</span>';
      if (str) return '<span class="tk-str">' + str + '</span>';
      if (kw) return '<span class="tk-kw">' + kw + '</span>';
      if (num) return '<span class="tk-num">' + num + '</span>';
      return m;
    };
  } else if (lang === 'css') {
    re = /(\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(#[0-9a-fA-F]{3,8}\b|\b\d+\.?\d*(?:px|em|rem|%|vh|vw|s|ms|fr|ch|deg)?\b)|([\w-]+)(?=\s*:)/g;
    fn = function (m, com, str, num, prop) {
      if (com) return '<span class="tk-com">' + com + '</span>';
      if (str) return '<span class="tk-str">' + str + '</span>';
      if (num) return '<span class="tk-num">' + num + '</span>';
      if (prop) return '<span class="tk-attr">' + prop + '</span>';
      return m;
    };
  } else if (lang === 'html') {
    re = /(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?[a-zA-Z][\w-]*|\/?&gt;)|([a-zA-Z-]+)=("[^"]*")/g;
    fn = function (m, com, tag, attr, val) {
      if (com) return '<span class="tk-com">' + com + '</span>';
      if (tag) return '<span class="tk-tag">' + tag + '</span>';
      if (attr) return '<span class="tk-attr">' + attr + '</span>=<span class="tk-str">' + val + '</span>';
      return m;
    };
  } else {
    return s;
  }
  try { return s.replace(re, fn); } catch (e) { return s; }
}

function fileViewer(name, content, lang, mime) {
  var panel = panelEls.sources;
  panel.textContent = '';
  panel.appendChild(h('.pdt-toolbar', [
    h('button.pdt-ib', { type: 'button', onclick: function () { renderSourcesPanel(); } }, iconEl('back')),
    h('span.pdt-ver', { style: { marginRight: 'auto' } }, truncate(name, 40)),
    h('button.pdt-ib', { type: 'button', title: 'Copy', onclick: function () { copyText(content); } }, iconEl('copy')),
    h('button.pdt-ib', { type: 'button', title: 'Download', onclick: function () { downloadFile(name, content, mime); } }, iconEl('download'))
  ]));
  panel.appendChild(codeBlock(content, lang));
}

function renderSourcesPanel() {
  if (!panelEls.sources) return;
  var panel = panelEls.sources;
  panel.textContent = '';

  var subs = [['html', 'HTML'], ['css', 'CSS'], ['js', 'JS']];
  var subBar = h('.pdt-sub');
  subs.forEach(function (s) {
    var b = h('button.pdt-subb' + (srcSub === s[0] ? '.on' : ''), s[1]);
    b.addEventListener('click', function () { srcSub = s[0]; renderSourcesPanel(); });
    subBar.appendChild(b);
  });
  panel.appendChild(subBar);
  var list = h('.pdt-scroll');
  panel.appendChild(list);

  if (srcSub === 'html') {
    var htmlSize = document.documentElement.outerHTML.length;
    list.appendChild(h('.pdt-card', [
      kv('Document', truncate(document.title || '(untitled)', 50)),
      kv('Doctype', document.doctype ? document.doctype.name : '—'),
      kv('Size', fmtBytes(htmlSize)),
      h('.pdt-row', { style: { marginTop: '8px', flexWrap: 'wrap' } }, [
        h('button.pdt-btn.acc', { type: 'button', onclick: function () {
          fileViewer('page.html', document.documentElement.outerHTML, 'html', 'text/html');
        } }, [iconEl('eye', 14), 'View HTML']),
        h('button.pdt-btn', { type: 'button', onclick: function () { copyText(document.documentElement.outerHTML); } }, [iconEl('copy', 14), 'Copy']),
        h('button.pdt-btn', { type: 'button', onclick: function () { downloadFile('page.html', document.documentElement.outerHTML, 'text/html'); } }, [iconEl('download', 14), 'Save'])
      ])
    ]));
  } else if (srcSub === 'css') {
    var sheets = [];
    try { sheets = Array.prototype.slice.call(document.styleSheets); } catch (e) { /* noop */ }
    if (!sheets.length) list.appendChild(h('.pdt-empty', 'No stylesheets found'));
    sheets.forEach(function (ss, i) {
      var count = null;
      try { count = ss.cssRules ? ss.cssRules.length : null; } catch (e) { count = null; }
      var name = ss.href ? (ss.href.split('/').pop().split('?')[0] || 'stylesheet.css') : 'inline-' + (i + 1) + '.css';
      list.appendChild(h('.pdt-card', [
        kv('File', truncate(name, 40)),
        kv('Source', ss.href ? clipUrl(ss.href) : 'inline <style>'),
        count != null ? kv('Rules', String(count)) : kv('Rules', 'blocked (CORS)'),
        h('.pdt-row', { style: { marginTop: '8px', flexWrap: 'wrap' } }, [
          h('button.pdt-btn', { type: 'button', onclick: function () { viewSheet(ss, name); } }, [iconEl('eye', 14), 'View']),
          h('button.pdt-btn', { type: 'button', onclick: function () {
            viewSheet(ss, name, true);
          } }, [iconEl('copy', 14), 'Copy'])
        ])
      ]));
    });
  } else {
    var scripts = Array.prototype.slice.call(document.querySelectorAll('script'));
    var shown = [];
    scripts.forEach(function (s, i) {
      if ((s.src && /Bookmarklet-Dev-Tools|pdt/i.test(s.src)) || s.id === 'pdt-page-css') return;
      shown.push({ el: s, name: s.src ? (s.src.split('/').pop().split('?')[0] || 'script.js') : 'inline-' + (i + 1) + '.js' });
    });
    if (!shown.length) list.appendChild(h('.pdt-empty', 'No scripts found'));
    shown.forEach(function (s) {
      list.appendChild(h('.pdt-card', [
        kv('File', truncate(s.name, 40)),
        kv('Source', s.el.src ? clipUrl(s.el.src) : 'inline <script>'),
        kv('Size', s.el.src ? '—' : fmtBytes(s.el.textContent.length)),
        h('.pdt-row', { style: { marginTop: '8px' } }, [
          h('button.pdt-btn', { type: 'button', onclick: function () {
            if (s.el.src) {
              fetch(s.el.src).then(function (r) { return r.text(); }).then(function (t) {
                fileViewer(s.name, t, 'js', 'text/javascript');
              }, function () { toast('Fetch failed (CORS?)'); });
            } else {
              fileViewer(s.name, s.el.textContent, 'js', 'text/javascript');
            }
          } }, [iconEl('eye', 14), 'View'])
        ])
      ]));
    });
  }
}

function viewSheet(ss, name, onlyCopy) {
  function useText(t) { if (onlyCopy) copyText(t); else fileViewer(name, t, 'css', 'text/css'); }
  if (ss.href) {
    fetch(ss.href).then(function (r) { return r.text(); }).then(useText, function () { toast('Fetch failed (CORS?)'); });
  } else {
    var txt = '';
    try { Array.prototype.forEach.call(ss.cssRules, function (r) { txt += r.cssText + '\n\n'; }); } catch (e) { /* noop */ }
    useText(txt || '/* empty */');
  }
}

registerPanel({
  id: 'sources', label: 'Sources', icon: 'sources',
  render: function (panel) { panelEls.sources = panel; renderSourcesPanel(); }
});


/* ===== 12-storage.js ===== */
/*
 * 10-storage.js — cookies / localStorage / sessionStorage viewer + EDITOR
 *                (add, edit, delete, clear — the original was view-only)
 */

var stgSub = 'cookies';

function cookieMap() {
  var out = [];
  try {
    document.cookie.split(';').forEach(function (c) {
      if (!c.trim()) return;
      var i = c.indexOf('=');
      var name = i < 0 ? c.trim() : c.slice(0, i).trim();
      var val = i < 0 ? '' : c.slice(i + 1).trim();
      out.push({ name: name, value: decodeURIComponent(val) });
    });
  } catch (e) { /* noop */ }
  return out;
}
function setCookieRaw(name, value, days, path) {
  var s = name + '=' + encodeURIComponent(value) + '; path=' + (path || '/');
  if (days != null) s += '; expires=' + new Date(Date.now() + days * 864e5).toUTCString();
  try { document.cookie = s; } catch (e) { /* noop */ }
}
function delCookieRaw(name) {
  /* try the common paths to maximize delete success */
  ['/', ''].forEach(function (p) {
    try { document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + p; } catch (e) { /* noop */ }
  });
}

function storageObj() {
  return stgSub === 'local' ? window.localStorage : window.sessionStorage;
}

function renderStoragePanel() {
  if (!panelEls.storage) return;
  var panel = panelEls.storage;
  panel.textContent = '';

  var subs = [['cookies', 'Cookies'], ['local', 'Local'], ['session', 'Session']];
  var subBar = h('.pdt-sub');
  subs.forEach(function (s) {
    var b = h('button.pdt-subb' + (stgSub === s[0] ? '.on' : ''), s[1]);
    b.addEventListener('click', function () { stgSub = s[0]; renderStoragePanel(); });
    subBar.appendChild(b);
  });

  var addBtn = h('button.pdt-btn.acc', { type: 'button', onclick: function () { editEntry(null); } }, [iconEl('plus', 14), 'Add']);
  var copyBtn = h('button.pdt-btn', { type: 'button', onclick: copyAll }, [iconEl('copy', 14), 'Copy all']);
  var clearBtn = h('button.pdt-btn.danger', { type: 'button', onclick: function () {
    confirmModal(stgSub === 'cookies' ? 'Delete ALL cookies?' : 'Delete ALL ' + (stgSub === 'local' ? 'localStorage' : 'sessionStorage') + ' data?', 'Delete all', function () {
      if (stgSub === 'cookies') {
        cookieMap().forEach(function (c) { delCookieRaw(c.name); });
      } else {
        try { storageObj().clear(); } catch (e) { toast('Storage not accessible'); }
      }
      renderStoragePanel();
      toast('Cleared');
    }, true);
  } }, [iconEl('trash', 14), 'Clear']);

  panel.appendChild(h('.pdt-toolbar', [addBtn, copyBtn, h('span.pdt-grow'), clearBtn]));
  panel.appendChild(subBar);

  var list = h('.pdt-scroll');
  panel.appendChild(list);

  if (stgSub === 'cookies') {
    var cookies = cookieMap();
    if (!cookies.length) {
      list.appendChild(h('.pdt-empty', 'No cookies visible.\nHttpOnly cookies are not accessible to JavaScript.'));
      return;
    }
    var tb = h('table.pdt-table');
    var tbh = h('thead');
    tbh.appendChild(h('tr', [h('th', 'Name'), h('th', 'Value'), h('th', '')]));
    tb.appendChild(tbh);
    var tbod = h('tbody');
    cookies.forEach(function (c) {
      tbod.appendChild(h('tr', [
        h('td.pdt-mono', c.name),
        h('td.pdt-mono', truncate(c.value, 80)),
        h('td', { style: { whiteSpace: 'nowrap' } }, [
          h('button.pdt-ib', { type: 'button', onclick: function () { editEntry(c); } }, iconEl('edit', 13)),
          h('button.pdt-ib', { type: 'button', onclick: function () {
            delCookieRaw(c.name); renderStoragePanel(); toast('Cookie deleted');
          } }, iconEl('trash', 13))
        ])
      ]));
    });
    tb.appendChild(tbod);
    list.appendChild(tb);
    list.appendChild(h('.pdt-label', cookies.length + ' cookie(s) · ' + fmtBytes(document.cookie.length) + ' total'));
  } else {
    var store = null;
    try { store = storageObj(); store.length; } catch (e) { store = null; }
    if (!store) {
      list.appendChild(h('.pdt-empty', 'Storage not accessible in this context.'));
      return;
    }
    var keys = [];
    for (var i = 0; i < store.length; i++) keys.push(store.key(i));
    if (!keys.length) {
      list.appendChild(h('.pdt-empty', (stgSub === 'local' ? 'localStorage' : 'sessionStorage') + ' is empty.'));
      return;
    }
    var tb2 = h('table.pdt-table');
    var tb2h = h('thead');
    tb2h.appendChild(h('tr', [h('th', 'Key'), h('th', 'Value'), h('th', '')]));
    tb2.appendChild(tb2h);
    var tb2b = h('tbody');
    keys.forEach(function (k) {
      var v = '';
      try { v = store.getItem(k) || ''; } catch (e) { /* noop */ }
      tb2b.appendChild(h('tr', [
        h('td.pdt-mono', k),
        h('td.pdt-mono', truncate(v, 80)),
        h('td', { style: { whiteSpace: 'nowrap' } }, [
          h('button.pdt-ib', { type: 'button', onclick: function () { editEntry({ name: k, value: v }); } }, iconEl('edit', 13)),
          h('button.pdt-ib', { type: 'button', onclick: function () {
            try { store.removeItem(k); } catch (e) { /* noop */ }
            renderStoragePanel(); toast('Removed');
          } }, iconEl('trash', 13))
        ])
      ]));
    });
    tb2.appendChild(tb2b);
    list.appendChild(tb2);
    var total = keys.reduce(function (a, k) { try { return a + (k + (store.getItem(k) || '')).length * 2; } catch (e) { return a; } }, 0);
    list.appendChild(h('.pdt-label', keys.length + ' item(s) · ~' + fmtBytes(total)));
  }
}

function editEntry(existing) {
  var isCookie = stgSub === 'cookies';
  var nameEl = h('input.pdt-input', { placeholder: 'name', autocapitalize: 'off', spellcheck: 'false' });
  var valEl = h('textarea.pdt-area', { rows: 5, placeholder: 'value' });
  if (existing) { nameEl.value = existing.name; valEl.value = existing.value; }
  var daysEl = null;

  modal((existing ? 'Edit ' : 'Add ') + (isCookie ? 'cookie' : (stgSub === 'local' ? 'localStorage item' : 'sessionStorage item')), function (body, close) {
    body.appendChild(h('.pdt-label', 'Name'));
    body.appendChild(nameEl);
    body.appendChild(h('.pdt-label', 'Value'));
    body.appendChild(valEl);
    if (isCookie) {
      daysEl = h('input.pdt-input', { type: 'number', value: '30', min: '0' });
      body.appendChild(h('.pdt-label', 'Expires (days, empty = session cookie)'));
      body.appendChild(daysEl);
      body.appendChild(h('p.pdt-mtext', { style: { marginTop: '8px', fontSize: '.85em' } },
        'Note: HttpOnly / Secure / SameSite flags cannot be set from JavaScript.'));
    }
    body.appendChild(h('.pdt-mfoot', [
      h('button.pdt-btn', { type: 'button', onclick: close }, 'Cancel'),
      h('button.pdt-btn.acc', { type: 'button', onclick: function () {
        var name = nameEl.value.trim();
        if (!name) { toast('Name is required'); return; }
        if (isCookie) {
          var days = daysEl.value === '' ? null : parseInt(daysEl.value, 10);
          setCookieRaw(name, valEl.value, isNaN(days) ? 30 : days);
        } else {
          try { storageObj().setItem(name, valEl.value); } catch (e) { toast('Save failed: ' + (e.message || e)); return; }
        }
        close(); renderStoragePanel(); toast('Saved');
      } }, 'Save')
    ]));
    setTimeout(function () { nameEl.focus(); }, 50);
  });
}

function copyAll() {
  var text = '';
  if (stgSub === 'cookies') {
    text = document.cookie;
  } else {
    var obj = {};
    var store = storageObj();
    for (var i = 0; i < store.length; i++) { try { obj[store.key(i)] = store.getItem(store.key(i)); } catch (e) { /* noop */ } }
    text = JSON.stringify(obj, null, 2);
  }
  copyText(text || '(empty)');
}

registerPanel({
  id: 'storage', label: 'Storage', icon: 'storage',
  render: function (panel) { panelEls.storage = panel; renderStoragePanel(); },
  onShow: renderStoragePanel
});


/* ===== 13-perf.js ===== */
/*
 * 11-perf.js — navigation timing, resource waterfall, FPS meter, memory info
 */

var fpsRunning = false, fpsFrames = [], fpsLast = 0, fpsRafId = 0;
var fpsNumEl = null, fpsCanvasEl = null;

function renderPerfPanel() {
  if (!panelEls.perf) return;
  var panel = panelEls.perf;
  panel.textContent = '';

  var subs = [['nav', 'Timing'], ['res', 'Resources'], ['fps', 'FPS'], ['tasks', 'Tasks'], ['mem', 'Memory']];
  var subBar = h('.pdt-sub');
  subs.forEach(function (s) {
    var b = h('button.pdt-subb' + (perfSub === s[0] ? '.on' : ''), s[1]);
    b.addEventListener('click', function () { perfSub = s[0]; renderPerfPanel(); });
    subBar.appendChild(b);
  });
  panel.appendChild(subBar);
  var sc = h('.pdt-scroll');
  panel.appendChild(sc);

  if (perfSub === 'nav') sc.appendChild(buildNavTiming());
  else if (perfSub === 'res') sc.appendChild(buildResources());
  else if (perfSub === 'fps') sc.appendChild(buildFps());
  else if (perfSub === 'tasks') sc.appendChild(buildLongTasks());
  else sc.appendChild(buildMemory());
}

var perfSub = 'nav';

/* ---------------- navigation timing ---------------- */
function buildNavTiming() {
  var wrap = h('div');
  var phases = [];
  var t0 = null;

  var nav = null;
  try { nav = performance.getEntriesByType('navigation')[0]; } catch (e) { /* noop */ }

  if (nav) {
    t0 = nav.startTime;
    function ph(name, a, b, color) {
      if (a == null || b == null || b < a || b - a <= 0) return;
      phases.push({ name: name, start: a - t0, dur: b - a, color: color });
    }
    ph('Redirect', nav.redirectStart, nav.redirectEnd, 'var(--muted)');
    ph('DNS lookup', nav.domainLookupStart, nav.domainLookupEnd, 'var(--warn)');
    ph('TCP connect', nav.connectStart, nav.secureConnectionStart || nav.connectEnd, 'var(--err)');
    ph('TLS handshake', nav.secureConnectionStart, nav.connectEnd, 'var(--err)');
    ph('Request (waiting)', nav.requestStart, nav.responseStart, 'var(--accent)');
    ph('Response (download)', nav.responseStart, nav.responseEnd, 'var(--ok)');
    ph('DOM processing', nav.responseEnd, nav.domContentLoadedEventEnd, 'var(--accent)');
    ph('Load event', nav.loadEventStart, nav.loadEventEnd, 'var(--muted)');
  } else if (performance.timing) {
    var T = performance.timing;
    t0 = T.navigationStart;
    function ph2(name, a, b, color) {
      if (!a || !b || b < a || b - a <= 0) return;
      phases.push({ name: name, start: a - t0, dur: b - a, color: color });
    }
    ph2('Unload', T.unloadEventStart, T.unloadEventEnd, 'var(--muted)');
    ph2('Redirect', T.redirectStart, T.redirectEnd, 'var(--muted)');
    ph2('DNS lookup', T.domainLookupStart, T.domainLookupEnd, 'var(--warn)');
    ph2('TCP connect', T.connectStart, T.secureConnectionStart || T.connectEnd, 'var(--err)');
    ph2('TLS handshake', T.secureConnectionStart, T.connectEnd, 'var(--err)');
    ph2('Request (waiting)', T.requestStart, T.responseStart, 'var(--accent)');
    ph2('Response (download)', T.responseStart, T.responseEnd, 'var(--ok)');
    ph2('DOM processing', T.responseEnd, T.domContentLoadedEventEnd, 'var(--accent)');
    ph2('Load event', T.loadEventStart, T.loadEventEnd, 'var(--muted)');
  }

  if (!phases.length) return h('.pdt-empty', 'No navigation timing data available.');

  var total = 0;
  phases.forEach(function (p) { total = Math.max(total, p.start + p.dur); });
  if (!total) total = 1;

  var wrap2 = h('.pdt-card');
  phases.forEach(function (p) {
    var bar = h('i');
    bar.style.left = (p.start / total * 100) + '%';
    bar.style.width = Math.max(0.8, p.dur / total * 100) + '%';
    bar.style.background = p.color;
    wrap2.appendChild(h('.pdt-wfb', [bar, h('span', p.name + ' · ' + fmtMs(p.dur))]));
  });
  wrap2.appendChild(h('.pdt-label', 'Total: ' + fmtMs(total) + ' from navigation start'));

  wrap.appendChild(wrap2);
  wrap.appendChild(h('.pdt-card', [
    kv('Page', truncate(location.host + location.pathname, 40)),
    kv('Type', nav ? (nav.type || 'navigate') : '—'),
    kv('DOM content loaded', nav ? fmtMs(nav.domContentLoadedEventEnd - nav.startTime) : '—'),
    kv('Load complete', nav ? fmtMs(nav.loadEventEnd - nav.startTime) : '—'),
    kv('Transfer size', nav ? fmtBytes(nav.transferSize) : '—'),
    kv('Protocol', nav ? (nav.nextHopProtocol || '—') : '—')
  ]));

  /* paint timings */
  var paints = [];
  try { paints = performance.getEntriesByType('paint'); } catch (e) { /* noop */ }
  if (paints.length) {
    var pc = h('.pdt-card');
    pc.appendChild(h('.pdt-label', 'Paint timings'));
    paints.forEach(function (p) {
      var nice = p.name === 'first-paint' ? 'First paint' :
        p.name === 'first-contentful-paint' ? 'First contentful paint' : p.name;
      pc.appendChild(kv(nice, fmtMs(p.startTime)));
    });
    wrap.appendChild(pc);
  }
  return wrap;
}

/* ---------------- resources ---------------- */
function buildResources() {
  var wrap = h('div');
  var entries = [];
  try { entries = performance.getEntriesByType('resource').slice(0); } catch (e) { /* noop */ }
  if (!entries.length) return h('.pdt-empty', 'No resource timing entries.');

  var search = h('input.pdt-input', { type: 'search', placeholder: 'Filter resources' });
  var list = h('div');
  function draw() {
    list.textContent = '';
    var q = search.value.toLowerCase();
    var shown = entries.filter(function (e) { return !q || e.name.toLowerCase().indexOf(q) >= 0; });
    shown.sort(function (a, b) { return b.duration - a.duration; });
    shown = shown.slice(0, 120);
    var maxDur = 1;
    shown.forEach(function (e) { maxDur = Math.max(maxDur, e.duration); });
    shown.forEach(function (e) {
      var size = e.transferSize || e.encodedBodySize || null;
      var w = Math.max(1.5, (e.duration / maxDur) * 100);
      list.appendChild(h('.pdt-card', [
        h('.pdt-row', [
          h('span.pdt-grow.pdt-mono', { style: { fontSize: '.85em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, clipUrl(e.name)),
          h('span.m', { style: { color: 'var(--muted)', fontSize: '.8em', flex: 'none' } }, fmtMs(e.duration) + ' · ' + (size != null ? fmtBytes(size) : '—'))
        ]),
        h('.pdt-wfb', [h('i', { style: { width: w + '%' } })]),
        h('.pdt-label', { style: { margin: '2px 0 0' } }, e.initiatorType || 'other')
      ]));
    });
    if (!shown.length) list.appendChild(h('.pdt-empty', 'No matches'));
  }
  search.addEventListener('input', debounce(draw, 200));
  draw();
  wrap.appendChild(search);
  wrap.appendChild(h('div', { style: { height: '8px' } }));
  wrap.appendChild(list);
  return wrap;
}

/* ---------------- FPS meter ---------------- */
function buildFps() {
  var wrap = h('.pdt-card');
  fpsNumEl = h('div.pdt-fpsnum', '—');
  fpsCanvasEl = h('canvas', { width: 280, height: 70 });
  var startBtn = h('button.pdt-btn.acc', { type: 'button' }, [iconEl(fpsRunning ? 'pause' : 'play', 14), fpsRunning ? 'Stop' : 'Start']);

  startBtn.addEventListener('click', function () {
    if (fpsRunning) { stopFps(); } else { startFps(); }
    renderPerfPanel();
  });

  wrap.appendChild(h('.pdt-fps', [fpsNumEl, fpsCanvasEl]));
  wrap.appendChild(h('div', { style: { height: '10px' } }));
  wrap.appendChild(startBtn);
  wrap.appendChild(h('.pdt-label', 'Target: 60 fps. Below 30 indicates jank.'));
  return wrap;
}
function startFps() {
  if (fpsRunning) return;
  fpsRunning = true; fpsFrames = []; fpsLast = 0;
  function loop(t) {
    if (!fpsRunning) return;
    if (fpsLast) {
      fpsFrames.push(t - fpsLast);
      if (fpsFrames.length > 90) fpsFrames.shift();
      drawFps();
    }
    fpsLast = t;
    fpsRafId = requestAnimationFrame(loop);
  }
  fpsRafId = requestAnimationFrame(loop);
}
function stopFps() {
  fpsRunning = false;
  if (fpsRafId) cancelAnimationFrame(fpsRafId);
}
function drawFps() {
  if (!fpsNumEl || !fpsCanvasEl || !fpsFrames.length) return;
  var recent = fpsFrames.slice(-30);
  var avg = recent.reduce(function (a, b) { return a + b; }, 0) / recent.length;
  var fps = Math.round(1000 / Math.max(0.1, avg));
  fpsNumEl.textContent = fps + ' fps';
  fpsNumEl.style.color = fps >= 50 ? 'var(--ok)' : fps >= 30 ? 'var(--warn)' : 'var(--err)';
  try {
    var ctx2 = fpsCanvasEl.getContext('2d');
    var W = fpsCanvasEl.width, Hh = fpsCanvasEl.height;
    ctx2.clearRect(0, 0, W, Hh);
    var cs = getComputedStyle(app);
    var accent = (cs.getPropertyValue('--accent') || '#5b9dff').trim();
    var bars = fpsFrames.slice(-56);
    var bw = W / 56;
    bars.forEach(function (dt, i) {
      var f = Math.min(120, 1000 / Math.max(0.1, dt));
      var hh = (f / 120) * Hh;
      ctx2.fillStyle = f >= 50 ? accent : f >= 30 ? '#e0a63f' : '#e0564f';
      ctx2.fillRect(i * bw, Hh - hh, Math.max(1, bw - 1.5), hh);
    });
    ctx2.fillStyle = 'rgba(128,128,128,.5)';
    ctx2.fillRect(0, Hh - (60 / 120) * Hh, W, 1);
  } catch (e) { /* canvas unavailable */ }
}

/* ---------------- long tasks ---------------- */
var longTasks = [], longTaskObs = null;
function ensureLongTaskObserver() {
  if (longTaskObs) return true;
  try {
    longTaskObs = new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (e) {
        longTasks.push({ start: e.startTime, dur: e.duration, name: e.name || 'task' });
        if (longTasks.length > 200) longTasks.shift();
      });
      if (perfSub === 'tasks' && panelEls.perf) renderPerfPanel();
    });
    longTaskObs.observe({ entryTypes: ['longtask'] });
    return true;
  } catch (e) {
    longTaskObs = false; /* unsupported (Firefox) */
    return false;
  }
}
function buildLongTasks() {
  ensureLongTaskObserver();
  var wrap = h('div');
  if (longTaskObs === false) {
    wrap.appendChild(h('.pdt-empty', 'Long task timing is not supported in this browser.\n(Firefox does not expose the PerformanceObserver "longtask" entry type — Chrome and Edge do.)'));
    return wrap;
  }
  var head = h('.pdt-card', [
    kv('Long tasks (> 50 ms)', String(longTasks.length)),
    kv('Total blocked time', fmtMs(longTasks.reduce(function (a, t) { return a + t.dur - 50; }, 0)))
  ]);
  wrap.appendChild(head);
  wrap.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em', color: 'var(--muted)' } },
    'A long task is a block of JavaScript that occupied the main thread for more than 50 ms — ' +
    'the reason behind taps and scrolls that feel laggy. Tasks are recorded while DevTools is open.'));
  if (!longTasks.length) {
    wrap.appendChild(h('.pdt-empty', 'No long tasks recorded yet.\nScroll and interact with the page, tasks will appear here live.'));
    return wrap;
  }
  var maxDur = Math.max.apply(null, longTasks.map(function (t) { return t.dur; }));
  var list = h('.pdt-card');
  longTasks.slice(-60).reverse().forEach(function (t) {
    list.appendChild(h('.pdt-wfb', [
      h('i', { style: { width: Math.max(2, (t.dur / maxDur) * 100) + '%', background: t.dur > 200 ? 'var(--err)' : 'var(--warn)' } }),
      h('span', fmtMs(t.dur) + ' @ ' + fmtMs(t.start))
    ]));
  });
  wrap.appendChild(list);
  return wrap;
}

/* ---------------- memory ---------------- */
function buildMemory() {
  var wrap = h('div');
  var mem = performance.memory;
  if (mem && mem.usedJSHeapSize) {
    var total = mem.jsHeapSizeLimit;
    var used = mem.usedJSHeapSize;
    var allocated = mem.totalJSHeapSize;
    function bar(pct, color) {
      return h('.pdt-wfb', [h('i', { style: { width: Math.min(100, pct) + '%', background: color } }), h('span', Math.round(pct) + '%')]);
    }
    wrap.appendChild(h('.pdt-card', [
      kv('Used JS heap', fmtBytes(used)),
      kv('Allocated', fmtBytes(allocated)),
      kv('Heap limit', fmtBytes(total)),
      h('.pdt-label', 'Used / limit'),
      bar((used / total) * 100, 'var(--accent)')
    ]));
    wrap.appendChild(h('.pdt-mtext', { style: { color: 'var(--muted)', fontSize: '.85em' } },
      'Note: precise memory data is Chrome-only. Firefox does not expose performance.memory.'));
  } else {
    wrap.appendChild(h('.pdt-card', [
      kv('performance.memory', 'not available'),
      kv('navigator.deviceMemory', (navigator.deviceMemory != null ? navigator.deviceMemory + ' GB' : 'not available')),
      kv('hardwareConcurrency', navigator.hardwareConcurrency || '—')
    ]));
    wrap.appendChild(h('.pdt-mtext', { style: { color: 'var(--muted)', fontSize: '.85em' } },
      'Firefox (including Android) does not expose JS heap sizes to web pages for privacy reasons. ' +
      'The FPS meter and resource timings above still work everywhere.'));
  }
  wrap.appendChild(h('.pdt-card', [
    h('button.pdt-btn', { type: 'button', onclick: function () {
      var paint = null;
      try { paint = performance.getEntriesByType('paint').map(function (p) { return p.name + ': ' + fmtMs(p.startTime); }); } catch (e) { /* noop */ }
      if (paint && paint.length) toast(paint.join(' · ')); else toast('No paint timing data');
    } }, [iconEl('clock', 14), 'Show paint timings']),
    h('div', { style: { height: '8px' } }),
    h('button.pdt-btn', { type: 'button', onclick: function () {
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(function (est) {
          toast('Storage used: ' + fmtBytes(est.usage || 0) + ' of ' + fmtBytes(est.quota || 0));
        }, function () { toast('Storage estimate unavailable'); });
      } else toast('Storage estimate not supported');
    } }, [iconEl('storage', 14), 'Show storage usage'])
  ]));
  return wrap;
}

registerPanel({
  id: 'perf', label: 'Perf', icon: 'perf',
  render: function (panel) { panelEls.perf = panel; renderPerfPanel(); },
  onShow: renderPerfPanel
});


/* ===== 14-qr.js ===== */
/*
 * 14-qr.js — compact QR code encoder (ISO/IEC 18004), byte mode,
 *            versions 1-10, EC levels L and M, full mask selection.
 *            Renders to canvas; no external dependencies.
 *
 * Verified against the jsQR decoder in the automated test suite.
 */

/* ---- GF(256) arithmetic, primitive polynomial 0x11D ---- */
var QR_EXP = new Array(512), QR_LOG = new Array(256);
(function () {
  var x = 1;
  for (var i = 0; i < 255; i++) {
    QR_EXP[i] = x; QR_LOG[x] = i;
    x <<= 1; if (x & 0x100) x ^= 0x11D;
  }
  for (var j = 255; j < 512; j++) QR_EXP[j] = QR_EXP[j - 255];
})();
function qrGmul(a, b) { return (a && b) ? QR_EXP[QR_LOG[a] + QR_LOG[b]] : 0; }

/* ---- Reed-Solomon ---- */
function qrRsGenerator(ecLen) {
  /* coefficients, index 0 = highest degree; product of (x - a^i) */
  var g = [1];
  for (var i = 0; i < ecLen; i++) {
    var ng = new Array(g.length + 1);
    for (var t = 0; t < ng.length; t++) ng[t] = 0;
    for (var j = 0; j < g.length; j++) {
      ng[j] ^= g[j];
      ng[j + 1] ^= qrGmul(g[j], QR_EXP[i]);
    }
    g = ng;
  }
  return g;
}
function qrRsEncode(data, ecLen) {
  var gen = qrRsGenerator(ecLen);
  var rem = new Array(ecLen);
  for (var t = 0; t < ecLen; t++) rem[t] = 0;
  for (var i = 0; i < data.length; i++) {
    var factor = data[i] ^ rem[0];
    for (var s = 0; s < ecLen - 1; s++) rem[s] = rem[s + 1];
    rem[ecLen - 1] = 0;
    if (factor) for (var j = 0; j < ecLen; j++) rem[j] ^= qrGmul(gen[j + 1], factor);
  }
  return rem;
}

/* ---- block structure tables: [ecPerBlock, [[blocks, dataPerBlock], …]] ---- */
var QR_BLOCKS = {
  L: { 1: [7, [[1, 19]]], 2: [10, [[1, 34]]], 3: [15, [[1, 55]]], 4: [20, [[1, 80]]],
       5: [26, [[1, 108]]], 6: [18, [[2, 68]]], 7: [20, [[2, 78]]], 8: [24, [[2, 97]]],
       9: [30, [[2, 116]]], 10: [18, [[2, 68], [2, 69]]] },
  M: { 1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]],
       5: [24, [[2, 43]]], 6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]],
       9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]] }
};
var QR_ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
};
function qrDataCodewords(v, ec) {
  var spec = QR_BLOCKS[ec][v], n = 0;
  spec[1].forEach(function (b) { n += b[0] * b[1]; });
  return n;
}

/* ---- bit buffer ---- */
function qrBitBuf() { return { bits: [], len: 0 }; }
function qrPushBits(buf, val, n) {
  for (var i = n - 1; i >= 0; i--) {
    buf.bits.push((val >>> i) & 1);
    buf.len++;
  }
}

/* ---- format / version BCH codes ---- */
function qrBch15(data) {
  var v = data << 10;
  var deg = 14;
  while (deg >= 10) {
    if (v & (1 << deg)) v ^= 0x537 << (deg - 10);
    deg--;
  }
  return (data << 10) | v;
}
function qrBch18(data) {
  var v = data << 12;
  var deg = 17;
  while (deg >= 12) {
    if (v & (1 << deg)) v ^= 0x1F25 << (deg - 12);
    deg--;
  }
  return (data << 12) | v;
}

/* ---- matrix helpers ---- */
function qrNewMatrix(size) {
  var m = [], f = [];
  for (var r = 0; r < size; r++) {
    m.push(new Array(size).fill(0));
    f.push(new Array(size).fill(0));
  }
  return { m: m, f: f, size: size };
}
function qrSet(mat, r, c, dark) {
  if (r < 0 || c < 0 || r >= mat.size || c >= mat.size) return;
  mat.m[r][c] = dark ? 1 : 0;
  mat.f[r][c] = 1;
}

function qrDrawFunctionPatterns(mat, version) {
  var size = mat.size;
  /* finders + separators at three corners */
  [[0, 0], [0, size - 7], [size - 7, 0]].forEach(function (pos) {
    for (var dr = -1; dr <= 7; dr++) {
      for (var dc = -1; dc <= 7; dc++) {
        var r = pos[0] + dr, c = pos[1] + dc;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        var dark = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        qrSet(mat, r, c, dark);
      }
    }
  });
  /* timing patterns */
  for (var i = 8; i < size - 8; i++) {
    qrSet(mat, 6, i, i % 2 === 0);
    qrSet(mat, i, 6, i % 2 === 0);
  }
  /* alignment patterns */
  var centers = QR_ALIGN[version] || [];
  var last = size - 7;
  for (var a = 0; a < centers.length; a++) {
    for (var b = 0; b < centers.length; b++) {
      var cr = centers[a], cc = centers[b];
      if ((cr === 6 && cc === 6) || (cr === 6 && cc === last) || (cr === last && cc === 6)) continue;
      for (var dr2 = -2; dr2 <= 2; dr2++) {
        for (var dc2 = -2; dc2 <= 2; dc2++) {
          var dark2 = Math.max(Math.abs(dr2), Math.abs(dc2)) !== 1;
          qrSet(mat, cr + dr2, cc + dc2, dark2);
        }
      }
    }
  }
  /* reserve format info areas (values drawn later, per mask).
     Exact positions only — never overwrite timing modules at (6,8) / (8,6). */
  [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8], [8, 7],
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5]].forEach(function (p) { qrSet(mat, p[0], p[1], 0); });
  for (var i3 = 0; i3 < 8; i3++) qrSet(mat, 8, size - 1 - i3, 0);   /* row 8, right run */
  for (var i5 = 0; i5 < 8; i5++) qrSet(mat, size - 1 - i5, 8, 0);   /* col 8, bottom run */
  /* dark module */
  qrSet(mat, size - 8, 8, true);
  /* version info (v >= 7) */
  if (version >= 7) {
    var vdata = qrBch18(version);
    for (var vi = 0; vi < 18; vi++) {
      var bit = (vdata >>> vi) & 1;
      var a2 = size - 11 + (vi % 3), b2 = Math.floor(vi / 3);
      qrSet(mat, b2, a2, !!bit);      /* top-right  */
      qrSet(mat, a2, b2, !!bit);      /* bottom-left */
    }
  }
}

function qrDrawFormat(mat, ecBits, maskId) {
  var size = mat.size;
  var data = (ecBits << 3) | maskId;
  var bits = qrBch15(data) ^ 0x5412;
  function bit(i) { return ((bits >>> i) & 1) !== 0; }
  /* copy 1 — around top-left finder */
  for (var i = 0; i <= 5; i++) qrSet(mat, i, 8, bit(i));      /* col 8, rows 0-5 */
  qrSet(mat, 7, 8, bit(6));
  qrSet(mat, 8, 8, bit(7));
  qrSet(mat, 8, 7, bit(8));                                    /* row 8, col 7 */
  for (var j = 9; j < 15; j++) qrSet(mat, 8, 14 - j, bit(j));  /* row 8, cols 5-0 */
  /* copy 2 */
  for (var k = 0; k < 8; k++) qrSet(mat, 8, size - 1 - k, bit(k));      /* row 8, right run */
  for (var l = 8; l < 15; l++) qrSet(mat, size - 15 + l, 8, bit(l));    /* col 8, bottom run */
  qrSet(mat, size - 8, 8, true);   /* dark module stays dark */
}

/* ---- mask formulas ---- */
function qrMaskBit(mask, r, c) {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(c / 3) + Math.floor(r / 2)) % 2 === 0;
    case 5: return (r * c) % 2 + (r * c) % 3 === 0;
    case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
    case 7: return ((r + c) % 2 + (r * c) % 3) % 2 === 0;
  }
  return false;
}

/* ---- penalty scoring (ISO 18004 section 8.8.2) ---- */
function qrPenalty(mat) {
  var size = mat.size, m = mat.m, result = 0, r, c;

  function runHistoryOps(getColor, length) {
    /* scan one line; returns penalty for that line */
    var pen = 0;
    var runColor = 0, runLen = 0;
    var hist = [0, 0, 0, 0, 0, 0, 0];
    function addHist(len) {
      if (hist[0] === 0) len += length;   /* light border before start */
      hist.pop(); hist.unshift(len);
    }
    function countPatterns() {
      var n = hist[1];
      var core = n > 0 && hist[2] === n && hist[3] === n * 3 && hist[4] === n && hist[5] === n;
      return (core && hist[0] >= n * 4 && hist[6] >= n ? 1 : 0) +
             (core && hist[6] >= n * 4 && hist[0] >= n ? 1 : 0);
    }
    for (var i = 0; i < length; i++) {
      var col = getColor(i) ? 1 : 0;
      if (col === runColor) {
        runLen++;
        if (runLen === 5) pen += 3;
        else if (runLen > 5) pen += 1;
      } else {
        addHist(runLen);
        if (!runColor) pen += countPatterns() * 40;
        runColor = col; runLen = 1;
      }
    }
    /* terminate */
    if (runColor) { addHist(runLen); runLen = 0; }
    runLen += length;  /* light border at end */
    addHist(runLen);
    pen += countPatterns() * 40;
    return pen;
  }

  /* rows */
  for (r = 0; r < size; r++) {
    result += runHistoryOps(function (i) { return m[r][i]; }, size);
  }
  /* columns */
  for (c = 0; c < size; c++) {
    result += runHistoryOps(function (i) { return m[i][c]; }, size);
  }
  /* 2x2 blocks */
  for (r = 0; r < size - 1; r++) {
    for (c = 0; c < size - 1; c++) {
      var v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) result += 3;
    }
  }
  /* dark ratio */
  var dark = 0;
  for (r = 0; r < size; r++) for (c = 0; c < size; c++) dark += m[r][c];
  var total = size * size;
  var kk = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += kk * 10;
  return result;
}

/* ---- data placement (zigzag, skipping col 6) ---- */
function qrPlaceData(mat, codewords) {
  var size = mat.size;
  var i = 0, total = codewords.length * 8;
  for (var right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (var vert = 0; vert < size; vert++) {
      for (var j = 0; j < 2; j++) {
        var c = right - j;
        var upward = ((right + 1) & 2) === 0;
        var r = upward ? size - 1 - vert : vert;
        if (!mat.f[r][c] && i < total) {
          mat.m[r][c] = (codewords[i >>> 3] >>> (7 - (i & 7))) & 1;
          i++;
        }
      }
    }
  }
}

/* ---- encode text -> full QR matrix ---- */
function qrGenerate(text, ec) {
  ec = (ec === 'L') ? 'L' : 'M';
  var bytes;
  try { bytes = new TextEncoder().encode(String(text)); }
  catch (e) {
    /* UTF-8 by hand for very old engines */
    var s = unescape(encodeURIComponent(String(text)));
    bytes = [];
    for (var q = 0; q < s.length; q++) bytes.push(s.charCodeAt(q) & 0xFF);
  }
  if (!bytes.length) bytes = [0];

  /* choose version (1-10): prefer M, fall back to L for longer texts */
  var tried = [['M', 1], ['L', 1]], chosen = null;
  for (var t = 0; t < tried.length && !chosen; t++) {
    var e = tried[t][0];
    for (var v = 1; v <= 10; v++) {
      var countBits = v < 10 ? 8 : 16;
      if (4 + countBits + bytes.length * 8 + 4 <= qrDataCodewords(v, e) * 8) { chosen = { ec: e, v: v }; break; }
    }
  }
  if (!chosen) throw new Error('Text too long for QR (max ~270 bytes)');

  var spec = QR_BLOCKS[chosen.ec][chosen.v];
  var dataCap = qrDataCodewords(chosen.v, chosen.ec);
  var countBits = chosen.v < 10 ? 8 : 16;

  /* build the data bit stream */
  var buf = qrBitBuf();
  qrPushBits(buf, 4, 4);                    /* byte mode */
  qrPushBits(buf, bytes.length, countBits); /* char count */
  for (var b = 0; b < bytes.length; b++) qrPushBits(buf, bytes[b], 8);
  /* terminator */
  var cap = dataCap * 8;
  for (var tb = 0; tb < 4 && buf.len < cap; tb++) { buf.bits.push(0); buf.len++; }
  /* pad to byte boundary */
  while (buf.len % 8 !== 0) { buf.bits.push(0); buf.len++; }
  /* to codewords */
  var data = [];
  for (var cw = 0; cw < buf.bits.length / 8; cw++) {
    var byte = 0;
    for (var k = 0; k < 8; k++) byte = (byte << 1) | buf.bits[cw * 8 + k];
    data.push(byte);
  }
  /* pad codewords */
  var padAlt = [0xEC, 0x11], pi = 0;
  while (data.length < dataCap) data.push(padAlt[(pi++) % 2]);

  /* split into blocks + compute EC */
  var blocks = [], off = 0;
  spec[1].forEach(function (b2) {
    for (var n = 0; n < b2[0]; n++) {
      var chunk = data.slice(off, off + b2[1]);
      off += b2[1];
      blocks.push({ d: chunk, ec: qrRsEncode(chunk, spec[0]) });
    }
  });

  /* interleave */
  var maxD = 0;
  blocks.forEach(function (bl) { maxD = Math.max(maxD, bl.d.length); });
  var final = [];
  for (var di = 0; di < maxD; di++) {
    blocks.forEach(function (bl) { if (di < bl.d.length) final.push(bl.d[di]); });
  }
  for (var ei = 0; ei < spec[0]; ei++) {
    blocks.forEach(function (bl) { final.push(bl.ec[ei]); });
  }

  /* build the matrix, try all masks, keep the best */
  var size = 17 + 4 * chosen.v;
  var ecBits = chosen.ec === 'L' ? 1 : 0;
  var best = null;
  for (var mask = 0; mask < 8; mask++) {
    var mat = qrNewMatrix(size);
    qrDrawFunctionPatterns(mat, chosen.v);
    qrPlaceData(mat, final);
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        if (!mat.f[r][c] && qrMaskBit(mask, r, c)) mat.m[r][c] ^= 1;
      }
    }
    qrDrawFormat(mat, ecBits, mask);
    var pen = qrPenalty(mat);
    if (!best || pen < best.pen) best = { pen: pen, mat: mat };
  }

  return { size: size, version: chosen.v, ec: chosen.ec, modules: best.mat.m };
}

/* ---- render to canvas ---- */
function qrRender(canvas, text, scale, ec) {
  var qr = qrGenerate(text, ec || 'M');
  var margin = 4;
  var dim = (qr.size + margin * 2) * scale;
  canvas.width = dim; canvas.height = dim;
  var g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, dim, dim);
  g.fillStyle = '#000000';
  for (var r = 0; r < qr.size; r++) {
    for (var c = 0; c < qr.size; c++) {
      if (qr.modules[r][c]) g.fillRect((margin + c) * scale, (margin + r) * scale, scale, scale);
    }
  }
  return qr;
}


/* ===== 15-toolkit.js ===== */
/*
 * 15-toolkit.js — developer toolkit: text converters, regex tester,
 *                color tools + contrast checker, QR codes, media controls.
 */

var tkSub = 'convert';

function renderToolkitPanel() {
  if (!panelEls.toolkit) return;
  var panel = panelEls.toolkit;
  panel.textContent = '';
  var subs = [['convert', 'Convert'], ['regex', 'Regex'], ['color', 'Color'],
    ['qr', 'QR'], ['media', 'Media']];
  var subBar = h('.pdt-sub');
  subs.forEach(function (s) {
    var b = h('button.pdt-subb' + (tkSub === s[0] ? '.on' : ''), s[1]);
    b.addEventListener('click', function () { tkSub = s[0]; renderToolkitPanel(); });
    subBar.appendChild(b);
  });
  panel.appendChild(subBar);
  var sc = h('.pdt-scroll');
  panel.appendChild(sc);
  if (tkSub === 'convert') sc.appendChild(buildTkConvert());
  else if (tkSub === 'regex') sc.appendChild(buildTkRegex());
  else if (tkSub === 'color') sc.appendChild(buildTkColor());
  else if (tkSub === 'qr') sc.appendChild(buildTkQr());
  else sc.appendChild(buildTkMedia());
}

/* ================= Convert ================= */
function buildTkConvert() {
  var wrap = h('div');
  wrap.appendChild(h('.pdt-label', 'Input'));
  var inp = h('textarea.pdt-area', { rows: 5, placeholder: 'Paste or type text, JSON, a JWT, a timestamp…', spellcheck: 'false' });

  wrap.appendChild(inp);
  wrap.appendChild(h('.pdt-label', 'Actions'));

  var outCard = h('.pdt-card');
  var out = h('pre.pdt-mono', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '.85em', color: 'var(--fg2)', margin: 0, maxHeight: '40vh', overflow: 'auto' } }, '(output appears here)');
  var outVal = null;

  function show(label, text) {
    outVal = String(text);
    outCard.textContent = '';
    outCard.appendChild(h('.pdt-row', [
      h('span.pdt-label', { style: { margin: 0 } }, label),
      h('span.pdt-grow'),
      h('button.pdt-ib', { type: 'button', title: 'Copy', onclick: function () { copyText(outVal); } }, iconEl('copy', 14)),
      h('button.pdt-ib', { type: 'button', title: 'Use as input', onclick: function () { inp.value = outVal; toast('Output moved to input'); } }, iconEl('up', 14))
    ]));
    outCard.appendChild(out);
    out.textContent = outVal || '(empty)';
    out.scrollIntoView({ block: 'nearest' });
  }
  function err(e) { show('Error', e && (e.message || e) || String(e)); }

  function btn(label, fn) {
    var b = h('button.pdt-btn', { type: 'button' }, label);
    b.addEventListener('click', function () {
      var v = inp.value;
      if (!v.trim()) { toast('Enter some input first'); return; }
      try { fn(v); } catch (e) { err(e); }
    });
    return b;
  }

  var grid = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } });

  /* base64 */
  grid.appendChild(btn('Base64 \u2192', function (v) { show('Base64', b64EncodeUtf8(v) || '(failed)'); }));
  grid.appendChild(btn('\u2190 Base64', function (v) {
    var d = b64DecodeUtf8(v.trim());
    if (d == null) throw new Error('Not valid Base64');
    show('Decoded', d);
  }));
  /* url */
  grid.appendChild(btn('URL \u2192', function (v) { show('URL encoded', encodeURIComponent(v)); }));
  grid.appendChild(btn('\u2190 URL', function (v) { show('URL decoded', safeDecodeURIComponent(v.trim())); }));
  /* json */
  grid.appendChild(btn('JSON pretty', function (v) {
    show('JSON (pretty)', JSON.stringify(JSON.parse(v), null, 2));
  }));
  grid.appendChild(btn('JSON minify', function (v) {
    show('JSON (minified)', JSON.stringify(JSON.parse(v)));
  }));
  grid.appendChild(btn('JSON validate', function (v) {
    JSON.parse(v);
    show('Validation', 'Valid JSON \u2713\n' + v.trim().length + ' characters');
  }));
  grid.appendChild(btn('JSON escape', function (v) {
    show('Escaped', JSON.stringify(v).slice(1, -1));
  }));
  grid.appendChild(btn('JSON unescape', function (v) {
    show('Unescaped', JSON.parse('"' + v.trim().replace(/\n/g, '\\n') + '"'));
  }));
  /* html */
  grid.appendChild(btn('HTML escape', function (v) {
    show('HTML escaped', v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
  }));
  grid.appendChild(btn('HTML unescape', function (v) {
    var t = document.createElement('textarea');
    t.innerHTML = v;
    show('HTML unescaped', t.value);
  }));
  /* jwt */
  grid.appendChild(btn('Decode JWT', function (v) {
    var j = jwtDecode(v);
    if (!j) throw new Error('Not a valid JWT');
    var lines = ['/* header */', JSON.stringify(j.header, null, 2), '', '/* payload */', JSON.stringify(j.payload, null, 2)];
    if (j.payload && j.payload.exp) {
      var exp = new Date(j.payload.exp * 1000);
      lines.push('', 'Expires: ' + exp.toISOString() + (Date.now() > j.payload.exp * 1000 ? '  \u26A0 EXPIRED' : '  \u2713 still valid'));
    }
    if (j.signature) lines.push('', '/* signature (not verified) */', j.signature.slice(0, 43) + '\u2026');
    show('JWT decoded', lines.join('\n'));
  }));
  /* timestamp */
  grid.appendChild(btn('Unix \u2192 date', function (v) {
    var n = Number(v.trim());
    if (isNaN(n)) throw new Error('Not a number');
    if (n < 1e11) n *= 1000;   /* seconds vs milliseconds */
    var d = new Date(n);
    if (isNaN(d.getTime())) throw new Error('Out of range');
    show('Date', d.toISOString() + '\nLocal: ' + d.toString() + '\nRelative: ' + timeAgo(n));
  }));
  grid.appendChild(btn('Date \u2192 unix', function (v) {
    var d = new Date(v.trim());
    if (isNaN(d.getTime())) throw new Error('Could not parse date');
    show('Unix', Math.floor(d.getTime() / 1000) + ' s  =  ' + d.getTime() + ' ms');
  }));
  grid.appendChild(h('button.pdt-btn', { type: 'button', onclick: function () { inp.value = String(Math.floor(Date.now() / 1000)); toast('Current unix time inserted'); } }, 'Now (unix)'));
  /* uuid */
  grid.appendChild(h('button.pdt-btn', { type: 'button', onclick: function () {
    var u = (crypto && crypto.randomUUID) ? crypto.randomUUID() : uid() + '-' + uid();
    inp.value = u;
    show('UUID v4', u);
  } }, 'UUID v4'));
  /* hashes */
  [['SHA-1', 'SHA-1'], ['SHA-256', 'SHA-256'], ['SHA-512', 'SHA-512']].forEach(function (hh) {
    var b = h('button.pdt-btn', { type: 'button' }, hh[0]);
    b.addEventListener('click', function () {
      var v = inp.value;
      if (!v.trim()) { toast('Enter some input first'); return; }
      if (!(crypto && crypto.subtle)) { toast('crypto.subtle needs HTTPS'); return; }
      crypto.subtle.digest(hh[1], new TextEncoder().encode(v)).then(function (buf) {
        var hex = [];
        new Uint8Array(buf).forEach(function (x) { hex.push(('0' + x.toString(16)).slice(-2)); });
        show(hh[0] + ' hash', hex.join(''));
      }, function () { toast('Hash failed'); });
    });
    grid.appendChild(b);
  });
  wrap.appendChild(grid);
  wrap.appendChild(outCard);
  return wrap;
}

function timeAgo(ts) {
  var s = Math.round((Date.now() - ts) / 1000);
  var future = s < 0; s = Math.abs(s);
  function p(n, u) { return n + ' ' + u + (n === 1 ? '' : 's'); }
  var txt;
  if (s < 60) txt = p(s, 'second');
  else if (s < 3600) txt = p(Math.floor(s / 60), 'minute');
  else if (s < 86400) txt = p(Math.floor(s / 3600), 'hour');
  else txt = p(Math.floor(s / 86400), 'day');
  return future ? 'in ' + txt : txt + ' ago';
}

/* ================= Regex ================= */
function buildTkRegex() {
  var wrap = h('div');
  var patIn = h('input.pdt-input.pdt-mono', { placeholder: 'Pattern, e.g. (\\w+)@(\\w+)\\.com', autocapitalize: 'off', spellcheck: 'false' });
  var flagsIn = h('input.pdt-input.pdt-mono', { value: 'g', style: { width: '86px', flex: 'none' }, autocapitalize: 'off', spellcheck: 'false' });
  var testIn = h('textarea.pdt-area', { rows: 6, placeholder: 'Test text…', spellcheck: 'false' });

  var resultCard = h('.pdt-card');
  var result = h('div');
  resultCard.appendChild(result);

  function run() {
    result.textContent = '';
    var pat = patIn.value, flags = flagsIn.value || '';
    if (!pat) { result.appendChild(h('.pdt-empty', 'Enter a pattern above.')); return; }
    var re;
    try { re = new RegExp(pat, flags.replace(/[^gimsuy]/g, '')); }
    catch (e) { result.appendChild(h('.pdt-cent', { dataset: { lv: 'error' } }, e.message || String(e))); return; }

    var text = testIn.value;
    if (!text) { result.appendChild(h('.pdt-empty', 'Enter test text to see matches.')); return; }

    var matches = [];
    if (re.global) {
      var m, guard = 0;
      while ((m = re.exec(text)) && guard++ < 500) {
        matches.push(m);
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    } else {
      var one = re.exec(text);
      if (one) matches.push(one);
    }

    /* highlighted preview */
    var hl = h('pre.pdt-mono', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '.85em', lineHeight: '1.7', margin: '0 0 10px' } });
    var last2 = 0;
    matches.forEach(function (m) {
      if (m.index > last2) hl.appendChild(document.createTextNode(text.slice(last2, m.index)));
      hl.appendChild(h('mark', { style: { background: 'rgba(91,157,255,.35)', color: 'inherit', borderRadius: '3px', padding: '0 1px' } }, m[0]));
      last2 = m.index + m[0].length;
    });
    hl.appendChild(document.createTextNode(text.slice(last2)));
    result.appendChild(h('.pdt-label', 'Preview'));
    result.appendChild(hl);
    result.appendChild(h('.pdt-label', matches.length + ' match(es)'));

    var list = h('div');
    matches.slice(0, 100).forEach(function (m, i) {
      var rows = [kv('#' + (i + 1), truncate(m[0], 60) + '  @ ' + m.index)];
      for (var g = 1; g < m.length; g++) {
        rows.push(kv('group ' + g, m[g] == null ? '(undefined)' : truncate(String(m[g]), 60)));
      }
      if (m.groups) {
        for (var gn in m.groups) rows.push(kv('"' + gn + '"', truncate(String(m.groups[gn]), 60)));
      }
      list.appendChild(h('.pdt-kvwrap', rows));
    });
    result.appendChild(list);
    if (matches.length > 100) result.appendChild(h('.pdt-label', '\u2026 and ' + (matches.length - 100) + ' more'));
  }

  patIn.addEventListener('input', debounce(run, 300));
  flagsIn.addEventListener('input', debounce(run, 300));
  testIn.addEventListener('input', debounce(run, 300));

  wrap.appendChild(h('.pdt-label', 'Pattern'));
  wrap.appendChild(h('.pdt-row', [patIn, flagsIn]));
  wrap.appendChild(h('.pdt-label', 'Test text'));
  wrap.appendChild(testIn);
  wrap.appendChild(h('.pdt-row', { style: { margin: '8px 0', flexWrap: 'wrap' } },
    ['[a-z]+', '\\d+', '^[\\w.-]+@[\\w.-]+\\.\\w+$', 'https?://[^\\s]+'].map(function (p) {
      var b = h('button.pdt-chip', { type: 'button' }, truncate(p, 22));
      b.addEventListener('click', function () { patIn.value = p; run(); });
      return b;
    })));
  wrap.appendChild(resultCard);
  setTimeout(run, 30);
  return wrap;
}

/* ================= Color ================= */
function buildTkColor() {
  var wrap = h('div');

  /* single color inspector */
  var card = h('.pdt-card');
  var picker = h('input', { type: 'color', value: '#5b9dff', style: { width: '52px', height: '40px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg2)', padding: '2px', flex: 'none' } });
  var hexIn = h('input.pdt-input.pdt-mono', { value: '#5b9dff', autocapitalize: 'off', spellcheck: 'false' });
  card.appendChild(h('.pdt-row', [picker, hexIn]));
  var outs = h('div', { style: { marginTop: '8px' } });
  card.appendChild(outs);

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    var h = 0, s = mx === 0 ? 0 : d / mx, v = mx;
    if (d) {
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = ((b - r) / d + 2);
      else h = ((r - g) / d + 4);
      h *= 60;
    }
    return 'hsv(' + Math.round(h) + ', ' + Math.round(s * 100) + '%, ' + Math.round(v * 100) + '%)';
  }
  function rgbToCmyk(r, g, b) {
    var rr = r / 255, gg = g / 255, bb = b / 255;
    var k = 1 - Math.max(rr, gg, bb);
    if (k >= 1) return 'cmyk(0%, 0%, 0%, 100%)';
    var c = (1 - rr - k) / (1 - k), m = (1 - gg - k) / (1 - k), y = (1 - bb - k) / (1 - k);
    return 'cmyk(' + Math.round(c * 100) + '%, ' + Math.round(m * 100) + '%, ' + Math.round(y * 100) + '%, ' + Math.round(k * 100) + '%)';
  }
  function drawColor() {
    var rgb = parseColorStr(hexIn.value);
    outs.textContent = '';
    if (!rgb) {
      outs.appendChild(h('.pdt-cent', { dataset: { lv: 'error' } }, 'Could not parse "' + truncate(hexIn.value, 30) + '" — use hex, rgb() or hsl()'));
      return;
    }
    var hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    picker.value = hex;
    outs.appendChild(h('.pdt-swatch', { style: { width: '100%', justifyContent: 'flex-start' } }, [
      h('i', { style: { background: hex, width: '38px', height: '24px' } }),
      h('span.pdt-grow.pdt-mono', { style: { fontSize: '.85em' } }, hex)
    ]));
    outs.appendChild(kv('RGB', 'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')'));
    outs.appendChild(kv('HSL', rgbToHsl(rgb.r, rgb.g, rgb.b)));
    outs.appendChild(kv('HSV', rgbToHsv(rgb.r, rgb.g, rgb.b)));
    outs.appendChild(kv('CMYK', rgbToCmyk(rgb.r, rgb.g, rgb.b)));
    outs.appendChild(kv('Luminance', (Math.round(relLuminance(rgb.r, rgb.g, rgb.b) * 1000) / 1000)));
  }
  picker.addEventListener('input', function () { hexIn.value = picker.value; drawColor(); });
  hexIn.addEventListener('input', debounce(drawColor, 200));
  drawColor();
  wrap.appendChild(card);

  /* contrast checker */
  var cc = h('.pdt-card');
  cc.appendChild(h('.pdt-label', 'Contrast checker (WCAG)'));
  var fgPick = h('input', { type: 'color', value: '#e8eaed', style: { width: '46px', height: '34px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg2)', padding: '2px' } });
  var bgPick = h('input', { type: 'color', value: '#1e1f24', style: { width: '46px', height: '34px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg2)', padding: '2px' } });
  var swapBtn = h('button.pdt-ib', { type: 'button', title: 'Swap', onclick: function () {
    var t = fgPick.value; fgPick.value = bgPick.value; bgPick.value = t; drawContrast();
  } }, iconEl('repeat', 14));
  cc.appendChild(h('.pdt-row', [fgPick, swapBtn, bgPick]));
  var cOut = h('div', { style: { marginTop: '8px' } });
  cc.appendChild(cOut);
  function drawContrast() {
    var fg = parseColorStr(fgPick.value), bg = parseColorStr(bgPick.value);
    var ratio = contrastRatio(fg, bg);
    var norm = ratio >= 4.5, large = ratio >= 3, aaa = ratio >= 7;
    cOut.textContent = '';
    var preview = h('div', {
      style: {
        background: bgPick.value, color: fgPick.value, padding: '10px', borderRadius: '8px',
        fontSize: '.95em', marginBottom: '8px', border: '1px solid var(--border)'
      }
    }, 'The quick brown fox jumps over 1,234 lazy dogs.');
    cOut.appendChild(preview);
    cOut.appendChild(kv('Contrast ratio', ratio.toFixed(2) + ':1'));
    cOut.appendChild(kv('AA normal text', ratio >= 4.5 ? '\u2713 pass' : '\u2717 fail (' + ratio.toFixed(2) + ' < 4.5)'));
    cOut.appendChild(kv('AA large text', ratio >= 3 ? '\u2713 pass' : '\u2717 fail (' + ratio.toFixed(2) + ' < 3)'));
    cOut.appendChild(kv('AAA normal text', ratio >= 7 ? '\u2713 pass' : '\u2717 fail (' + ratio.toFixed(2) + ' < 7)'));
    cOut.appendChild(kv('AAA large text', ratio >= 4.5 ? '\u2713 pass' : '\u2717 fail (' + ratio.toFixed(2) + ' < 4.5)'));
  }
  fgPick.addEventListener('input', drawContrast);
  bgPick.addEventListener('input', drawContrast);
  drawContrast();
  wrap.appendChild(cc);

  /* page palette */
  var pc = h('.pdt-card');
  pc.appendChild(h('.pdt-label', 'Colors used on this page'));
  var palBtn = h('button.pdt-btn', { type: 'button' }, [iconEl('droplet', 14), 'Extract palette']);
  var palOut = h('div', { style: { marginTop: '8px' } });
  palBtn.addEventListener('click', function () {
    var colors = {};
    try {
      Array.prototype.forEach.call(document.querySelectorAll('body *'), function (el) {
        if (el.id === 'pdt-host' || (hostEl && hostEl.contains(el))) return;
        var cs;
        try { cs = getComputedStyle(el); } catch (e) { return; }
        ['color', 'backgroundColor', 'borderTopColor'].forEach(function (p) {
          var v = cs.getPropertyValue(p);
          var rgb = parseColorStr(v);
          if (rgb && !(rgb.r > 250 && rgb.g > 250 && rgb.b > 250)) {
            var hex = rgbToHex(rgb.r, rgb.g, rgb.b);
            colors[hex] = (colors[hex] || 0) + 1;
          }
        });
      });
    } catch (e) { /* noop */ }
    var list = Object.keys(colors).sort(function (a, b) { return colors[b] - colors[a]; }).slice(0, 24);
    palOut.textContent = '';
    if (!list.length) { palOut.appendChild(h('.pdt-empty', 'No colors found.')); return; }
    var grid = h('.pdt-row', { style: { flexWrap: 'wrap' } });
    list.forEach(function (hex) {
      var sw = h('button.pdt-swatch', { title: hex + ' (' + colors[hex] + '\u00D7) — tap to copy' }, [
        h('i', { style: { background: hex } }), hex
      ]);
      sw.addEventListener('click', function () { copyText(hex, true); toast('Copied ' + hex); });
      grid.appendChild(sw);
    });
    palOut.appendChild(grid);
  });
  pc.appendChild(palBtn);
  pc.appendChild(palOut);
  wrap.appendChild(pc);
  return wrap;
}

/* ================= QR ================= */
function buildTkQr() {
  var wrap = h('div');
  var textIn = h('textarea.pdt-area', { rows: 3, placeholder: 'Text or URL to encode…', spellcheck: 'false' });
  textIn.value = location.href;

  var ecSel = h('select.pdt-select', { style: { width: '150px', flex: 'none' } });
  [['M', 'EC level M (recommended)'], ['L', 'EC level L (more data)']].forEach(function (o) {
    var op = h('option', o[1]);
    op.value = o[0];
    ecSel.appendChild(op);
  });
  var scaleSel = h('select.pdt-select', { style: { width: '130px', flex: 'none' } });
  [['3', 'Small'], ['5', 'Medium'], ['8', 'Large']].forEach(function (o) {
    var op = h('option', o[1]);
    op.value = o[0];
    scaleSel.appendChild(op);
  });
  scaleSel.value = '5';

  var canvas = h('canvas', { style: { display: 'block', margin: '12px auto', background: '#fff', borderRadius: '10px', border: '1px solid var(--border)', maxWidth: '100%' } });
  var info = h('.pdt-label', { style: { textAlign: 'center' } }, '');

  function render() {
    try {
      var qr = qrRender(canvas, textIn.value || ' ', parseInt(scaleSel.value, 10) || 5, ecSel.value);
      info.textContent = 'Version ' + qr.version + ' (' + qr.size + '\u00D7' + qr.size + ') · ' +
        (textIn.value.length) + ' chars · ' + qr.ec;
      info.style.color = 'var(--muted)';
    } catch (e) {
      info.textContent = e.message || String(e);
      info.style.color = 'var(--err)';
    }
  }
  textIn.addEventListener('input', debounce(render, 300));
  ecSel.addEventListener('change', render);
  scaleSel.addEventListener('change', render);

  wrap.appendChild(h('.pdt-label', 'Content'));
  wrap.appendChild(textIn);
  wrap.appendChild(h('.pdt-row', { style: { margin: '8px 0' } }, [
    h('button.pdt-btn', { type: 'button', onclick: function () { textIn.value = location.href; render(); } }, [iconEl('link', 14), 'Page URL']),
    h('span.pdt-grow'),
    ecSel, scaleSel
  ]));
  wrap.appendChild(canvas);
  wrap.appendChild(info);
  wrap.appendChild(h('.pdt-row', { style: { justifyContent: 'center' } }, [
    h('button.pdt-btn', { type: 'button', onclick: function () {
      try {
        var a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = 'qr-' + Date.now() + '.png';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { a.remove(); }, 300);
        toast('QR code downloaded');
      } catch (e) { toast('Download failed'); }
    } }, [iconEl('download', 14), 'Download PNG'])
  ]));
  wrap.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em', color: 'var(--muted)' } },
    'Scan with any camera app. Great for sending the current URL to another device or sharing Wi-Fi credentials.'));
  setTimeout(render, 30);
  return wrap;
}

/* ================= Media ================= */
function buildTkMedia() {
  var wrap = h('div');
  var meds = [];
  try {
    meds = Array.prototype.slice.call(document.querySelectorAll('video, audio'));
  } catch (e) { /* noop */ }

  if (!meds.length) {
    return h('.pdt-empty', 'No <video> or <audio> elements on this page.');
  }

  /* global controls */
  var g = h('.pdt-row', { style: { flexWrap: 'wrap', marginBottom: '10px' } });
  [
    ['Pause all', 'pause', function () { meds.forEach(function (m) { m.pause(); }); }],
    ['Mute all', 'alert', function () { meds.forEach(function (m) { m.muted = true; }); }],
    ['Unmute all', 'unlock', function () { meds.forEach(function (m) { m.muted = false; }); }],
    ['Loop all', 'repeat', function () { meds.forEach(function (m) { m.loop = !m.loop; }); toast('Toggled loop on ' + meds.length + ' element(s)'); }]
  ].forEach(function (t) {
    var b = h('button.pdt-btn', { type: 'button' }, [iconEl(t[1], 14), t[0]]);
    b.addEventListener('click', t[2]);
    g.appendChild(b);
  });
  wrap.appendChild(g);

  function mediaCard(m, i) {
    var isVideo = m.tagName === 'VIDEO';
    var card = h('.pdt-card');
    var state = h('span.pdt-badge.b-other', m.paused ? 'paused' : 'playing');
    var name = (m.title || m.src || (isVideo ? 'video' : 'audio') + ' #' + (i + 1));

    /* play/pause + title row */
    var playBtn = h('button.pdt-ib', { type: 'button', title: 'Play / pause' }, iconEl(m.paused ? 'play' : 'pause', 18));
    playBtn.addEventListener('click', function () {
      if (m.paused) { m.play().catch(function () { toast('Playback blocked'); }); }
      else m.pause();
    });
    card.appendChild(h('.pdt-row', [
      playBtn,
      h('span.pdt-grow', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '.9em' } }, truncate(name, 34)),
      state
    ]));

    /* time + seek */
    var cur = h('span.pdt-mono', { style: { fontSize: '.8em', color: 'var(--muted)', flex: 'none', width: '44px' } }, fmtClock(m.currentTime));
    var dur = h('span.pdt-mono', { style: { fontSize: '.8em', color: 'var(--muted)', flex: 'none', width: '44px', textAlign: 'right' } }, fmtClock(isFinite(m.duration) ? m.duration : 0));
    var seek = h('input', { type: 'range', min: '0', max: '100', step: '0.1', value: '0', style: { flex: '1' } });
    function fmtClock(s) {
      if (!isFinite(s) || s < 0) s = 0;
      var mm = Math.floor(s / 60), ss = Math.floor(s % 60);
      return mm + ':' + (ss < 10 ? '0' : '') + ss;
    }
    seek.addEventListener('input', function () {
      if (isFinite(m.duration)) m.currentTime = (seek.value / 100) * m.duration;
    });
    card.appendChild(h('.pdt-row', { style: { marginTop: '8px' } }, [cur, seek, dur]));

    /* speed */
    var speedVal = h('span.pdt-mono', { style: { fontSize: '.82em', flex: 'none', width: '40px', textAlign: 'right' } }, (m.playbackRate || 1) + '\u00D7');
    var speed = h('input', { type: 'range', min: '0.25', max: '4', step: '0.05', value: String(m.playbackRate || 1) });
    speed.addEventListener('input', function () {
      m.playbackRate = parseFloat(speed.value);
      speedVal.textContent = speed.value + '\u00D7';
    });
    card.appendChild(h('.pdt-row', { style: { marginTop: '6px' } }, [
      h('span', { style: { fontSize: '.8em', color: 'var(--muted)', flex: 'none' } }, 'Speed'), speed, speedVal
    ]));

    /* quick chips */
    var chips = h('.pdt-row', { style: { flexWrap: 'wrap', marginTop: '8px' } });
    [['1\u00D7', 1], ['1.5\u00D7', 1.5], ['2\u00D7', 2], ['3\u00D7', 3]].forEach(function (sp) {
      var c = h('button.pdt-chip', { type: 'button' }, sp[0]);
      c.addEventListener('click', function () {
        m.playbackRate = sp[1];
        speed.value = String(sp[1]);
        speedVal.textContent = sp[0];
      });
      chips.appendChild(c);
    });
    var mute = h('button.pdt-chip' + (m.muted ? '' : '.on'), { type: 'button' }, m.muted ? 'muted' : 'sound');
    mute.addEventListener('click', function () {
      m.muted = !m.muted;
      mute.textContent = m.muted ? 'muted' : 'sound';
      mute.classList.toggle('on', !m.muted);
    });
    chips.appendChild(mute);
    var skipBack = h('button.pdt-chip', { type: 'button' }, '\u221210s');
    skipBack.addEventListener('click', function () { m.currentTime = Math.max(0, m.currentTime - 10); });
    chips.appendChild(skipBack);
    var skipFwd = h('button.pdt-chip', { type: 'button' }, '+10s');
    skipFwd.addEventListener('click', function () { m.currentTime = m.currentTime + 10; });
    chips.appendChild(skipFwd);
    card.appendChild(chips);

    /* live state refresh */
    function refresh() {
      state.textContent = m.paused ? 'paused' : 'playing';
      if (isFinite(m.duration) && m.duration > 0) {
        seek.value = String((m.currentTime / m.duration) * 100);
        cur.textContent = fmtClock(m.currentTime);
      }
      playBtn.textContent = '';
      playBtn.appendChild(iconEl(m.paused ? 'play' : 'pause', 18));
    }
    m.addEventListener('play', refresh);
    m.addEventListener('pause', refresh);
    m.addEventListener('timeupdate', refresh);
    refresh();
    return card;
  }

  meds.slice(0, 20).forEach(function (m, i) { wrap.appendChild(mediaCard(m, i)); });
  if (meds.length > 20) wrap.appendChild(h('.pdt-label', '\u2026 and ' + (meds.length - 20) + ' more'));
  return wrap;
}

registerPanel({
  id: 'toolkit', label: 'Toolkit', icon: 'zap',
  render: function (panel) { panelEls.toolkit = panel; renderToolkitPanel(); },
  onShow: renderToolkitPanel
});


/* ===== 16-utilities.js ===== */
/*
 * 12-utilities.js — device info, JS snippet library, one-tap quick tools
 */

function renderUtilsPanel() {
  if (!panelEls.utils) return;
  var panel = panelEls.utils;
  panel.textContent = '';

  var subs = [['info', 'Device'], ['snip', 'Snippets'], ['tools', 'Tools']];
  var subBar = h('.pdt-sub');
  subs.forEach(function (s) {
    var b = h('button.pdt-subb' + (utilSub === s[0] ? '.on' : ''), s[1]);
    b.addEventListener('click', function () { utilSub = s[0]; renderUtilsPanel(); });
    subBar.appendChild(b);
  });
  panel.appendChild(subBar);
  var sc = h('.pdt-scroll');
  panel.appendChild(sc);
  if (utilSub === 'info') sc.appendChild(buildDeviceInfo());
  else if (utilSub === 'snip') sc.appendChild(buildSnippets());
  else sc.appendChild(buildQuickTools());
}
var utilSub = 'info';

/* ---------------- device info ---------------- */
function buildDeviceInfo() {
  var d = h('.pdt-card');
  function add(k, v) { d.appendChild(kv(k, v)); }
  add('Viewport', window.innerWidth + ' \u00D7 ' + window.innerHeight + ' px');
  add('Screen', screen.width + ' \u00D7 ' + screen.height + ' px (' + (screen.orientation && screen.orientation.type || '—') + ')');
  add('Device pixel ratio', window.devicePixelRatio + 'x');
  add('Effective CSS width', document.documentElement.clientWidth + ' px');
  add('Touch points', navigator.maxTouchPoints != null ? String(navigator.maxTouchPoints) : '—');
  add('Online', navigator.onLine ? 'yes' : 'no');
  add('Cookies enabled', navigator.cookieEnabled ? 'yes' : 'no');
  add('Do not track', navigator.doNotTrack === '1' ? 'enabled' : (navigator.doNotTrack || '—'));
  add('Protocol', location.protocol.replace(':', '') + (window.isSecureContext ? ' (secure)' : ' (insecure)'));
  add('Origin', location.origin);
  add('Timezone', (Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : '—'));
  add('Language', navigator.language + (navigator.languages ? ' (' + navigator.languages.slice(0, 3).join(', ') + ')' : ''));
  add('Platform', navigator.platform || '—');
  add('Cores', navigator.hardwareConcurrency || '—');
  var uaCard = h('.pdt-card');
  uaCard.appendChild(h('.pdt-label', 'User agent'));
  uaCard.appendChild(h('div.pdt-mono', { style: { fontSize: '.82em', wordBreak: 'break-all', lineHeight: '1.5' } }, navigator.userAgent));
  var btns = h('.pdt-row', { style: { flexWrap: 'wrap' } }, [
    h('button.pdt-btn', { type: 'button', onclick: function () {
      copyText(navigator.userAgent);
    } }, [iconEl('copy', 14), 'Copy UA']),
    h('button.pdt-btn', { type: 'button', onclick: function () {
      copyText(location.href + '\n' + document.title + '\n' + navigator.userAgent);
    } }, [iconEl('copy', 14), 'Copy page info'])
  ]);
  return h('div', [d, uaCard, btns]);
}

/* ---------------- built-in snippet library ---------------- */
var BUILTIN_SNIPPETS = [
  { name: 'Enable text selection & copy', code: 'document.body.style.userSelect = "auto"; document.body.style.webkitUserSelect = "auto";\n["onselectstart", "oncopy", "oncut", "oncontextmenu"].forEach(function (h) { document.body[h] = null; document.documentElement[h] = null; });\n"Selection, copy and context menu unlocked";' },
  { name: 'Reveal password fields', code: 'document.querySelectorAll("input[type=password]").forEach(function (i) { i.type = "text"; });\n"Done — passwords are visible now";' },
  { name: 'Kill sticky headers & overlays', code: 'var n = 0; document.querySelectorAll("*").forEach(function (el) {\n  var p = getComputedStyle(el).position;\n  if ((p === "fixed" || p === "sticky") && el.id !== "pdt-host") { el.style.position = "static"; n++; }\n});\ndocument.documentElement.style.overflow = "auto"; document.body.style.overflow = "auto";\n"Reset " + n + " pinned element(s) and re-enabled scrolling";' },
  { name: 'Count elements by tag (top 20)', code: 'var c = {}; document.querySelectorAll("*").forEach(function (el) { c[el.tagName] = (c[el.tagName] || 0) + 1; });\nObject.entries(c).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 20)\n  .map(function (e) { return e[0] + ": " + e[1]; }).join("\\n") + "\\nTotal: " + document.querySelectorAll("*").length;' },
  { name: 'List captured event listeners', code: 'typeof getListeners === "function" ? getListeners($0 || document.body) : "Select an element first, then run this";' },
  { name: 'Find oversized images (wasted bytes)', code: 'document.querySelectorAll("img").map(function (i) {\n  return { src: (i.currentSrc || i.src).slice(0, 70), natural: i.naturalWidth + "x" + i.naturalHeight, shown: Math.round(i.getBoundingClientRect().width) + "px" };\n}).filter(function (i) { return i.natural !== "0x0" && parseInt(i.natural) > 400; })\n  .map(function (i) { return i.natural + " shown at " + i.shown + " — " + i.src; }).join("\\n") || "No oversized images";' },
  { name: 'Slow auto-scroll (reader mode)', code: 'var s = window.__pdtScroll; if (s) { clearInterval(s); window.__pdtScroll = null; "Auto-scroll stopped"; }\nelse { window.__pdtScroll = setInterval(function () { window.scrollBy(0, 1); }, 30); "Auto-scroll on — run again to stop"; }' },
  { name: 'Expand all <details>', code: 'document.querySelectorAll("details").forEach(function (d) { d.open = true; }); "Expanded";' },
  { name: 'Speed up videos (2x)', code: 'document.querySelectorAll("video").forEach(function (v) { v.playbackRate = 2; });\ndocument.querySelectorAll("video").length + " video(s) set to 2x";' },
  { name: 'Enable disabled form fields', code: 'var n = 0; document.querySelectorAll("input,select,textarea,button").forEach(function (f) {\n  if (f.disabled) { f.disabled = false; n++; } if (f.readOnly) { f.readOnly = false; n++; }\n}); n + " field(s) unlocked";' },
  { name: 'Copy headings outline', code: 'copy(document.querySelectorAll("h1,h2,h3").map(function (h) {\n  return "  ".repeat(+h.tagName[1] - 1) + h.tagName + " " + h.textContent.trim().slice(0, 70);\n}).join("\\n")); "Outline copied to clipboard";' },
  { name: 'Remove link target=_blank', code: 'var n = 0; document.querySelectorAll("a[target=_blank]").forEach(function (a) { a.target = "_self"; n++; }); n + " link(s) now open in the same tab";' }
];

/* ---------------- snippet library ---------------- */
function buildSnippets() {
  var wrap = h('div');

  /* built-in library */
  var blt = h('.pdt-card');
  blt.appendChild(h('.pdt-label', 'Built-in library (' + BUILTIN_SNIPPETS.length + ')'));
  BUILTIN_SNIPPETS.forEach(function (s) {
    var row = h('.pdt-row', { style: { margin: '4px 0' } }, [
      h('span.pdt-grow', truncate(s.name, 42)),
      h('button.pdt-ib', { type: 'button', title: 'Run', onclick: function () { runSnippet(s); } }, iconEl('play', 15)),
      h('button.pdt-ib', { type: 'button', title: 'Copy to my snippets (editable)', onclick: function () {
        ctx.snippets.push({ id: uid(), name: s.name, code: s.code });
        pdtSet('snippets', ctx.snippets);
        renderUtilsPanel(); toast('Copied to My snippets');
      } }, iconEl('copy', 14))
    ]);
    blt.appendChild(row);
  });
  wrap.appendChild(blt);

  /* user snippets */
  wrap.appendChild(h('.pdt-row', { style: { marginBottom: '10px' } }, [
    h('button.pdt-btn.acc', { type: 'button', onclick: function () { editSnippet(null); } }, [iconEl('plus', 14), 'New snippet'])
  ]));
  if (!ctx.snippets.length) {
    wrap.appendChild(h('.pdt-empty', 'No personal snippets yet. Create your own, or copy one from the built-in library above.'));
    return wrap;
  }
  ctx.snippets.forEach(function (s) {
    wrap.appendChild(h('.pdt-card', [
      h('.pdt-row', [
        h('b.pdt-grow', truncate(s.name, 30)),
        h('button.pdt-ib', { type: 'button', title: 'Run', onclick: function () { runSnippet(s); } }, iconEl('play', 15)),
        h('button.pdt-ib', { type: 'button', title: 'Edit', onclick: function () { editSnippet(s); } }, iconEl('edit', 14)),
        h('button.pdt-ib', { type: 'button', title: 'Delete', onclick: function () {
          confirmModal('Delete snippet "' + s.name + '"?', 'Delete', function () {
            ctx.snippets = ctx.snippets.filter(function (x) { return x.id !== s.id; });
            pdtSet('snippets', ctx.snippets);
            renderUtilsPanel();
          }, true);
        } }, iconEl('trash', 14))
      ]),
      h('pre.pdt-mono', { style: { fontSize: '.8em', color: 'var(--fg2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: '6px' } },
        truncate(s.code, 200))
    ]));
  });
  return wrap;
}
function runSnippet(s) {
  conEcho('input', '/* snippet: ' + s.name + ' */');
  var r = evalInPage(s.code);
  conEmit(r.ok ? 'log' : 'error', [r.ok ? ('\u2190 ' + serialize(r.value, 0)) : serialize(r.value, 0)]);
  switchTab('console');
  toast(r.ok ? 'Snippet ran' : 'Snippet threw an error');
}
function editSnippet(s) {
  var nameEl = h('input.pdt-input', { placeholder: 'Snippet name', value: s ? s.name : '' });
  var codeEl = h('textarea.pdt-area', { rows: 8, placeholder: 'document.body.style.border = "5px solid red";' });
  if (s) codeEl.value = s.code;
  modal(s ? 'Edit snippet' : 'New snippet', function (body, close) {
    body.appendChild(h('.pdt-label', 'Name'));
    body.appendChild(nameEl);
    body.appendChild(h('.pdt-label', 'JavaScript'));
    body.appendChild(codeEl);
    body.appendChild(h('.pdt-mfoot', [
      h('button.pdt-btn', { type: 'button', onclick: close }, 'Cancel'),
      h('button.pdt-btn.acc', { type: 'button', onclick: function () {
        if (!nameEl.value.trim()) { toast('Name required'); return; }
        if (s) {
          s.name = nameEl.value.trim(); s.code = codeEl.value;
        } else {
          ctx.snippets.push({ id: uid(), name: nameEl.value.trim(), code: codeEl.value });
        }
        pdtSet('snippets', ctx.snippets);
        close(); renderUtilsPanel(); toast('Saved');
      } }, 'Save')
    ]));
  });
}

/* ---------------- quick tools ---------------- */
function buildQuickTools() {
  var grid = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } });

  function tool(label, iconName, fn) {
    var b = h('button.pdt-btn', { type: 'button', style: { flexDirection: 'column', minWidth: '31%', minHeight: '64px', gap: '4px', textAlign: 'center' } }, [
      iconEl(iconName, 17), h('span', { style: { fontSize: '.85em' } }, label)
    ]);
    b.addEventListener('click', fn);
    grid.appendChild(b);
  }

  tool(ctx.cssDisabled ? 'Enable CSS' : 'Disable CSS', 'eye', function () {
    ctx.cssDisabled = !ctx.cssDisabled;
    Array.prototype.forEach.call(document.styleSheets, function (ss) {
      try { ss.disabled = ctx.cssDisabled; } catch (e) { /* noop */ }
    });
    Array.prototype.forEach.call(document.querySelectorAll('style'), function (st) {
      try { st.disabled = ctx.cssDisabled; } catch (e) { /* noop */ }
    });
    toast(ctx.cssDisabled ? 'All CSS disabled' : 'CSS re-enabled');
    renderUtilsPanel();
  });

  tool(ctx.outlineOn ? 'Hide outlines' : 'Outline elements', 'inspect', function () {
    ctx.outlineOn = !ctx.outlineOn;
    var st = document.getElementById('pdt-outline');
    if (ctx.outlineOn && !st) {
      st = document.createElement('style');
      st.id = 'pdt-outline';
      st.textContent = '* { outline: 1px solid rgba(255,0,128,.45) !important; outline-offset: -1px !important; }';
      (document.head || document.documentElement).appendChild(st);
    } else if (!ctx.outlineOn && st) {
      st.remove();
    }
    toast(ctx.outlineOn ? 'Element outlines shown' : 'Outlines hidden');
    renderUtilsPanel();
  });

  tool('Find broken images', 'search', function () {
    var broken = Array.prototype.filter.call(document.images, function (img) {
      return img.complete && img.naturalWidth === 0;
    });
    if (!broken.length) { toast('No broken images found'); return; }
    modal('Broken images (' + broken.length + ')', function (body) {
      broken.forEach(function (img, i) {
        body.appendChild(h('.pdt-card', [
          kv('Src', truncate(img.currentSrc || img.src || '(no src)', 70)),
          kv('Alt', truncate(img.alt || '—', 40)),
          h('button.pdt-btn', { type: 'button', style: { marginTop: '6px' }, onclick: function () {
            img.scrollIntoView({ behavior: 'smooth', block: 'center' });
            img.style.outline = '3px solid red';
            setTimeout(function () { img.style.outline = ''; }, 2500);
          } }, [iconEl('eye', 14), 'Scroll to image'])
        ]));
      });
    });
  });

  tool('Clear page storage', 'trash', function () {
    confirmModal('Clear cookies, localStorage and sessionStorage for this page?', 'Clear everything', function () {
      try { localStorage.clear(); } catch (e) { /* noop */ }
      try { sessionStorage.clear(); } catch (e) { /* noop */ }
      cookieMap().forEach(function (c) { delCookieRaw(c.name); });
      toast('Page storage cleared');
    }, true);
  });

  tool('Reset zoom', 'refresh', function () {
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      (document.head || document.documentElement).appendChild(meta);
    }
    meta.content = 'width=device-width, initial-scale=1';
    toast('Viewport reset to device width');
  });

  tool('Edit page (design mode)', 'edit', function () {
    var on = document.designMode === 'on';
    document.designMode = on ? 'off' : 'on';
    toast(on ? 'Page editing off' : 'Page editing on — tap any text to type');
  });

  tool('Unlock copy & menus', 'unlock', function () {
    var n = 0;
    ['contextmenu', 'selectstart', 'dragstart', 'copy', 'cut', 'select'].forEach(function (ev) {
      var key = 'on' + ev;
      [document, document.body, document.documentElement].forEach(function (t) {
        if (t && t[key]) { t[key] = null; n++; }
      });
      document.addEventListener(ev, function (e) { e.stopPropagation(); }, true);
    });
    var st = document.getElementById('pdt-unlock') || document.createElement('style');
    st.id = 'pdt-unlock';
    st.textContent = '* { user-select: auto !important; -webkit-user-select: auto !important; -webkit-touch-callout: default !important; }';
    if (!st.parentNode) (document.head || document.documentElement).appendChild(st);
    toast('Unlocked ' + n + ' handler(s) — selection, copy & long-press restored');
  });

  tool('Reveal passwords', 'eye', function () {
    var fields = document.querySelectorAll('input[type=password]');
    fields.forEach(function (f) { f.type = 'text'; });
    toast(fields.length ? fields.length + ' password field(s) revealed' : 'No password fields on this page');
  });

  tool('Kill sticky elements', 'zap', function () {
    var n = 0;
    document.querySelectorAll('body *').forEach(function (el) {
      if (el.id === 'pdt-host' || (hostEl && hostEl.contains(el))) return;
      var p = '';
      try { p = getComputedStyle(el).position; } catch (e) { return; }
      if (p === 'fixed' || p === 'sticky') {
        el.style.setProperty('position', 'static', 'important');
        el.style.setProperty('top', 'auto', 'important');
        el.style.setProperty('bottom', 'auto', 'important');
        el.style.setProperty('z-index', 'auto', 'important');
        n++;
      }
    });
    document.documentElement.style.setProperty('overflow', 'auto', 'important');
    document.body.style.setProperty('overflow', 'auto', 'important');
    document.body.style.setProperty('position', 'static', 'important');
    document.body.style.setProperty('height', 'auto', 'important');
    toast(n ? 'Reset ' + n + ' pinned element(s), scrolling restored' : 'Nothing pinned found');
  });

  tool('Fullscreen', 'maximize', function () {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch (e) { toast('Fullscreen not available'); }
  });

  tool('Color picker', 'droplet', function () {
    if (typeof EyeDropper === 'function') {
      try {
        new EyeDropper().open().then(function (res) {
          copyText(res.sRGBHex, true);
          conEmit('log', ['EyeDropper: ' + res.sRGBHex + ' (copied)']);
          toast('Picked ' + res.sRGBHex + ' — copied');
        }, function () { /* cancelled */ });
        return;
      } catch (e) { /* fall through */ }
    }
    /* fallback: pick from the selected element */
    var el = ctx.selected;
    if (!el || !el.isConnected) {
      toast('EyeDropper unsupported here — select an element first, then reopen');
      switchTab('elements');
      return;
    }
    var cs = getComputedStyle(el);
    modal('Colors of selected element', function (body) {
      [['color', 'Text'], ['background-color', 'Background'], ['border-top-color', 'Border']].forEach(function (c) {
        var v = cs.getPropertyValue(c[0]);
        body.appendChild(h('.pdt-swatch', [
          h('i', { style: { background: v } }), h('span.pdt-grow', c[1] + ' — ' + v)
        ]));
      });
      body.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em', color: 'var(--muted)' } },
        'The native EyeDropper API is not available in this browser. Select any element in the Elements panel, then open this tool to read its colors.'));
    });
  });

  tool('Save page HTML', 'save', function () {
    var html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    downloadFile((document.title || 'page').replace(/[^\w.-]+/g, '_').slice(0, 40) + '.html', html, 'text/html');
  });

  tool('Highlight links', 'link', function () {
    var st = document.getElementById('pdt-hl-links');
    if (st) { st.remove(); toast('Link highlights removed'); return; }
    st = document.createElement('style');
    st.id = 'pdt-hl-links';
    st.textContent = 'a[href] { outline: 2px solid rgba(0,150,255,.55) !important; outline-offset: 1px !important; background-color: rgba(0,150,255,.08) !important; }';
    (document.head || document.documentElement).appendChild(st);
    toast('All links highlighted');
  });

  tool('Show console errors', 'console', function () {
    var errs = ctx.conEntries.filter(function (e) { return e.level === 'error'; });
    toast(errs.length + ' error(s) captured — see Console');
    switchTab('console');
  });

  return h('div', [h('.pdt-label', 'One-tap tools'), grid,
    h('.pdt-mtext', { style: { color: 'var(--muted)', fontSize: '.85em', marginTop: '10px' } },
      'Tip: combine with Snippets for reusable page fixes. Outline mode helps to see layout structure on small screens.')]);
}

registerPanel({
  id: 'utils', label: 'Utils', icon: 'utils',
  render: function (panel) { panelEls.utils = panel; renderUtilsPanel(); }
});


/* ===== 17-plugins.js ===== */
/*
 * 13-plugins.js — run code / load from URL / manage persistent plugins
 */

function renderPluginsPanel() {
  if (!panelEls.plugins) return;
  var panel = panelEls.plugins;
  panel.textContent = '';

  var sc = h('.pdt-scroll');
  panel.appendChild(sc);

  /* --- run once --- */
  var codeEl = h('textarea.pdt-area', { rows: 6, placeholder: '/* JavaScript to run in the page */\nconsole.log("hello from plugin");' });
  sc.appendChild(h('.pdt-card', [
    h('.pdt-label', 'Run code now'),
    codeEl,
    h('.pdt-row', { style: { marginTop: '8px', flexWrap: 'wrap' } }, [
      h('button.pdt-btn.acc', { type: 'button', onclick: function () {
        if (!codeEl.value.trim()) { toast('Nothing to run'); return; }
        var r = evalInPage(codeEl.value);
        conEcho('input', '/* plugin run */');
        conEmit(r.ok ? 'log' : 'error', [r.ok ? ('\u2190 ' + serialize(r.value, 0)) : serialize(r.value, 0)]);
        toast(r.ok ? 'Code executed' : 'Error — see console');
        switchTab('console');
      } }, [iconEl('play', 14), 'Run']),
      h('button.pdt-btn', { type: 'button', onclick: function () {
        editPlugin({ type: 'code', value: codeEl.value });
      } }, [iconEl('plus', 14), 'Save as plugin'])
    ])
  ]));

  /* --- load from url --- */
  var urlEl = h('input.pdt-input', { type: 'url', placeholder: 'https://example.com/plugin.js', autocapitalize: 'off', spellcheck: 'false' });
  sc.appendChild(h('.pdt-card', [
    h('.pdt-label', 'Load from URL'),
    urlEl,
    h('.pdt-row', { style: { marginTop: '8px', flexWrap: 'wrap' } }, [
      h('button.pdt-btn.acc', { type: 'button', onclick: function () {
        loadPluginFromUrl(urlEl.value, false);
      } }, [iconEl('download', 14), 'Load & run']),
      h('button.pdt-btn', { type: 'button', onclick: function () {
        loadPluginFromUrl(urlEl.value, true);
      } }, [iconEl('plus', 14), 'Save & run'])
    ]),
    h('.pdt-mtext', { style: { fontSize: '.82em', marginTop: '8px' } },
      'Remote code runs in the page. Sites with a strict CSP may block it.')
  ]));

  /* --- saved list --- */
  sc.appendChild(h('.pdt-label', 'Saved plugins (' + ctx.plugins.length + ')'));
  if (!ctx.plugins.length) {
    sc.appendChild(h('.pdt-empty', 'No saved plugins.\nSaved plugins can auto-run when DevTools loads.'));
  }
  ctx.plugins.forEach(function (p) {
    var autoChip = h('button.pdt-chip' + (p.auto ? '.on' : ''), p.auto ? 'Auto-run on' : 'Auto-run off');
    autoChip.addEventListener('click', function () {
      p.auto = !p.auto;
      pdtSet('plugins', ctx.plugins);
      renderPluginsPanel();
    });
    sc.appendChild(h('.pdt-card', [
      h('.pdt-row', [
        h('b.pdt-grow', truncate(p.name, 28)),
        h('button.pdt-ib', { type: 'button', title: 'Run', onclick: function () { runPlugin(p, true); } }, iconEl('play', 15)),
        h('button.pdt-ib', { type: 'button', title: 'Edit', onclick: function () { editPlugin(p); } }, iconEl('edit', 14)),
        h('button.pdt-ib', { type: 'button', title: 'Delete', onclick: function () {
          confirmModal('Delete plugin "' + p.name + '"?', 'Delete', function () {
            ctx.plugins = ctx.plugins.filter(function (x) { return x.id !== p.id; });
            pdtSet('plugins', ctx.plugins);
            renderPluginsPanel();
          }, true);
        } }, iconEl('trash', 14))
      ]),
      h('.pdt-row', { style: { marginTop: '6px' } }, [autoChip,
        h('span.pdt-ver', p.type === 'url' ? truncate(p.value, 42) : 'inline code')])
    ]));
  });
}

function loadPluginFromUrl(url, save) {
  url = String(url || '').trim();
  if (!/^https?:\/\//i.test(url)) { toast('Enter a valid http(s) URL'); return; }
  fetch(url).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }).then(function (code) {
    var r = evalInPage(code);
    conEmit(r.ok ? 'log' : 'error', ['Plugin loaded from ' + clipUrl(url) + (r.ok ? ' OK' : ' FAILED')]);
    if (r.ok && save) {
      var name = url.split('/').pop() || 'plugin';
      ctx.plugins.push({ id: uid(), name: name, type: 'url', value: url, auto: false });
      pdtSet('plugins', ctx.plugins);
      renderPluginsPanel();
    }
    toast(r.ok ? 'Plugin executed' : 'Plugin error — see console');
  }, function (err) {
    toast('Could not load: ' + (err && err.message || err));
  });
}

function runPlugin(p, notify) {
  if (p.type === 'url') {
    fetch(p.value).then(function (r) { return r.text(); }).then(function (code) {
      var r = evalInPage(code);
      if (notify) toast(r.ok ? 'Plugin executed' : 'Plugin error');
      conEmit(r.ok ? 'log' : 'error', ['Plugin "' + p.name + '"' + (r.ok ? ' ran' : ' FAILED')]);
    }, function () { toast('Could not fetch plugin URL'); });
  } else {
    var r = evalInPage(p.value);
    if (notify) toast(r.ok ? 'Plugin executed' : 'Plugin error — see console');
    conEmit(r.ok ? 'log' : 'error', ['Plugin "' + p.name + '"' + (r.ok ? ' ran' : ' FAILED')]);
  }
}

function editPlugin(p) {
  var isNewName = !p.name;
  var nameEl = h('input.pdt-input', { placeholder: 'Plugin name', value: p.name || '' });
  var typeSel = h('select.pdt-select', [
    h('option', { value: 'code' }, 'Inline code'),
    h('option', { value: 'url' }, 'URL')
  ]);
  typeSel.value = p.type || 'code';
  var valEl = h('textarea.pdt-area', { rows: 7, placeholder: p.type === 'url' ? 'https://…' : '/* code */' });
  valEl.value = p.value || '';
  typeSel.addEventListener('change', function () {
    valEl.placeholder = typeSel.value === 'url' ? 'https://…' : '/* code */';
  });
  modal(isNewName ? 'Save plugin' : 'Edit plugin', function (body, close) {
    body.appendChild(h('.pdt-label', 'Name'));
    body.appendChild(nameEl);
    body.appendChild(h('.pdt-label', 'Type'));
    body.appendChild(typeSel);
    body.appendChild(h('.pdt-label', typeSel.value === 'url' ? 'URL' : 'JavaScript'));
    body.appendChild(valEl);
    body.appendChild(h('.pdt-mfoot', [
      h('button.pdt-btn', { type: 'button', onclick: close }, 'Cancel'),
      h('button.pdt-btn.acc', { type: 'button', onclick: function () {
        if (!nameEl.value.trim()) { toast('Name required'); return; }
        p.name = nameEl.value.trim();
        p.type = typeSel.value;
        p.value = valEl.value;
        if (isNewName) ctx.plugins.push(p);
        pdtSet('plugins', ctx.plugins);
        close(); renderPluginsPanel(); toast('Plugin saved');
      } }, 'Save')
    ]));
  });
}

/* auto-run persisted plugins */
function autorunPlugins() {
  ctx.plugins.filter(function (p) { return p.auto; }).forEach(function (p) {
    runPlugin(p, false);
  });
}

registerPanel({
  id: 'plugins', label: 'Plugins', icon: 'plugins',
  render: function (panel) { panelEls.plugins = panel; renderPluginsPanel(); }
});


/* ===== 18-settings.js ===== */
/*
 * 14-settings.js — themes, panel height, font size, capture limits, reset, about
 */

function renderSettingsPanel() {
  if (!panelEls.settings) return;
  var panel = panelEls.settings;
  panel.textContent = '';
  var sc = h('.pdt-scroll');
  panel.appendChild(sc);

  /* --- theme --- */
  sc.appendChild(h('.pdt-label', 'Theme'));
  var tg = h('.pdt-themegrid');
  [['dark', 'Dark', '#1e1f24', '#5b9dff'], ['light', 'Light', '#ffffff', '#2563eb'],
   ['amoled', 'AMOLED', '#000000', '#6ea8ff'], ['auto', 'Auto', 'linear-gradient(135deg,#1e1f24 50%,#fff 50%)', '#5b9dff']].forEach(function (t) {
    var card = h('.pdt-themecard' + (settings.theme === t[0] ? '.on' : ''), [
      h('.pv', [
        h('i', { style: { background: t[2], height: '10px' } }),
        h('i', { style: { background: t[3], height: '16px' } })
      ]),
      h('.nm', t[1])
    ]);
    card.addEventListener('click', function () {
      settings.theme = t[0];
      saveSettings();
      applyTheme();
      renderSettingsPanel();
      toast(t[0] === 'auto' ? 'Theme: match system' : 'Theme: ' + t[1]);
    });
    tg.appendChild(card);
  });
  sc.appendChild(tg);
  sc.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em' } },
    'AMOLED uses a pure black background to save battery on OLED screens. Auto follows your system dark-mode setting.'));

  /* --- panel height --- */
  sc.appendChild(h('.pdt-label', 'Panel height: ' + settings.panelHeight + '%'));
  var heightRange = h('input', { type: 'range', min: '30', max: '90', step: '1', value: String(settings.panelHeight) });
  heightRange.addEventListener('input', function () {
    settings.panelHeight = parseInt(heightRange.value, 10);
    sheetEl.style.setProperty('--ph', settings.panelHeight + '%');
    var lbl = sc.querySelector('.pdt-label');
    if (lbl) lbl.textContent = 'Panel height: ' + settings.panelHeight + '%';
  });
  heightRange.addEventListener('change', saveSettings);
  sc.appendChild(heightRange);

  /* --- font size --- */
  sc.appendChild(h('.pdt-label', 'Panel text size'));
  var seg = h('.pdt-seg');
  [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']].forEach(function (f) {
    var b = h('button' + (settings.fontSize === f[0] ? '.on' : ''), f[1]);
    b.addEventListener('click', function () {
      settings.fontSize = f[0];
      app.dataset.fs = f[0];
      saveSettings();
      renderSettingsPanel();
    });
    seg.appendChild(b);
  });
  sc.appendChild(seg);

  /* --- console cap --- */
  sc.appendChild(h('.pdt-label', 'Keep last (console entries)'));
  var segC = h('.pdt-seg');
  [[100, '100'], [500, '500'], [2000, '2000']].forEach(function (c) {
    var b = h('button' + (settings.maxConsole === c[0] ? '.on' : ''), c[1]);
    b.addEventListener('click', function () {
      settings.maxConsole = c[0];
      saveSettings();
      renderSettingsPanel();
    });
    segC.appendChild(b);
  });
  sc.appendChild(segC);

  /* --- network body capture --- */
  sc.appendChild(h('.pdt-label', 'Capture response bodies (network)'));
  var segN = h('.pdt-seg');
  [[0, 'Off'], [16384, '16 KB'], [65536, '64 KB'], [262144, '256 KB']].forEach(function (n) {
    var b = h('button' + (settings.netBodyLimit === n[0] ? '.on' : ''), n[1]);
    b.addEventListener('click', function () {
      settings.netBodyLimit = n[0];
      saveSettings();
      renderSettingsPanel();
    });
    segN.appendChild(b);
  });
  sc.appendChild(segN);

  /* --- FAB --- */
  var fabRow = h('.pdt-card', [
    kv('Show floating button', settings.showFAB ? 'on' : 'off'),
    h('button.pdt-btn' + (settings.showFAB ? '.on' : ''), { type: 'button', style: { marginTop: '8px' } }, settings.showFAB ? 'Hide FAB' : 'Show FAB')
  ]);
  var fabBtn = fabRow.querySelector('button');
  fabBtn.addEventListener('click', function () {
    settings.showFAB = !settings.showFAB;
    saveSettings();
    positionFab();
    renderSettingsPanel();
  });
  sc.appendChild(h('.pdt-label', 'Floating button'));
  sc.appendChild(fabRow);

  /* --- persistence (userscript edition) --- */
  sc.appendChild(h('.pdt-label', [iconEl('repeat', 14), ' Persistence (refresh survival)']));
  var modeCard = h('.pdt-card', [
    kv('Edition', IS_USERSCRIPT ? 'Userscript — survives refresh' : 'Bookmarklet — one-shot per page load'),
    kv('Capture starts', IS_USERSCRIPT ? 'document-start (before page scripts run)' : 'when you tap the bookmarklet')
  ]);
  if (!IS_USERSCRIPT) {
    modeCard.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em', marginTop: '8px' } },
      'Bookmarklets are wiped by every refresh — that is browser security, not a bug. ' +
      'Install the userscript edition (pocket-devtools.user.js, see README) to keep the tools, ' +
      'their settings and the open panel across reloads; it also captures errors that happen ' +
      'during page startup, which a bookmarklet can never see.'));
  } else {
    modeCard.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em', marginTop: '8px' } },
      'Active on every page load. If the panel was open when you refreshed, it reopens by itself; ' +
      'if it was closed, only the floating button stays. Capture starts before the page\u2019s own scripts run.'));
  }
  sc.appendChild(modeCard);

  var usRow = h('.pdt-row', { style: { flexWrap: 'wrap' } });
  [['usEnabled', 'Auto-inject on every page'],
   ['usAutoOpenSheet', 'Always open panel on load']].forEach(function (t) {
    var on = !!settings[t[0]];
    var b = h('button.pdt-btn' + (on ? '.on' : ''), { type: 'button', style: { flex: '1 1 auto' } },
      [iconEl(on ? 'check' : 'close', 14), ' ' + t[1]]);
    b.addEventListener('click', function () {
      settings[t[0]] = !settings[t[0]];
      saveSettings();
      renderSettingsPanel();
      toast(t[1] + ': ' + (settings[t[0]] ? 'on' : 'off'));
    });
    usRow.appendChild(b);
  });
  sc.appendChild(usRow);

  sc.appendChild(h('.pdt-label', 'Never inject on these sites (userscript)'));
  var exTa = h('textarea.pdt-area', { rows: 2, spellcheck: 'false',
    placeholder: 'one host per line, e.g. mail.google.com' });
  exTa.value = settings.usExcluded || '';
  exTa.addEventListener('change', function () {
    settings.usExcluded = exTa.value.trim();
    saveSettings();
    toast('Exclusion list saved — applies from the next page load');
  });
  sc.appendChild(exTa);
  sc.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em' } },
    'Matching is by substring of the site\u2019s host, one entry per line or comma-separated. ' +
    'Excluded sites run zero Pocket DevTools code — no hooks, no button.'));

  /* --- data export / import --- */
  sc.appendChild(h('.pdt-label', 'Data'));
  sc.appendChild(h('.pdt-row', { style: { flexWrap: 'wrap' } }, [
    h('button.pdt-btn', { type: 'button', onclick: function () {
      var payload = {
        app: 'Pocket DevTools', version: VERSION, exported: new Date().toISOString(),
        settings: settings, snippets: ctx.snippets, plugins: ctx.plugins,
        blocklist: ctx.blockList, history: ctx.history
      };
      downloadFile('pocket-devtools-backup.json', JSON.stringify(payload, null, 2), 'application/json');
    } }, [iconEl('save', 14), 'Export data']),
    h('button.pdt-btn', { type: 'button', onclick: function () {
      var inp = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          try {
            var data = JSON.parse(String(fr.result));
            if (!data || data.app !== 'Pocket DevTools') { toast('Not a Pocket DevTools backup file'); return; }
            if (Array.isArray(data.snippets)) { ctx.snippets = ctx.snippets.concat(data.snippets); }
            if (Array.isArray(data.plugins)) { ctx.plugins = ctx.plugins.concat(data.plugins); }
            if (Array.isArray(data.blocklist)) { ctx.blockList = ctx.blockList.concat(data.blocklist); }
            if (data.settings) { for (var k in data.settings) settings[k] = data.settings[k]; }
            pdtSet('snippets', ctx.snippets); pdtSet('plugins', ctx.plugins); pdtSet('blocklist', ctx.blockList);
            saveSettings();
            applyTheme(); app.dataset.fs = settings.fontSize;
            sheetEl.style.setProperty('--ph', settings.panelHeight + '%');
            positionFab(); renderSettingsPanel();
            toast('Backup imported');
          } catch (e) { toast('Import failed: invalid JSON'); }
        };
        fr.readAsText(f);
      });
      sc.appendChild(inp);
      inp.click();
    } }, [iconEl('upload', 14), 'Import data'])
  ]));
  sc.appendChild(h('.pdt-row', { style: { flexWrap: 'wrap' } }, [
    h('button.pdt-btn.danger', { type: 'button', onclick: function () {
      confirmModal('Reset all Pocket DevTools settings to defaults? (Snippets and plugins are kept)', 'Reset', function () {
        try { localStorage.removeItem('pdt:settings'); } catch (e) { /* noop */ }
        settings = loadSettings();
        applyTheme();
        if (app) app.dataset.fs = settings.fontSize;
        if (sheetEl) sheetEl.style.setProperty('--ph', settings.panelHeight + '%');
        positionFab();
        renderSettingsPanel();
        toast('Settings reset');
      }, true);
    } }, [iconEl('refresh', 14), 'Reset settings']),
    h('button.pdt-btn', { type: 'button', onclick: function () {
      copyText('Pocket DevTools v' + VERSION + '\n' + location.href + '\n' + navigator.userAgent);
    } }, [iconEl('copy', 14), 'Copy diagnostics'])
  ]));

  /* --- about --- */
  sc.appendChild(h('.pdt-label', 'About'));
  sc.appendChild(h('.pdt-card', [
    kv('Version', 'v' + VERSION),
    kv('Fork of', 'DeveloperExotic/Bookmarklet-Dev-Tools'),
    kv('License', 'MIT'),
    h('.pdt-mtext', { style: { fontSize: '.82em', marginTop: '8px' } },
      'Pocket DevTools is a from-scratch rewrite for mobile browsers (Android Firefox first). ' +
      'It runs entirely in your browser — no data leaves the device.')
  ]));
}

registerPanel({
  id: 'settings', label: 'Settings', icon: 'settings',
  render: function (panel) { panelEls.settings = panel; renderSettingsPanel(); },
  onShow: renderSettingsPanel
});


/* ===== 19-footer.js ===== */
/*
 * 16-footer.js — boot sequence and public API
 */

function start() {
  document.removeEventListener('DOMContentLoaded', start);
  try {
    buildShell();
  } catch (e) {
    try { nativeCon.error && nativeCon.error('Pocket DevTools failed to start: ' + (e && (e.message || e))); } catch (e2) { /* noop */ }
    return;
  }
  autorunPlugins();
  conEcho('log', 'Pocket DevTools v' + VERSION + (IS_USERSCRIPT ? ' (userscript edition)' : '') + ' ready — ' + (location.host || 'page') +
    (IS_USERSCRIPT ? '\nHooks have been active since document-start — capture survives page refresh.' : '') +
    '\nPanels: Console, Elements, Styles, Network, Page, Sources, Storage, Perf, Utils, Plugins, Settings' +
    '\nHelpers: $ $0 $$ $x $_ copy clear inspect keys values getListeners');
}

function boot() {
  /* Userscript @run-at document-start: the console / network hooks are already
   * installed (they run at script evaluation, before this line). The UI needs
   * a parsed document, so defer the shell until the DOM is ready. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
    return;
  }
  start();
}

/* public API — usable from the console, snippets or plugins */
window.__POCKET_DEVTOOLS__ = {
  version: VERSION,
  edition: IS_USERSCRIPT ? 'userscript' : 'bookmarklet',
  toggle: function () { toggleSheet(); },
  open: function () { openSheet(); },
  close: function () { closeSheet(); },
  inspect: function () { toggleInspect(); },
  select: function (el) { selectElement(el); },
  tab: function (id) { switchTab(id); },
  run: function (code) { return evalInPage(code); },
  entries: function () { return ctx.conEntries.slice(); },
  requests: function () { return ctx.netEntries.slice(); },
  listeners: function (el) { return listenersFor(el); },
  har: function () { return buildHar(); },
  exportHar: exportHar,
  block: function (pattern) {
    ctx.blockList.push({ pattern: String(pattern), on: true });
    saveBlockList();
    return 'Blocked: ' + pattern;
  },
  unblockAll: function () {
    var n = ctx.blockList.length;
    ctx.blockList = [];
    saveBlockList();
    return 'Removed ' + n + ' rule(s)';
  },
  blocklist: function () { return ctx.blockList.slice(); },
  $0: function () { return ctx.selected; },
  clearConsole: conClear,
  /* debug/testing handle */
  _app: function () { return app; },
  _dump: function () {
    var active = app.querySelector('.pdt-panel.on');
    return JSON.stringify({
      activeTab: ctx.activeTab,
      panels: Object.keys(panelEls),
      activePanelChildren: active ? active.children.length : -1,
      activePanelHtml: active ? active.innerHTML.slice(0, 300) : '(none)'
    });
  }
};

boot();

})();
