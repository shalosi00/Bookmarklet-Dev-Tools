/*
 * 15-footer.js — boot sequence and public API
 */

function boot() {
  try {
    buildShell();
  } catch (e) {
    try { nativeCon.error && nativeCon.error('Pocket DevTools failed to start: ' + (e && (e.message || e))); } catch (e2) { /* noop */ }
    return;
  }
  autorunPlugins();
  conEcho('log', 'Pocket DevTools v' + VERSION + ' ready — ' + (location.host || 'page') +
    '\nPanels: Console, Elements, Styles, Network, Sources, Storage, Perf, Utils, Plugins, Settings');
}

/* public API — usable from the console, snippets or plugins */
window.__POCKET_DEVTOOLS__ = {
  version: VERSION,
  toggle: function () { toggleSheet(); },
  open: function () { openSheet(); },
  close: function () { closeSheet(); },
  inspect: function () { toggleInspect(); },
  select: function (el) { selectElement(el); },
  tab: function (id) { switchTab(id); },
  run: function (code) { return evalInPage(code); },
  entries: function () { return ctx.conEntries.slice(); },
  requests: function () { return ctx.netEntries.slice(); },
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
