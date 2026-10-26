/*
 * 12-utilities.js — device info, JS snippet library, one-tap quick tools
 */

function renderUtilsPanel() {
  if (!panelEls.utils) return;
  var panel = panelEls.utils;
  panel.textContent = '';

  var subs = [['info', 'Device'], ['snip', 'Snippets'], ['tools', 'Tools']];
  var subBar = h('.pdt-sub');
  subs.forEach(function (s) {
    var b = h('button.pdt-subb' + (utilSub === s[0] ? '.on' : ''), s[1]);
    b.addEventListener('click', function () { utilSub = s[0]; renderUtilsPanel(); });
    subBar.appendChild(b);
  });
  panel.appendChild(subBar);
  var sc = h('.pdt-scroll');
  panel.appendChild(sc);
  if (utilSub === 'info') sc.appendChild(buildDeviceInfo());
  else if (utilSub === 'snip') sc.appendChild(buildSnippets());
  else sc.appendChild(buildQuickTools());
}
var utilSub = 'info';

/* ---------------- device info ---------------- */
function buildDeviceInfo() {
  var d = h('.pdt-card');
  function add(k, v) { d.appendChild(kv(k, v)); }
  add('Viewport', window.innerWidth + ' \u00D7 ' + window.innerHeight + ' px');
  add('Screen', screen.width + ' \u00D7 ' + screen.height + ' px (' + (screen.orientation && screen.orientation.type || '—') + ')');
  add('Device pixel ratio', window.devicePixelRatio + 'x');
  add('Effective CSS width', document.documentElement.clientWidth + ' px');
  add('Touch points', navigator.maxTouchPoints != null ? String(navigator.maxTouchPoints) : '—');
  add('Online', navigator.onLine ? 'yes' : 'no');
  add('Cookies enabled', navigator.cookieEnabled ? 'yes' : 'no');
  add('Do not track', navigator.doNotTrack === '1' ? 'enabled' : (navigator.doNotTrack || '—'));
  add('Protocol', location.protocol.replace(':', '') + (window.isSecureContext ? ' (secure)' : ' (insecure)'));
  add('Origin', location.origin);
  add('Timezone', (Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : '—'));
  add('Language', navigator.language + (navigator.languages ? ' (' + navigator.languages.slice(0, 3).join(', ') + ')' : ''));
  add('Platform', navigator.platform || '—');
  add('Cores', navigator.hardwareConcurrency || '—');
  var uaCard = h('.pdt-card');
  uaCard.appendChild(h('.pdt-label', 'User agent'));
  uaCard.appendChild(h('div.pdt-mono', { style: { fontSize: '.82em', wordBreak: 'break-all', lineHeight: '1.5' } }, navigator.userAgent));
  var btns = h('.pdt-row', { style: { flexWrap: 'wrap' } }, [
    h('button.pdt-btn', { type: 'button', onclick: function () {
      copyText(navigator.userAgent);
    } }, [iconEl('copy', 14), 'Copy UA']),
    h('button.pdt-btn', { type: 'button', onclick: function () {
      copyText(location.href + '\n' + document.title + '\n' + navigator.userAgent);
    } }, [iconEl('copy', 14), 'Copy page info'])
  ]);
  return h('div', [d, uaCard, btns]);
}

