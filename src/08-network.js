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
