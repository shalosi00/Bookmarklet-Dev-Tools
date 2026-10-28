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

  var VERSION = '5.3.0';

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
  stab().diag.bootTime = Date.now();

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
  onEvt(window, 'pagehide', function () {
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
    fabHidden: false,               /* FAB hidden via its × badge (this load only) */
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
