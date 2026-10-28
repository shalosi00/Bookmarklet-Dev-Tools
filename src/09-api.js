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
