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
    h('button.pdt-btn' + (settings.showFAB ? '.on' : ''), { type: 'button', style: { marginTop: '8px' } }, settings.showFAB ? 'Hide FAB' : 'Show FAB')
  ]);
  var fabBtn = fabRow.querySelector('button');
  fabBtn.addEventListener('click', function () {
    settings.showFAB = !settings.showFAB;
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
