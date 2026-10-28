/*
 * 04-shell.js — host element, closed shadow root, bottom sheet, tabs, FAB, drag-resize
 */

var hostEl = null, root = null, app = null, sheetEl = null, tabsEl = null, bodyEl = null, fabEl = null;
var panelDefs = [];
var panelEls = {};

function registerPanel(def) { panelDefs.push(def); }

var mq = (typeof matchMedia === 'function') ? matchMedia('(prefers-color-scheme: dark)') : null;
var keysInstalled = false;   /* setupKeys must survive restartUI without stacking listeners */

function resolvedTheme() {
  if (settings.theme === 'auto') return (mq && mq.matches) ? 'dark' : 'light';
  return settings.theme;
}
function applyTheme() {
  if (app) app.dataset.theme = resolvedTheme();
}
if (mq && mq.addEventListener) {
  onEvt(mq, 'change', function () { if (settings.theme === 'auto') applyTheme(); });
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
  if (wantOpen) requestAnimationFrame(safe(function () { openSheet(); }, 'boot.open'));

  buildTabs();
  switchTab(ctx.activeTab);
  setupResizeDrag();
  setupKeys();
  /* Did the page's Content-Security-Policy let our <style> through? */
  requestAnimationFrame(safe(checkStyleApplied, 'styleCheck'));
}

/* ---------------- tabs ---------------- */
function buildTabs() {
  panelDefs.forEach(function (p) {
    var b = h('button.pdt-tab', { type: 'button', dataset: { tab: p.id } }, [iconEl(p.icon, 14), p.label]);
    b.addEventListener('click', safe(function () { switchTab(p.id); }, 'tab.' + p.id));
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
      pdError(e, 'render:' + def.id);
      panel.appendChild(h('.pdt-empty', 'Panel error: ' + (e && e.message)));
      conEmit('error', ['Panel "' + def.id + '" failed to render: ' + (e && (e.message || e))]);
    }
  }
  var cur = root.querySelector('.pdt-tab[data-tab="' + id + '"]');
  if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (e) { /* noop */ } }
  if (def.onShow) { try { def.onShow(); } catch (e) { pdError(e, 'onShow:' + def.id); } }
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

/* ---------------- resize drag (handle + title) ----------------
 * Mobile bottom-sheet gestures:
 *   - drag up/down            -> resize panel (22%..92% of viewport)
 *   - flick down / big drag   -> close the sheet (what a finger expects)
 *   - tap without moving      -> toggle maximize / restore
 * The drag zone is the handle strip plus the title row (big touch targets,
 * buttons excluded). */
function setupResizeDrag() {
  function attachDrag(zone) {
    var dragging = false, moved = false, startY = 0, startH = 0, startPct = 0;
    var lastY = 0, lastT = 0, vel = 0, maxedFrom = null;
    zone.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button > 0) return; /* primary touches/clicks only */
      dragging = true; moved = false;
      startY = lastY = e.clientY; lastT = Date.now(); vel = 0;
      startH = sheetEl.getBoundingClientRect().height;
      startPct = (startH / (window.innerHeight || 1)) * 100;
      sheetEl.classList.add('nodrag');
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      e.preventDefault();
    });
    zone.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dy = e.clientY - startY;
      if (!moved && Math.abs(dy) < 6) return;
      moved = true;
      var now = Date.now(), dt = now - lastT;
      if (dt > 0 && dt < 200) vel = vel * 0.7 + ((e.clientY - lastY) / dt) * 0.3;
      lastY = e.clientY; lastT = now;
      var vh = window.innerHeight || 1;
      var pct = ((startH - dy) / vh) * 100;
      pct = Math.max(22, Math.min(92, pct));
      sheetEl.style.setProperty('--ph', pct + '%');
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      sheetEl.classList.remove('nodrag');
      if (e && e.type === 'pointercancel') {
        /* the browser stole the gesture (scroll/zoom took over) — abort
         * cleanly: restore the pre-drag height, never close, never save */
        sheetEl.style.setProperty('--ph', startPct + '%');
        return;
      }
      var totalDy = lastY - startY;
      if (!moved) {
        /* tap on the handle/title: toggle maximize */
        var cur = settings.panelHeight;
        if (cur < 80) { maxedFrom = cur; settings.panelHeight = 90; }
        else settings.panelHeight = (maxedFrom != null ? maxedFrom : 55);
        sheetEl.style.setProperty('--ph', settings.panelHeight + '%');
        saveSettings();
        return;
      }
      if (vel > 0.55 && totalDy > 30) { restoreThenClose(); return; }   /* flick down */
      if (totalDy > 130) { restoreThenClose(); return; }                 /* big drag down */
      var vh = window.innerHeight || 1;
      settings.panelHeight = Math.round(Math.max(22, Math.min(92,
        (sheetEl.getBoundingClientRect().height / vh) * 100)));
      saveSettings();
    }
    function restoreThenClose() {
      /* closing a flick: bring back the pre-drag height so the next open
       * is the size the user chose before, not the half-dragged one */
      sheetEl.style.setProperty('--ph', startPct + '%');
      closeSheet();
    }
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }
  attachDrag(sheetEl.querySelector('.pdt-handle'));
  var title = sheetEl.querySelector('.pdt-title');
  if (title) attachDrag(title);
}

