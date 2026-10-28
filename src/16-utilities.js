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

/* ---------------- built-in snippet library ---------------- */
var BUILTIN_SNIPPETS = [
  { name: 'Enable text selection & copy', code: 'document.body.style.userSelect = "auto"; document.body.style.webkitUserSelect = "auto";\n["onselectstart", "oncopy", "oncut", "oncontextmenu"].forEach(function (h) { document.body[h] = null; document.documentElement[h] = null; });\n"Selection, copy and context menu unlocked";' },
  { name: 'Reveal password fields', code: 'document.querySelectorAll("input[type=password]").forEach(function (i) { i.type = "text"; });\n"Done — passwords are visible now";' },
  { name: 'Kill sticky headers & overlays', code: 'var n = 0; document.querySelectorAll("*").forEach(function (el) {\n  var p = getComputedStyle(el).position;\n  if ((p === "fixed" || p === "sticky") && el.id !== "pdt-host") { el.style.position = "static"; n++; }\n});\ndocument.documentElement.style.overflow = "auto"; document.body.style.overflow = "auto";\n"Reset " + n + " pinned element(s) and re-enabled scrolling";' },
  { name: 'Count elements by tag (top 20)', code: 'var c = {}; document.querySelectorAll("*").forEach(function (el) { c[el.tagName] = (c[el.tagName] || 0) + 1; });\nObject.entries(c).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 20)\n  .map(function (e) { return e[0] + ": " + e[1]; }).join("\\n") + "\\nTotal: " + document.querySelectorAll("*").length;' },
  { name: 'List captured event listeners', code: 'typeof getListeners === "function" ? getListeners($0 || document.body) : "Select an element first, then run this";' },
  { name: 'Find oversized images (wasted bytes)', code: 'document.querySelectorAll("img").map(function (i) {\n  return { src: (i.currentSrc || i.src).slice(0, 70), natural: i.naturalWidth + "x" + i.naturalHeight, shown: Math.round(i.getBoundingClientRect().width) + "px" };\n}).filter(function (i) { return i.natural !== "0x0" && parseInt(i.natural) > 400; })\n  .map(function (i) { return i.natural + " shown at " + i.shown + " — " + i.src; }).join("\\n") || "No oversized images";' },
  { name: 'Slow auto-scroll (reader mode)', code: 'var s = window.__pdtScroll; if (s) { clearInterval(s); window.__pdtScroll = null; "Auto-scroll stopped"; }\nelse { window.__pdtScroll = setInterval(function () { window.scrollBy(0, 1); }, 30); "Auto-scroll on — run again to stop"; }' },
  { name: 'Expand all <details>', code: 'document.querySelectorAll("details").forEach(function (d) { d.open = true; }); "Expanded";' },
  { name: 'Speed up videos (2x)', code: 'document.querySelectorAll("video").forEach(function (v) { v.playbackRate = 2; });\ndocument.querySelectorAll("video").length + " video(s) set to 2x";' },
  { name: 'Enable disabled form fields', code: 'var n = 0; document.querySelectorAll("input,select,textarea,button").forEach(function (f) {\n  if (f.disabled) { f.disabled = false; n++; } if (f.readOnly) { f.readOnly = false; n++; }\n}); n + " field(s) unlocked";' },
  { name: 'Copy headings outline', code: 'copy(document.querySelectorAll("h1,h2,h3").map(function (h) {\n  return "  ".repeat(+h.tagName[1] - 1) + h.tagName + " " + h.textContent.trim().slice(0, 70);\n}).join("\\n")); "Outline copied to clipboard";' },
  { name: 'Remove link target=_blank', code: 'var n = 0; document.querySelectorAll("a[target=_blank]").forEach(function (a) { a.target = "_self"; n++; }); n + " link(s) now open in the same tab";' }
];

