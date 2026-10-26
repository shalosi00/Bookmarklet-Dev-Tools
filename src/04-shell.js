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
  requestAnimationFrame(function () { openSheet(); });

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
}

/* ---------------- open/close ---------------- */
function openSheet() {
  sheetEl.classList.add('open');
  app.classList.add('sheet-open');
  if (ctx.activeTab) switchTab(ctx.activeTab);
}
function closeSheet() {
  sheetEl.classList.remove('open');
  app.classList.remove('sheet-open');
  if (inspectOn) stopInspect(true);
}
function toggleSheet() { sheetEl.classList.contains('open') ? closeSheet() : openSheet(); }

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
