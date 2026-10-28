/*
 * 13-plugins.js — run code / load from URL / manage persistent plugins
 */

function renderPluginsPanel() {
  if (!panelEls.plugins) return;
  var panel = panelEls.plugins;
  panel.textContent = '';

  var sc = h('.pdt-scroll');
  panel.appendChild(sc);

  /* --- run once --- */
  var codeEl = h('textarea.pdt-area', { rows: 6, placeholder: '/* JavaScript to run in the page */\nconsole.log("hello from plugin");' });
  sc.appendChild(h('.pdt-card', [
    h('.pdt-label', 'Run code now'),
    codeEl,
    h('.pdt-row', { style: { marginTop: '8px', flexWrap: 'wrap' } }, [
      h('button.pdt-btn.acc', { type: 'button', onclick: function () {
        if (!codeEl.value.trim()) { toast('Nothing to run'); return; }
        var r = evalInPage(codeEl.value);
        conEcho('input', '/* plugin run */');
        conEmit(r.ok ? 'log' : 'error', [r.ok ? ('\u2190 ' + serialize(r.value, 0)) : serialize(r.value, 0)]);
        toast(r.ok ? 'Code executed' : 'Error — see console');
        switchTab('console');
      } }, [iconEl('play', 14), 'Run']),
      h('button.pdt-btn', { type: 'button', onclick: function () {
        editPlugin({ type: 'code', value: codeEl.value });
      } }, [iconEl('plus', 14), 'Save as plugin'])
    ])
  ]));

  /* --- load from url --- */
  var urlEl = h('input.pdt-input', { type: 'url', placeholder: 'https://example.com/plugin.js', autocapitalize: 'off', spellcheck: 'false' });
  sc.appendChild(h('.pdt-card', [
    h('.pdt-label', 'Load from URL'),
    urlEl,
    h('.pdt-row', { style: { marginTop: '8px', flexWrap: 'wrap' } }, [
      h('button.pdt-btn.acc', { type: 'button', onclick: function () {
        loadPluginFromUrl(urlEl.value, false);
      } }, [iconEl('download', 14), 'Load & run']),
      h('button.pdt-btn', { type: 'button', onclick: function () {
        loadPluginFromUrl(urlEl.value, true);
      } }, [iconEl('plus', 14), 'Save & run'])
    ]),
    h('.pdt-mtext', { style: { fontSize: '.82em', marginTop: '8px' } },
      'Remote code runs in the page. Sites with a strict CSP may block it.')
  ]));

  /* --- saved list --- */
  sc.appendChild(h('.pdt-label', 'Saved plugins (' + ctx.plugins.length + ')'));
  if (!ctx.plugins.length) {
    sc.appendChild(h('.pdt-empty', 'No saved plugins.\nSaved plugins can auto-run when DevTools loads.'));
  }
  ctx.plugins.forEach(function (p) {
    var autoChip = h('button.pdt-chip' + (p.auto ? '.on' : ''), p.auto ? 'Auto-run on' : 'Auto-run off');
    autoChip.addEventListener('click', function () {
      p.auto = !p.auto;
      pdtSet('plugins', ctx.plugins);
      renderPluginsPanel();
    });
    sc.appendChild(h('.pdt-card', [
      h('.pdt-row', [
        h('b.pdt-grow', truncate(p.name, 28)),
        h('button.pdt-ib', { type: 'button', title: 'Run', onclick: function () { runPlugin(p, true); } }, iconEl('play', 15)),
        h('button.pdt-ib', { type: 'button', title: 'Edit', onclick: function () { editPlugin(p); } }, iconEl('edit', 14)),
        h('button.pdt-ib', { type: 'button', title: 'Delete', onclick: function () {
          confirmModal('Delete plugin "' + p.name + '"?', 'Delete', function () {
            ctx.plugins = ctx.plugins.filter(function (x) { return x.id !== p.id; });
            pdtSet('plugins', ctx.plugins);
            renderPluginsPanel();
          }, true);
        } }, iconEl('trash', 14))
      ]),
      h('.pdt-row', { style: { marginTop: '6px' } }, [autoChip,
        h('span.pdt-ver', p.type === 'url' ? truncate(p.value, 42) : 'inline code')])
    ]));
  });
}