/* ---------------- snippet library ---------------- */
function buildSnippets() {
  var wrap = h('div');
  if (!ctx.snippets.length) {
    wrap.appendChild(h('.pdt-empty', [
      'No snippets saved yet.',
      h('div', [h('button.pdt-btn.acc', { type: 'button', onclick: function () { editSnippet(null); } }, [iconEl('plus', 14), 'Create snippet'])])
    ]));
    return wrap;
  }
  wrap.appendChild(h('.pdt-row', { style: { marginBottom: '10px' } }, [
    h('button.pdt-btn.acc', { type: 'button', onclick: function () { editSnippet(null); } }, [iconEl('plus', 14), 'New snippet'])
  ]));
  ctx.snippets.forEach(function (s) {
    wrap.appendChild(h('.pdt-card', [
      h('.pdt-row', [
        h('b.pdt-grow', truncate(s.name, 30)),
        h('button.pdt-ib', { type: 'button', title: 'Run', onclick: function () { runSnippet(s); } }, iconEl('play', 15)),
        h('button.pdt-ib', { type: 'button', title: 'Edit', onclick: function () { editSnippet(s); } }, iconEl('edit', 14)),
        h('button.pdt-ib', { type: 'button', title: 'Delete', onclick: function () {
          confirmModal('Delete snippet "' + s.name + '"?', 'Delete', function () {
            ctx.snippets = ctx.snippets.filter(function (x) { return x.id !== s.id; });
            pdtSet('snippets', ctx.snippets);
            renderUtilsPanel();
          }, true);
        } }, iconEl('trash', 14))
      ]),
      h('pre.pdt-mono', { style: { fontSize: '.8em', color: 'var(--fg2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: '6px' } },
        truncate(s.code, 200))
    ]));
  });
  return wrap;
}
function runSnippet(s) {
  conEcho('input', '/* snippet: ' + s.name + ' */');
  var r = evalInPage(s.code);
  conEmit(r.ok ? 'log' : 'error', [r.ok ? ('\u2190 ' + serialize(r.value, 0)) : serialize(r.value, 0)]);
  switchTab('console');
  toast(r.ok ? 'Snippet ran' : 'Snippet threw an error');
}
function editSnippet(s) {
  var nameEl = h('input.pdt-input', { placeholder: 'Snippet name', value: s ? s.name : '' });
  var codeEl = h('textarea.pdt-area', { rows: 8, placeholder: 'document.body.style.border = "5px solid red";' });
  if (s) codeEl.value = s.code;
  modal(s ? 'Edit snippet' : 'New snippet', function (body, close) {
    body.appendChild(h('.pdt-label', 'Name'));
    body.appendChild(nameEl);
    body.appendChild(h('.pdt-label', 'JavaScript'));
    body.appendChild(codeEl);
    body.appendChild(h('.pdt-mfoot', [
      h('button.pdt-btn', { type: 'button', onclick: close }, 'Cancel'),
      h('button.pdt-btn.acc', { type: 'button', onclick: function () {
        if (!nameEl.value.trim()) { toast('Name required'); return; }
        if (s) {
          s.name = nameEl.value.trim(); s.code = codeEl.value;
        } else {
          ctx.snippets.push({ id: uid(), name: nameEl.value.trim(), code: codeEl.value });
        }
        pdtSet('snippets', ctx.snippets);
        close(); renderUtilsPanel(); toast('Saved');
      } }, 'Save')
    ]));
  });
}

/* ---------------- quick tools ---------------- */
function buildQuickTools() {
  var grid = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } });

  function tool(label, iconName, fn) {
    var b = h('button.pdt-btn', { type: 'button', style: { flexDirection: 'column', minWidth: '31%', minHeight: '64px', gap: '4px', textAlign: 'center' } }, [
      iconEl(iconName, 17), h('span', { style: { fontSize: '.85em' } }, label)
    ]);
    b.addEventListener('click', fn);
    grid.appendChild(b);
  }

  tool(ctx.cssDisabled ? 'Enable CSS' : 'Disable CSS', 'eye', function () {
    ctx.cssDisabled = !ctx.cssDisabled;
    Array.prototype.forEach.call(document.styleSheets, function (ss) {
      try { ss.disabled = ctx.cssDisabled; } catch (e) { /* noop */ }
    });
    Array.prototype.forEach.call(document.querySelectorAll('style'), function (st) {
      try { st.disabled = ctx.cssDisabled; } catch (e) { /* noop */ }
    });
    toast(ctx.cssDisabled ? 'All CSS disabled' : 'CSS re-enabled');
    renderUtilsPanel();
  });

  tool(ctx.outlineOn ? 'Hide outlines' : 'Outline elements', 'inspect', function () {
    ctx.outlineOn = !ctx.outlineOn;
    var st = document.getElementById('pdt-outline');
    if (ctx.outlineOn && !st) {
      st = document.createElement('style');
      st.id = 'pdt-outline';
      st.textContent = '* { outline: 1px solid rgba(255,0,128,.45) !important; outline-offset: -1px !important; }';
      (document.head || document.documentElement).appendChild(st);
    } else if (!ctx.outlineOn && st) {
      st.remove();
    }
    toast(ctx.outlineOn ? 'Element outlines shown' : 'Outlines hidden');
    renderUtilsPanel();
  });

  tool('Find broken images', 'search', function () {
    var broken = Array.prototype.filter.call(document.images, function (img) {
      return img.complete && img.naturalWidth === 0;
    });
    if (!broken.length) { toast('No broken images found'); return; }
    modal('Broken images (' + broken.length + ')', function (body) {
      broken.forEach(function (img, i) {
        body.appendChild(h('.pdt-card', [
          kv('Src', truncate(img.currentSrc || img.src || '(no src)', 70)),
          kv('Alt', truncate(img.alt || '—', 40)),
          h('button.pdt-btn', { type: 'button', style: { marginTop: '6px' }, onclick: function () {
            img.scrollIntoView({ behavior: 'smooth', block: 'center' });
            img.style.outline = '3px solid red';
            setTimeout(function () { img.style.outline = ''; }, 2500);
          } }, [iconEl('eye', 14), 'Scroll to image'])
        ]));
      });
    });
  });

  tool('Clear page storage', 'trash', function () {
    confirmModal('Clear cookies, localStorage and sessionStorage for this page?', 'Clear everything', function () {
      try { localStorage.clear(); } catch (e) { /* noop */ }
      try { sessionStorage.clear(); } catch (e) { /* noop */ }
      cookieMap().forEach(function (c) { delCookieRaw(c.name); });
      toast('Page storage cleared');
    }, true);
  });

  tool('Reset zoom', 'refresh', function () {
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      (document.head || document.documentElement).appendChild(meta);
    }
    meta.content = 'width=device-width, initial-scale=1';
    toast('Viewport reset to device width');
  });

  tool('Show console errors', 'console', function () {
    var errs = ctx.conEntries.filter(function (e) { return e.level === 'error'; });
    toast(errs.length + ' error(s) captured — see Console');
    switchTab('console');
  });

  return h('div', [h('.pdt-label', 'One-tap tools'), grid,
    h('.pdt-mtext', { style: { color: 'var(--muted)', fontSize: '.85em', marginTop: '10px' } },
      'Tip: combine with Snippets for reusable page fixes. Outline mode helps to see layout structure on small screens.')]);
}

registerPanel({
  id: 'utils', label: 'Utils', icon: 'utils',
  render: function (panel) { panelEls.utils = panel; renderUtilsPanel(); }
});
