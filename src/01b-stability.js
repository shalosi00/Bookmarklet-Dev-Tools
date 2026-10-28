/*
 * 01b-stability.js — the "maximum stability" layer.
 *
 * Everything the tool runs — UI handlers, console/network hooks, timers,
 * animation frames — is wrapped in a central error boundary (safe()) that
 * RECORDS the failure instead of letting it escape into the page. A devtool
 * must never be the reason a page breaks.
 *
 * Also provides:
 *   - tracked listeners (onEvt) and timers, so destroyTool() can undo all
 *     of them and restore every patched native (console, fetch, XHR, WS, ...)
 *   - restartUI(): rebuild the whole sheet without losing capture or a page
 *     refresh (recover from a wedged UI)
 *   - CSP detection + critical inline-style fallback for pages whose
 *     Content-Security-Policy blocks our <style> element
 *   - collectDiagnostics(): self-health report surfaced in Settings
 */

/* Lazily-initialized state: 01-header.js executes before this file is
 * concatenated-in, but function declarations hoist to the top of the IIFE —
 * so stab() is callable from anywhere at any time. */
var _stab = null;
var natives = { conDesc: {} };   /* original refs saved by the hook modules */

function stab() {
  if (!_stab) _stab = {
    errors: [],          /* last 50 internal errors {t, where, msg} */
    errToastAt: 0,       /* throttle for the "internal error" toast */
    listeners: [],       /* every listener we attached via onEvt */
    timers: [],          /* every interval/timeout we track */
    diag: {
      bootTime: Date.now(),
      console: null,     /* console patched?       true/false */
      fetch: null,       /* fetch hooked?          */
      xhr: null,         /* XHR hooked?            */
      ws: null,          /* WebSocket hooked?      */
      beacon: null,      /* sendBeacon hooked?     */
      ael: null,         /* listener capture on?   */
      styleApplied: null /* our <style> honoured?  true/false/null=unknown */
    }
  };
  return _stab;
}

/* ---------------- error boundary ---------------- */
function pdError(err, where) {
  var S = stab();
  var msg = '(unavailable)';
  try { msg = String(err && (err.stack || err.message) || err); } catch (e) { /* noop */ }
  try {
    S.errors.push({ t: Date.now(), where: where || '?', msg: truncate(msg, 500) });
    if (S.errors.length > 50) S.errors.shift();
  } catch (e) { /* even the recorder must never throw */ }
  /* surface briefly — throttled so a storm of errors cannot spam toasts */
  try {
    var now = Date.now();
    if (app && now - S.errToastAt > 10000) {
      S.errToastAt = now;
      toast('Internal error caught (' + (where || '?') + ') — see Settings \u2192 Diagnostics');
    }
  } catch (e) { /* noop */ }
}

/* safe(fn) -> wrapped fn: same this/arguments, exceptions recorded, never thrown */
function safe(fn, where) {
  return function () {
    try { return fn.apply(this, arguments); }
    catch (e) { pdError(e, where || (fn && fn.name) || 'anon'); return undefined; }
  };
}

/* ---------------- tracked listeners & timers ---------------- */
function onEvt(target, type, fn, opts) {
  var wrapped = safe(fn, 'evt:' + type);
  try { target.addEventListener(type, wrapped, opts || false); }
  catch (e) { return null; }
  try { stab().listeners.push({ t: target, type: type, fn: wrapped, opts: opts || false }); } catch (e) { /* noop */ }
  return wrapped;
}
function pdEvery(fn, ms, where) {
  var id = setInterval(safe(fn, where || 'interval'), ms);
  stab().timers.push({ id: id, kind: 'i' });
  return id;
}
function pdAfter(fn, ms, where) {
  var id = setTimeout(safe(fn, where || 'timeout'), ms);
  stab().timers.push({ id: id, kind: 't' });
  return id;
}

