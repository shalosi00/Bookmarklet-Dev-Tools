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