/* ---------------- snippet library ---------------- */
function buildSnippets() {
  var wrap = h('div');

  /* built-in library */
  var blt = h('.pdt-card');
  blt.appendChild(h('.pdt-label', 'Built-in library (' + BUILTIN_SNIPPETS.length + ')'));
  BUILTIN_SNIPPETS.forEach(function (s) {
    var row = h('.pdt-row', { style: { margin: '4px 0' } }, [
      h('span.pdt-grow', truncate(s.name, 42)),
      h('button.pdt-ib', { type: 'button', title: 'Run', onclick: function () { runSnippet(s); } }, iconEl('play', 15)),
      h('button.pdt-ib', { type: 'button', title: 'Copy to my snippets (editable)', onclick: function () {
        ctx.snippets.push({ id: uid(), name: s.name, code: s.code });
        pdtSet('snippets', ctx.snippets);
        renderUtilsPanel(); toast('Copied to My snippets');
      } }, iconEl('copy', 14))
    ]);
    blt.appendChild(row);
  });
  wrap.appendChild(blt);

  /* user snippets */
  wrap.appendChild(h('.pdt-row', { style: { marginBottom: '10px' } }, [
    h('button.pdt-btn.acc', { type: 'button', onclick: function () { editSnippet(null); } }, [iconEl('plus', 14), 'New snippet'])
  ]));
  if (!ctx.snippets.length) {
    wrap.appendChild(h('.pdt-empty', 'No personal snippets yet. Create your own, or copy one from the built-in library above.'));
    return wrap;
  }
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

  tool('Edit page (design mode)', 'edit', function () {
    var on = document.designMode === 'on';
    document.designMode = on ? 'off' : 'on';
    toast(on ? 'Page editing off' : 'Page editing on — tap any text to type');
  });

  tool('Unlock copy & menus', 'unlock', function () {
    var n = 0;
    ['contextmenu', 'selectstart', 'dragstart', 'copy', 'cut', 'select'].forEach(function (ev) {
      var key = 'on' + ev;
      [document, document.body, document.documentElement].forEach(function (t) {
        if (t && t[key]) { t[key] = null; n++; }
      });
      document.addEventListener(ev, function (e) { e.stopPropagation(); }, true);
    });
    var st = document.getElementById('pdt-unlock') || document.createElement('style');
    st.id = 'pdt-unlock';
    st.textContent = '* { user-select: auto !important; -webkit-user-select: auto !important; -webkit-touch-callout: default !important; }';
    if (!st.parentNode) (document.head || document.documentElement).appendChild(st);
    toast('Unlocked ' + n + ' handler(s) — selection, copy & long-press restored');
  });

  tool('Reveal passwords', 'eye', function () {
    var fields = document.querySelectorAll('input[type=password]');
    fields.forEach(function (f) { f.type = 'text'; });
    toast(fields.length ? fields.length + ' password field(s) revealed' : 'No password fields on this page');
  });

  tool('Kill sticky elements', 'zap', function () {
    var n = 0;
    document.querySelectorAll('body *').forEach(function (el) {
      if (el.id === 'pdt-host' || (hostEl && hostEl.contains(el))) return;
      var p = '';
      try { p = getComputedStyle(el).position; } catch (e) { return; }
      if (p === 'fixed' || p === 'sticky') {
        el.style.setProperty('position', 'static', 'important');
        el.style.setProperty('top', 'auto', 'important');
        el.style.setProperty('bottom', 'auto', 'important');
        el.style.setProperty('z-index', 'auto', 'important');
        n++;
      }
    });
    document.documentElement.style.setProperty('overflow', 'auto', 'important');
    document.body.style.setProperty('overflow', 'auto', 'important');
    document.body.style.setProperty('position', 'static', 'important');
    document.body.style.setProperty('height', 'auto', 'important');
    toast(n ? 'Reset ' + n + ' pinned element(s), scrolling restored' : 'Nothing pinned found');
  });

  tool('Fullscreen', 'maximize', function () {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch (e) { toast('Fullscreen not available'); }
  });

  tool('Color picker', 'droplet', function () {
    if (typeof EyeDropper === 'function') {
      try {
        new EyeDropper().open().then(function (res) {
          copyText(res.sRGBHex, true);
          conEmit('log', ['EyeDropper: ' + res.sRGBHex + ' (copied)']);
          toast('Picked ' + res.sRGBHex + ' — copied');
        }, function () { /* cancelled */ });
        return;
      } catch (e) { /* fall through */ }
    }
    /* fallback: pick from the selected element */
    var el = ctx.selected;
    if (!el || !el.isConnected) {
      toast('EyeDropper unsupported here — select an element first, then reopen');
      switchTab('elements');
      return;
    }
    var cs = getComputedStyle(el);
    modal('Colors of selected element', function (body) {
      [['color', 'Text'], ['background-color', 'Background'], ['border-top-color', 'Border']].forEach(function (c) {
        var v = cs.getPropertyValue(c[0]);
        body.appendChild(h('.pdt-swatch', [
          h('i', { style: { background: v } }), h('span.pdt-grow', c[1] + ' — ' + v)
        ]));
      });
      body.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em', color: 'var(--muted)' } },
        'The native EyeDropper API is not available in this browser. Select any element in the Elements panel, then open this tool to read its colors.'));
    });
  });

  tool('Save page HTML', 'save', function () {
    var html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    downloadFile((document.title || 'page').replace(/[^\w.-]+/g, '_').slice(0, 40) + '.html', html, 'text/html');
  });

  tool('Highlight links', 'link', function () {
    var st = document.getElementById('pdt-hl-links');
    if (st) { st.remove(); toast('Link highlights removed'); return; }
    st = document.createElement('style');
    st.id = 'pdt-hl-links';
    st.textContent = 'a[href] { outline: 2px solid rgba(0,150,255,.55) !important; outline-offset: 1px !important; background-color: rgba(0,150,255,.08) !important; }';
    (document.head || document.documentElement).appendChild(st);
    toast('All links highlighted');
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