/* ---------------- CSP: did our stylesheet actually apply? ---------------- */
function checkStyleApplied() {
  try {
    if (!app) return;
    /* .pdt-root must be position:absolute per 03-css.js; a blocked <style>
     * leaves it static */
    var pos = getComputedStyle(app).position;
    stab().diag.styleApplied = (pos === 'absolute');
    if (!stab().diag.styleApplied) {
      applyCriticalFallback();
      conEmit('warn', ['Pocket DevTools: this page\u2019s Content-Security-Policy blocks the tools\u2019 stylesheet — using minimal fallback styles.']);
    }
  } catch (e) { stab().diag.styleApplied = null; }
}

/* Minimal inline styles so the sheet stays visible & usable without CSS.
 * Inline style attributes survive style-src rules that block <style> blocks. */
function applyCriticalFallback() {
  try {
    app.style.cssText += ';position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;' +
      'z-index:2147483647;font-family:-apple-system,Roboto,sans-serif;font-size:13px;color:#e8eaed;';
    sheetEl.style.cssText += ';position:absolute;left:0;right:0;bottom:0;height:55%;min-height:180px;' +
      'display:flex;flex-direction:column;pointer-events:auto;background:#1e1f24;color:#e8eaed;' +
      'border-top:1px solid #3a3d45;box-shadow:0 -10px 40px rgba(0,0,0,.5);';
    fabEl.style.cssText += ';position:absolute;width:52px;height:52px;border-radius:50%;background:#5b9dff;' +
      'border:0;color:#fff;display:flex;align-items:center;justify-content:center;' +
      'pointer-events:auto;box-shadow:0 6px 22px rgba(0,0,0,.5);right:14px;bottom:18px;';
  } catch (e) { /* noop */ }
}

/* ---------------- storage probes (for diagnostics) ---------------- */
function lsOk() {
  try { localStorage.setItem('pdt:probe', '1'); localStorage.removeItem('pdt:probe'); return true; }
  catch (e) { return false; }
}
function ssOk() {
  try { sessionStorage.setItem('pdt:probe', '1'); sessionStorage.removeItem('pdt:probe'); return true; }
  catch (e) { return false; }
}

/* ---------------- diagnostics report ---------------- */
function collectDiagnostics() {
  var S = stab(), d = S.diag;
  function yn(v) { return v === true ? 'active' : v === false ? 'off' : 'unknown'; }
  var mem = null;
  try {
    mem = (performance.memory && performance.memory.usedJSHeapSize)
      ? fmtBytes(performance.memory.usedJSHeapSize) : null;
  } catch (e) { mem = null; }
  return {
    version: 'v' + VERSION,
    edition: IS_USERSCRIPT ? 'userscript' : 'bookmarklet',
    url: String(location.href),
    userAgent: navigator.userAgent,
    uptime: Math.round((Date.now() - d.bootTime) / 1000) + ' s',
    hooks: {
      console: yn(d.console), fetch: yn(d.fetch), xhr: yn(d.xhr),
      websocket: yn(d.ws), sendBeacon: yn(d.beacon), listenerCapture: yn(d.ael)
    },
    stylesheet: d.styleApplied === true ? 'applied'
      : d.styleApplied === false ? 'BLOCKED by page CSP — fallback in use' : 'unknown',
    storage: {
      localStorage: lsOk() ? 'writable' : 'blocked',
      sessionStorage: ssOk() ? 'writable' : 'blocked',
      cookies: (navigator.cookieEnabled ? 'enabled' : 'blocked')
    },
    captured: {
      consoleEntries: ctx.conEntries.length,
      networkEntries: ctx.netEntries.length,
      domListeners: (typeof evtListeners !== 'undefined' && evtListeners) ? evtListeners.length : 0
    },
    internalErrors: { count: S.errors.length, last: S.errors.slice(-5) },
    jsHeap: mem || 'not exposed (Firefox)'
  };
}

/* ---------------- full teardown ----------------
 * Removes every hook, listener, timer and DOM node the tool created and
 * restores the page to its pre-injection state. Re-tapping the bookmarklet
 * afterwards boots a fresh copy. */
