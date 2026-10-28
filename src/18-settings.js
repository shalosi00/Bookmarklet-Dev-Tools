/*
 * 14-settings.js — themes, panel height, font size, capture limits, reset, about
 */

function renderSettingsPanel() {
  if (!panelEls.settings) return;
  var panel = panelEls.settings;
  panel.textContent = '';
  var sc = h('.pdt-scroll');
  panel.appendChild(sc);

  /* --- theme --- */
  sc.appendChild(h('.pdt-label', 'Theme'));
  var tg = h('.pdt-themegrid');
  [['dark', 'Dark', '#1e1f24', '#5b9dff'], ['light', 'Light', '#ffffff', '#2563eb'],
   ['amoled', 'AMOLED', '#000000', '#6ea8ff'], ['auto', 'Auto', 'linear-gradient(135deg,#1e1f24 50%,#fff 50%)', '#5b9dff']].forEach(function (t) {
    var card = h('.pdt-themecard' + (settings.theme === t[0] ? '.on' : ''), [
      h('.pv', [
        h('i', { style: { background: t[2], height: '10px' } }),
        h('i', { style: { background: t[3], height: '16px' } })
      ]),
      h('.nm', t[1])
    ]);
    card.addEventListener('click', function () {
      settings.theme = t[0];
      saveSettings();
      applyTheme();
      renderSettingsPanel();
      toast(t[0] === 'auto' ? 'Theme: match system' : 'Theme: ' + t[1]);
    });
    tg.appendChild(card);
  });
  sc.appendChild(tg);
  sc.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em' } },
    'AMOLED uses a pure black background to save battery on OLED screens. Auto follows your system dark-mode setting.'));

  /* --- panel height --- */
  sc.appendChild(h('.pdt-label', 'Panel height: ' + settings.panelHeight + '%'));
  var heightRange = h('input', { type: 'range', min: '30', max: '90', step: '1', value: String(settings.panelHeight) });
  heightRange.addEventListener('input', function () {
    settings.panelHeight = parseInt(heightRange.value, 10);
    sheetEl.style.setProperty('--ph', settings.panelHeight + '%');
    var lbl = sc.querySelector('.pdt-label');
    if (lbl) lbl.textContent = 'Panel height: ' + settings.panelHeight + '%';
  });
  heightRange.addEventListener('change', saveSettings);
  sc.appendChild(heightRange);

  /* --- font size --- */
  sc.appendChild(h('.pdt-label', 'Panel text size'));
  var seg = h('.pdt-seg');
  [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']].forEach(function (f) {
    var b = h('button' + (settings.fontSize === f[0] ? '.on' : ''), f[1]);
    b.addEventListener('click', function () {
      settings.fontSize = f[0];
      app.dataset.fs = f[0];
      saveSettings();
      renderSettingsPanel();
    });
    seg.appendChild(b);
  });
  sc.appendChild(seg);

  /* --- console cap --- */
  sc.appendChild(h('.pdt-label', 'Keep last (console entries)'));
  var segC = h('.pdt-seg');
  [[100, '100'], [500, '500'], [2000, '2000']].forEach(function (c) {
    var b = h('button' + (settings.maxConsole === c[0] ? '.on' : ''), c[1]);
    b.addEventListener('click', function () {
      settings.maxConsole = c[0];
      saveSettings();
      renderSettingsPanel();
    });
    segC.appendChild(b);
  });
  sc.appendChild(segC);

  /* --- network body capture --- */
  sc.appendChild(h('.pdt-label', 'Capture response bodies (network)'));
  var segN = h('.pdt-seg');
  [[0, 'Off'], [16384, '16 KB'], [65536, '64 KB'], [262144, '256 KB']].forEach(function (n) {
    var b = h('button' + (settings.netBodyLimit === n[0] ? '.on' : ''), n[1]);
    b.addEventListener('click', function () {
      settings.netBodyLimit = n[0];
      saveSettings();
      renderSettingsPanel();
    });
    segN.appendChild(b);
  });
  sc.appendChild(segN);

  /* --- FAB --- */
  var fabRow = h('.pdt-card', [
    kv('Show floating button', settings.showFAB ? 'on' : 'off'),
    h('.pdt-mtext', { style: { fontSize: '.82em', marginTop: '6px' } },
      'Tap the icon to open the tools; drag it anywhere. Its small \u00D7 badge hides it ' +
      'for the current page load \u2014 refreshing or re-tapping the bookmarklet brings it back. ' +
      'The switch below is permanent (survives refresh).'),
    h('button.pdt-btn' + (settings.showFAB ? '.on' : ''), { type: 'button', style: { marginTop: '8px' } }, settings.showFAB ? 'Hide FAB permanently' : 'Show FAB')
  ]);
  var fabBtn = fabRow.querySelector('button');
  fabBtn.addEventListener('click', function () {
    settings.showFAB = !settings.showFAB;
    ctx.fabHidden = false;
    saveSettings();
    positionFab();
    renderSettingsPanel();
  });
  sc.appendChild(h('.pdt-label', 'Floating button'));
  sc.appendChild(fabRow);

  /* --- persistence (userscript edition) --- */
  sc.appendChild(h('.pdt-label', [iconEl('repeat', 14), ' Persistence (refresh survival)']));
  var modeCard = h('.pdt-card', [
    kv('Edition', IS_USERSCRIPT ? 'Userscript — survives refresh' : 'Bookmarklet — one-shot per page load'),
    kv('Capture starts', IS_USERSCRIPT ? 'document-start (before page scripts run)' : 'when you tap the bookmarklet')
  ]);
  if (!IS_USERSCRIPT) {
    modeCard.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em', marginTop: '8px' } },
      'Bookmarklets are wiped by every refresh — that is browser security, not a bug. ' +
      'Install the userscript edition (pocket-devtools.user.js, see README) to keep the tools, ' +
      'their settings and the open panel across reloads; it also captures errors that happen ' +
      'during page startup, which a bookmarklet can never see.'));
  } else {
    modeCard.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em', marginTop: '8px' } },
      'Active on every page load. If the panel was open when you refreshed, it reopens by itself; ' +
      'if it was closed, only the floating button stays. Capture starts before the page\u2019s own scripts run.'));
  }
  sc.appendChild(modeCard);

  var usRow = h('.pdt-row', { style: { flexWrap: 'wrap' } });
  [['usEnabled', 'Auto-inject on every page'],
   ['usAutoOpenSheet', 'Always open panel on load']].forEach(function (t) {
    var on = !!settings[t[0]];
    var b = h('button.pdt-btn' + (on ? '.on' : ''), { type: 'button', style: { flex: '1 1 auto' } },
      [iconEl(on ? 'check' : 'close', 14), ' ' + t[1]]);
    b.addEventListener('click', function () {
      settings[t[0]] = !settings[t[0]];
      saveSettings();
      renderSettingsPanel();
      toast(t[1] + ': ' + (settings[t[0]] ? 'on' : 'off'));
    });
    usRow.appendChild(b);
  });
  sc.appendChild(usRow);

  sc.appendChild(h('.pdt-label', 'Never inject on these sites (userscript)'));
  var exTa = h('textarea.pdt-area', { rows: 2, spellcheck: 'false',
    placeholder: 'one host per line, e.g. mail.google.com' });
  exTa.value = settings.usExcluded || '';
  exTa.addEventListener('change', function () {
    settings.usExcluded = exTa.value.trim();
    saveSettings();
    toast('Exclusion list saved — applies from the next page load');
  });
  sc.appendChild(exTa);
  sc.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em' } },
    'Matching is by substring of the site\u2019s host, one entry per line or comma-separated. ' +
    'Excluded sites run zero Pocket DevTools code — no hooks, no button.'));

  /* --- data export / import --- */
  sc.appendChild(h('.pdt-label', 'Data'));
  sc.appendChild(h('.pdt-row', { style: { flexWrap: 'wrap' } }, [
    h('button.pdt-btn', { type: 'button', onclick: function () {
      var payload = {
        app: 'Pocket DevTools', version: VERSION, exported: new Date().toISOString(),
        settings: settings, snippets: ctx.snippets, plugins: ctx.plugins,
        blocklist: ctx.blockList, history: ctx.history
      };
      downloadFile('pocket-devtools-backup.json', JSON.stringify(payload, null, 2), 'application/json');
    } }, [iconEl('save', 14), 'Export data']),
    h('button.pdt-btn', { type: 'button', onclick: function () {
      var inp = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          try {
            var data = JSON.parse(String(fr.result));
            if (!data || data.app !== 'Pocket DevTools') { toast('Not a Pocket DevTools backup file'); return; }
            if (Array.isArray(data.snippets)) { ctx.snippets = ctx.snippets.concat(data.snippets); }
            if (Array.isArray(data.plugins)) { ctx.plugins = ctx.plugins.concat(data.plugins); }
            if (Array.isArray(data.blocklist)) { ctx.blockList = ctx.blockList.concat(data.blocklist); }
            if (data.settings) { for (var k in data.settings) settings[k] = data.settings[k]; }
            pdtSet('snippets', ctx.snippets); pdtSet('plugins', ctx.plugins); pdtSet('blocklist', ctx.blockList);
            saveSettings();
            applyTheme(); app.dataset.fs = settings.fontSize;
            sheetEl.style.setProperty('--ph', settings.panelHeight + '%');
            positionFab(); renderSettingsPanel();
            toast('Backup imported');
          } catch (e) { toast('Import failed: invalid JSON'); }
        };
        fr.readAsText(f);
      });
      sc.appendChild(inp);
      inp.click();
    } }, [iconEl('upload', 14), 'Import data'])
  ]));
  sc.appendChild(h('.pdt-row', { style: { flexWrap: 'wrap' } }, [
    h('button.pdt-btn.danger', { type: 'button', onclick: function () {
      confirmModal('Reset all Pocket DevTools settings to defaults? (Snippets and plugins are kept)', 'Reset', function () {
        try { localStorage.removeItem('pdt:settings'); } catch (e) { /* noop */ }
        settings = loadSettings();
        applyTheme();
        if (app) app.dataset.fs = settings.fontSize;
        if (sheetEl) sheetEl.style.setProperty('--ph', settings.panelHeight + '%');
        positionFab();
        renderSettingsPanel();
        toast('Settings reset');
      }, true);
    } }, [iconEl('refresh', 14), 'Reset settings']),
    h('button.pdt-btn', { type: 'button', onclick: function () {
      copyText('Pocket DevTools v' + VERSION + '\n' + location.href + '\n' + navigator.userAgent);
    } }, [iconEl('copy', 14), 'Copy diagnostics'])
  ]));

  /* --- diagnostics & health --- */
  sc.appendChild(h('.pdt-label', [iconEl('shield', 14), ' Diagnostics & health']));
  var diagCard = h('.pdt-card');
  var D = collectDiagnostics();
  diagCard.appendChild(kv('Hooks (console / fetch / XHR)',
    D.hooks.console + ' / ' + D.hooks.fetch + ' / ' + D.hooks.xhr));
  diagCard.appendChild(kv('Hooks (WS / beacon / listeners)',
    D.hooks.websocket + ' / ' + D.hooks.sendBeacon + ' / ' + D.hooks.listenerCapture));
  diagCard.appendChild(kv('Stylesheet', D.stylesheet));
  diagCard.appendChild(kv('Storage (local / session / cookies)',
    D.storage.localStorage + ' / ' + D.storage.sessionStorage + ' / ' + D.storage.cookies));
  diagCard.appendChild(kv('Captured (console / network / listeners)',
    D.captured.consoleEntries + ' / ' + D.captured.networkEntries + ' / ' + D.captured.domListeners));
  diagCard.appendChild(kv('Internal errors caught', String(D.internalErrors.count)));
  diagCard.appendChild(kv('JS heap', D.jsHeap));
  diagCard.appendChild(kv('Uptime', D.uptime));
  if (D.internalErrors.count) {
    var errList = h('pre.pdt-mono', { style: { fontSize: '.78em', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--fg2)', margin: '6px 0 0' } });
    errList.textContent = D.internalErrors.last.map(function (er) {
      return '[' + fmtTime(er.t) + '] ' + er.where + ': ' + truncate(er.msg, 160);
    }).join('\n');
    diagCard.appendChild(errList);
  }
  sc.appendChild(diagCard);
  sc.appendChild(h('.pdt-row', { style: { flexWrap: 'wrap', marginTop: '8px' } }, [
    h('button.pdt-btn', { type: 'button', onclick: function () {
      copyText(JSON.stringify(collectDiagnostics(), null, 2));
    } }, [iconEl('copy', 14), 'Copy report']),
    h('button.pdt-btn', { type: 'button', onclick: function () {
      restartUI();
    } }, [iconEl('refresh', 14), 'Restart UI']),
    h('button.pdt-btn.danger', { type: 'button', onclick: function () {
      confirmModal('Unload Pocket DevTools completely?', 'Unload', function () {
        destroyTool();
      }, true);
    } }, [iconEl('xc', 14), 'Unload'])
  ]));
  sc.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em' } },
    'Restart UI rebuilds the panel without touching hooks or captured data — use it if anything looks wedged. ' +
    'Unload removes every hook, button and listener, restoring the page to its pre-injection state (tap the bookmarklet to start again).'));

  /* --- about --- */
  sc.appendChild(h('.pdt-label', 'About'));
  sc.appendChild(h('.pdt-card', [
    kv('Version', 'v' + VERSION),
    kv('Fork of', 'DeveloperExotic/Bookmarklet-Dev-Tools'),
    kv('License', 'MIT'),
    h('.pdt-mtext', { style: { fontSize: '.82em', marginTop: '8px' } },
      'Pocket DevTools is a from-scratch rewrite for mobile browsers (Android Firefox first). ' +
      'It runs entirely in your browser — no data leaves the device.')
  ]));
}

registerPanel({
  id: 'settings', label: 'Settings', icon: 'settings',
  render: function (panel) { panelEls.settings = panel; renderSettingsPanel(); },
  onShow: renderSettingsPanel
});