/* ---------------- FAB ---------------- */
function positionFab() {
  if (!fabEl) return;
  if (settings.fabX != null && settings.fabY != null) {
    fabEl.style.left = settings.fabX + '%';
    fabEl.style.top = settings.fabY + '%';
    fabEl.style.right = 'auto'; fabEl.style.bottom = 'auto';
  } else {
    fabEl.style.left = 'auto'; fabEl.style.top = 'auto';
    fabEl.style.right = '14px'; fabEl.style.bottom = '18px';
  }
  fabEl.style.display = (settings.showFAB && !ctx.fabHidden) ? 'flex' : 'none';
}
function hideFab(userAction) {
  ctx.fabHidden = true;          /* in-memory only: a refresh or re-tap of the
                                  * bookmarklet always brings the icon back */
  positionFab();
  if (userAction) toast('Icon hidden \u2014 tap the bookmarklet again to bring it back');
}
function showFab() {
  ctx.fabHidden = false;
  settings.showFAB = true;
  saveSettings();
  positionFab();
}
function setupFabDrag() {
  var FAB_SIZE = 52;
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
    var x = Math.max(0, Math.min(r.width - FAB_SIZE, e.clientX - FAB_SIZE / 2));
    var y = Math.max(0, Math.min(r.height - FAB_SIZE, e.clientY - FAB_SIZE / 2));
    fabEl.style.left = x + 'px'; fabEl.style.top = y + 'px';
    fabEl.style.right = 'auto'; fabEl.style.bottom = 'auto';
  });
  fabEl.addEventListener('pointerup', function (e) {
    if (moved) {
      var r = app.getBoundingClientRect();
      var wPct = (FAB_SIZE / r.width) * 100, hPct = (FAB_SIZE / r.height) * 100;
      var xPct = ((parseFloat(fabEl.style.left) + FAB_SIZE / 2) / r.width) * 100;
      var yPct = ((parseFloat(fabEl.style.top) + FAB_SIZE / 2) / r.height) * 100;
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
  /* --- close badge on the FAB: hides the icon until the next load --- */
  var fabX = h('button.pdt-fabx', { type: 'button', title: 'Hide floating icon', 'aria-label': 'Hide floating icon' });
  fabX.innerHTML = iconSvg('close', 11);
  fabX.addEventListener('pointerdown', function (e) { e.stopPropagation(); e.preventDefault(); });
  fabX.addEventListener('pointerup', function (e) {
    e.stopPropagation(); e.preventDefault();
    hideFab(true);
  });
  fabX.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); });
  fabEl.appendChild(fabX);
}

/* ---------------- keyboard shortcuts (desktop) ---------------- */
function setupKeys() {
  if (keysInstalled) return;   /* restartUI() rebuilds the shell — never stack handlers */
  keysInstalled = true;
  onEvt(document, 'keydown', function (e) {
    if (e.key === 'Escape') {
      if (inspectOn) { stopInspect(true); return; }
      var mo = root && root.querySelector('.pdt-mov');
      if (mo) { mo.remove(); return; }
      closeSheet();
    }
    if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault(); toggleInspect();
    }
  }, true);
}