function loadPluginFromUrl(url, save) {
  url = String(url || '').trim();
  if (!/^https?:\/\//i.test(url)) { toast('Enter a valid http(s) URL'); return; }
  fetch(url).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }).then(function (code) {
    var r = evalInPage(code);
    conEmit(r.ok ? 'log' : 'error', ['Plugin loaded from ' + clipUrl(url) + (r.ok ? ' OK' : ' FAILED')]);
    if (r.ok && save) {
      var name = url.split('/').pop() || 'plugin';
      ctx.plugins.push({ id: uid(), name: name, type: 'url', value: url, auto: false });
      pdtSet('plugins', ctx.plugins);
      renderPluginsPanel();
    }
    toast(r.ok ? 'Plugin executed' : 'Plugin error — see console');
  }, function (err) {
    toast('Could not load: ' + (err && err.message || err));
  });
}

function runPlugin(p, notify) {
  if (p.type === 'url') {
    fetch(p.value).then(function (r) { return r.text(); }).then(function (code) {
      var r = evalInPage(code);
      if (notify) toast(r.ok ? 'Plugin executed' : 'Plugin error');
      conEmit(r.ok ? 'log' : 'error', ['Plugin "' + p.name + '"' + (r.ok ? ' ran' : ' FAILED')]);
    }, function () { toast('Could not fetch plugin URL'); });
  } else {
    var r = evalInPage(p.value);
    if (notify) toast(r.ok ? 'Plugin executed' : 'Plugin error — see console');
    conEmit(r.ok ? 'log' : 'error', ['Plugin "' + p.name + '"' + (r.ok ? ' ran' : ' FAILED')]);
  }
}

function editPlugin(p) {
  var isNewName = !p.name;
  var nameEl = h('input.pdt-input', { placeholder: 'Plugin name', value: p.name || '' });
  var typeSel = h('select.pdt-select', [
    h('option', { value: 'code' }, 'Inline code'),
    h('option', { value: 'url' }, 'URL')
  ]);
  typeSel.value = p.type || 'code';
  var valEl = h('textarea.pdt-area', { rows: 7, placeholder: p.type === 'url' ? 'https://…' : '/* code */' });
  valEl.value = p.value || '';
  typeSel.addEventListener('change', function () {
    valEl.placeholder = typeSel.value === 'url' ? 'https://…' : '/* code */';
  });
  modal(isNewName ? 'Save plugin' : 'Edit plugin', function (body, close) {
    body.appendChild(h('.pdt-label', 'Name'));
    body.appendChild(nameEl);
    body.appendChild(h('.pdt-label', 'Type'));
    body.appendChild(typeSel);
    body.appendChild(h('.pdt-label', typeSel.value === 'url' ? 'URL' : 'JavaScript'));
    body.appendChild(valEl);
    body.appendChild(h('.pdt-mfoot', [
      h('button.pdt-btn', { type: 'button', onclick: close }, 'Cancel'),
      h('button.pdt-btn.acc', { type: 'button', onclick: function () {
        if (!nameEl.value.trim()) { toast('Name required'); return; }
        p.name = nameEl.value.trim();
        p.type = typeSel.value;
        p.value = valEl.value;
        if (isNewName) ctx.plugins.push(p);
        pdtSet('plugins', ctx.plugins);
        close(); renderPluginsPanel(); toast('Plugin saved');
      } }, 'Save')
    ]));
  });
}

/* auto-run persisted plugins */
function autorunPlugins() {
  ctx.plugins.filter(function (p) { return p.auto; }).forEach(function (p) {
    runPlugin(p, false);
  });
}

registerPanel({
  id: 'plugins', label: 'Plugins', icon: 'plugins',
  render: function (panel) { panelEls.plugins = panel; renderPluginsPanel(); }
});