function destroyTool(silent) {
  var S = stab();
  try { stopInspect(true); } catch (e) { /* noop */ }
  try { stopFps(); } catch (e) { /* noop */ }

  /* tracked listeners */
  S.listeners.forEach(function (L) {
    try { L.t.removeEventListener(L.type, L.fn, L.opts); } catch (e) { /* noop */ }
  });
  S.listeners = [];

  /* tracked timers + the settings debounce */
  S.timers.forEach(function (tm) {
    try { if (tm.kind === 'i') clearInterval(tm.id); else clearTimeout(tm.id); } catch (e) { /* noop */ }
  });
  S.timers = [];
  try { clearTimeout(saveTimer); } catch (e) { /* noop */ }

  /* console restore: put back the exact descriptors we found at load time */
  for (var m in natives.conDesc) {
    try {
      if (natives.conDesc[m]) Object.defineProperty(console, m, natives.conDesc[m]);
      else delete console[m];
    } catch (e) { try { delete console[m]; } catch (e2) { /* noop */ } }
  }
  stab().diag.console = false;

  /* network + listener-capture restore */
  try { if (natives.fetch) window.fetch = natives.fetch; } catch (e) { /* noop */ }
  try {
    if (natives.xhrOpen) {
      XMLHttpRequest.prototype.open = natives.xhrOpen;
      XMLHttpRequest.prototype.send = natives.xhrSend;
      XMLHttpRequest.prototype.setRequestHeader = natives.xhrSetHeader;
    }
  } catch (e) { /* noop */ }
  try { if (natives.beacon) navigator.sendBeacon = natives.beacon; } catch (e) { /* noop */ }
  try { if (natives.ws) window.WebSocket = natives.ws; } catch (e) { /* noop */ }
  try {
    if (natives.ael) {
      EventTarget.prototype.addEventListener = natives.ael;
      EventTarget.prototype.removeEventListener = natives.rel;
    }
  } catch (e) { /* noop */ }
  stab().diag.fetch = stab().diag.xhr = stab().diag.ws = stab().diag.beacon = stab().diag.ael = false;
  try { if (typeof evtListeners !== 'undefined') evtListeners = []; } catch (e) { /* noop */ }

  /* console helper globals */
  ['$', '$$', '$x', '$_', '$0', '$1', '$2', '$3', '$4', 'copy', 'clear', 'inspect',
   'keys', 'values', 'getListeners', 'monitorEvents', 'pdt'].forEach(function (name) {
    try { delete window[name]; } catch (e) { /* noop */ }
  });

  /* UI + shared panel refs */
  try { if (hostEl && hostEl.parentNode) hostEl.parentNode.removeChild(hostEl); } catch (e) { /* noop */ }
  try { resetPanelRefs(); } catch (e) { /* noop */ }
  try { ssSet('open', null); } catch (e) { /* noop */ }

  try { delete window.__POCKET_DEVTOOLS__; } catch (e) { try { window.__POCKET_DEVTOOLS__ = undefined; } catch (e2) { /* noop */ } }

  if (!silent) {
    try { nativeCon.info('Pocket DevTools unloaded — hooks restored, UI removed. Tap the bookmarklet to start it again.'); }
    catch (e) { /* noop */ }
  }
}

/* ---------------- UI restart (self-healing) ----------------
 * Tears down and rebuilds the whole sheet in place — capture, hooks and
 * settings are untouched, so nothing that already happened is lost. Use it
 * when a panel wedges or after importing settings. */
function restartUI() {
  var wasOpen = sheetEl ? sheetEl.classList.contains('open') : true;
  try { if (hostEl && hostEl.parentNode) hostEl.parentNode.removeChild(hostEl); } catch (e) { /* noop */ }
  try { resetPanelRefs(); } catch (e) { /* noop */ }
  ctx.fabHidden = false;   /* a UI repair must never leave the user without
                            * an entry point — always bring the icon back */
  buildShell();
  if (!wasOpen) { try { closeSheet(); } catch (e) { /* noop */ } }
  toast('Pocket DevTools UI restarted');
}
