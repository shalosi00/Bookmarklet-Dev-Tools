/*
 * 19-footer.js — boot sequence and public API
 */

/* Drop every module-level element reference so a rebuilt shell starts clean.
 * All names live in the shared IIFE scope, so this one function can reset
 * them all. Used by restartUI() and destroyTool(). */
function resetPanelRefs() {
  hostEl = root = app = sheetEl = tabsEl = bodyEl = fabEl = null;
  panelEls = {};
  conListEl = null; conInputEl = null;
  netListEl = null; netDetailId = null; netCountEl = null; netRowsById = {};
  elTreeEl = elDetailEl = elEvEl = null;
  fpsNumEl = fpsCanvasEl = null;
  ctx.conRendered = 0;
}

function start() {
  document.removeEventListener('DOMContentLoaded', start);
  try {
    buildShell();
  } catch (e) {
    pdError(e, 'boot');
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
    document.addEventListener('DOMContentLoaded', safe(start, 'DOMContentLoaded'));
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
  hideFab: function () { hideFab(true); return 'Floating icon hidden for this page load'; },
  showFab: function () { showFab(); return 'Floating icon restored'; },
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
  /* --- stability API (v5.2) --- */
  diagnostics: function () { return collectDiagnostics(); },
  errors: function () { return stab().errors.slice(); },
  restartUI: function () { restartUI(); return 'UI restarted'; },
  destroy: function () { destroyTool(); return 'Pocket DevTools unloaded'; },
  /* debug/testing handle */
  _app: function () { return app; },
  _dump: function () {
    var active = app ? app.querySelector('.pdt-panel.on') : null;
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
