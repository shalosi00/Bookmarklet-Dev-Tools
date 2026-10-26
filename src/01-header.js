/*
 * Pocket DevTools v4.0 — mobile-first developer tools as a bookmarklet.
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

  var VERSION = '4.0.0';

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
    fabX: null, fabY: null
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
  var saveTimer = null;
  function saveSettings() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem('pdt:settings', JSON.stringify(settings)); } catch (e) { /* noop */ }
    }, 250);
  }

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

  /* ------------------------------------------------------------------ *
   * Shared context
   * ------------------------------------------------------------------ */
  var ctx = {
    selected: null,                 /* currently selected element */
    activeTab: 'console',
    netEntries: [], netSeq: 0, netPaused: false,
    conEntries: [], conRendered: 0,
    conFilters: { log: true, info: true, warn: true, error: true },
    conSearch: '',
    history: pdtGet('history', []),
    cssDisabled: false,
    outlineOn: false,
    snippets: pdtGet('snippets', []),
    plugins: pdtGet('plugins', [])
  };

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
