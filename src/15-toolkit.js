/*
 * 15-toolkit.js — developer toolkit: text converters, regex tester,
 *                color tools + contrast checker, QR codes, media controls.
 */

var tkSub = 'convert';

function renderToolkitPanel() {
  if (!panelEls.toolkit) return;
  var panel = panelEls.toolkit;
  panel.textContent = '';
  var subs = [['convert', 'Convert'], ['regex', 'Regex'], ['color', 'Color'],
    ['qr', 'QR'], ['media', 'Media']];
  var subBar = h('.pdt-sub');
  subs.forEach(function (s) {
    var b = h('button.pdt-subb' + (tkSub === s[0] ? '.on' : ''), s[1]);
    b.addEventListener('click', function () { tkSub = s[0]; renderToolkitPanel(); });
    subBar.appendChild(b);
  });
  panel.appendChild(subBar);
  var sc = h('.pdt-scroll');
  panel.appendChild(sc);
  if (tkSub === 'convert') sc.appendChild(buildTkConvert());
  else if (tkSub === 'regex') sc.appendChild(buildTkRegex());
  else if (tkSub === 'color') sc.appendChild(buildTkColor());
  else if (tkSub === 'qr') sc.appendChild(buildTkQr());
  else sc.appendChild(buildTkMedia());
}

/* ================= Convert ================= */
function buildTkConvert() {
  var wrap = h('div');
  wrap.appendChild(h('.pdt-label', 'Input'));
  var inp = h('textarea.pdt-area', { rows: 5, placeholder: 'Paste or type text, JSON, a JWT, a timestamp…', spellcheck: 'false' });

  wrap.appendChild(inp);
  wrap.appendChild(h('.pdt-label', 'Actions'));

  var outCard = h('.pdt-card');
  var out = h('pre.pdt-mono', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '.85em', color: 'var(--fg2)', margin: 0, maxHeight: '40vh', overflow: 'auto' } }, '(output appears here)');
  var outVal = null;

  function show(label, text) {
    outVal = String(text);
    outCard.textContent = '';
    outCard.appendChild(h('.pdt-row', [
      h('span.pdt-label', { style: { margin: 0 } }, label),
      h('span.pdt-grow'),
      h('button.pdt-ib', { type: 'button', title: 'Copy', onclick: function () { copyText(outVal); } }, iconEl('copy', 14)),
      h('button.pdt-ib', { type: 'button', title: 'Use as input', onclick: function () { inp.value = outVal; toast('Output moved to input'); } }, iconEl('up', 14))
    ]));
    outCard.appendChild(out);
    out.textContent = outVal || '(empty)';
    out.scrollIntoView({ block: 'nearest' });
  }
  function err(e) { show('Error', e && (e.message || e) || String(e)); }

  function btn(label, fn) {
    var b = h('button.pdt-btn', { type: 'button' }, label);
    b.addEventListener('click', function () {
      var v = inp.value;
      if (!v.trim()) { toast('Enter some input first'); return; }
      try { fn(v); } catch (e) { err(e); }
    });
    return b;
  }

  var grid = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } });

  /* base64 */
  grid.appendChild(btn('Base64 \u2192', function (v) { show('Base64', b64EncodeUtf8(v) || '(failed)'); }));
  grid.appendChild(btn('\u2190 Base64', function (v) {
    var d = b64DecodeUtf8(v.trim());
    if (d == null) throw new Error('Not valid Base64');
    show('Decoded', d);
  }));
  /* url */
  grid.appendChild(btn('URL \u2192', function (v) { show('URL encoded', encodeURIComponent(v)); }));
  grid.appendChild(btn('\u2190 URL', function (v) { show('URL decoded', safeDecodeURIComponent(v.trim())); }));
  /* json */
  grid.appendChild(btn('JSON pretty', function (v) {
    show('JSON (pretty)', JSON.stringify(JSON.parse(v), null, 2));
  }));
  grid.appendChild(btn('JSON minify', function (v) {
    show('JSON (minified)', JSON.stringify(JSON.parse(v)));
  }));
  grid.appendChild(btn('JSON validate', function (v) {
    JSON.parse(v);
    show('Validation', 'Valid JSON \u2713\n' + v.trim().length + ' characters');
  }));
  grid.appendChild(btn('JSON escape', function (v) {
    show('Escaped', JSON.stringify(v).slice(1, -1));
  }));
  grid.appendChild(btn('JSON unescape', function (v) {
    show('Unescaped', JSON.parse('"' + v.trim().replace(/\n/g, '\\n') + '"'));
  }));
  /* html */
  grid.appendChild(btn('HTML escape', function (v) {
    show('HTML escaped', v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
  }));
  grid.appendChild(btn('HTML unescape', function (v) {
    var t = document.createElement('textarea');
    t.innerHTML = v;
    show('HTML unescaped', t.value);
  }));
  /* jwt */
  grid.appendChild(btn('Decode JWT', function (v) {
    var j = jwtDecode(v);
    if (!j) throw new Error('Not a valid JWT');
    var lines = ['/* header */', JSON.stringify(j.header, null, 2), '', '/* payload */', JSON.stringify(j.payload, null, 2)];
    if (j.payload && j.payload.exp) {
      var exp = new Date(j.payload.exp * 1000);
      lines.push('', 'Expires: ' + exp.toISOString() + (Date.now() > j.payload.exp * 1000 ? '  \u26A0 EXPIRED' : '  \u2713 still valid'));
    }
    if (j.signature) lines.push('', '/* signature (not verified) */', j.signature.slice(0, 43) + '\u2026');
    show('JWT decoded', lines.join('\n'));
  }));
  /* timestamp */
  grid.appendChild(btn('Unix \u2192 date', function (v) {
    var n = Number(v.trim());
    if (isNaN(n)) throw new Error('Not a number');
    if (n < 1e11) n *= 1000;   /* seconds vs milliseconds */
    var d = new Date(n);
    if (isNaN(d.getTime())) throw new Error('Out of range');
    show('Date', d.toISOString() + '\nLocal: ' + d.toString() + '\nRelative: ' + timeAgo(n));
  }));
  grid.appendChild(btn('Date \u2192 unix', function (v) {
    var d = new Date(v.trim());
    if (isNaN(d.getTime())) throw new Error('Could not parse date');
    show('Unix', Math.floor(d.getTime() / 1000) + ' s  =  ' + d.getTime() + ' ms');
  }));
  grid.appendChild(h('button.pdt-btn', { type: 'button', onclick: function () { inp.value = String(Math.floor(Date.now() / 1000)); toast('Current unix time inserted'); } }, 'Now (unix)'));
  /* uuid */
  grid.appendChild(h('button.pdt-btn', { type: 'button', onclick: function () {
    var u = (crypto && crypto.randomUUID) ? crypto.randomUUID() : uid() + '-' + uid();
    inp.value = u;
    show('UUID v4', u);
  } }, 'UUID v4'));
  /* hashes */
  [['SHA-1', 'SHA-1'], ['SHA-256', 'SHA-256'], ['SHA-512', 'SHA-512']].forEach(function (hh) {
    var b = h('button.pdt-btn', { type: 'button' }, hh[0]);
    b.addEventListener('click', function () {
      var v = inp.value;
      if (!v.trim()) { toast('Enter some input first'); return; }
      if (!(crypto && crypto.subtle)) { toast('crypto.subtle needs HTTPS'); return; }
      crypto.subtle.digest(hh[1], new TextEncoder().encode(v)).then(function (buf) {
        var hex = [];
        new Uint8Array(buf).forEach(function (x) { hex.push(('0' + x.toString(16)).slice(-2)); });
        show(hh[0] + ' hash', hex.join(''));
      }, function () { toast('Hash failed'); });
    });
    grid.appendChild(b);
  });
  wrap.appendChild(grid);
  wrap.appendChild(outCard);
  return wrap;
}

function timeAgo(ts) {
  var s = Math.round((Date.now() - ts) / 1000);
  var future = s < 0; s = Math.abs(s);
  function p(n, u) { return n + ' ' + u + (n === 1 ? '' : 's'); }
  var txt;
  if (s < 60) txt = p(s, 'second');
  else if (s < 3600) txt = p(Math.floor(s / 60), 'minute');
  else if (s < 86400) txt = p(Math.floor(s / 3600), 'hour');
  else txt = p(Math.floor(s / 86400), 'day');
  return future ? 'in ' + txt : txt + ' ago';
}

/* ================= Regex ================= */
function buildTkRegex() {
  var wrap = h('div');
  var patIn = h('input.pdt-input.pdt-mono', { placeholder: 'Pattern, e.g. (\\w+)@(\\w+)\\.com', autocapitalize: 'off', spellcheck: 'false' });
  var flagsIn = h('input.pdt-input.pdt-mono', { value: 'g', style: { width: '86px', flex: 'none' }, autocapitalize: 'off', spellcheck: 'false' });
  var testIn = h('textarea.pdt-area', { rows: 6, placeholder: 'Test text…', spellcheck: 'false' });

  var resultCard = h('.pdt-card');
  var result = h('div');
  resultCard.appendChild(result);

  function run() {
    result.textContent = '';
    var pat = patIn.value, flags = flagsIn.value || '';
    if (!pat) { result.appendChild(h('.pdt-empty', 'Enter a pattern above.')); return; }
    var re;
    try { re = new RegExp(pat, flags.replace(/[^gimsuy]/g, '')); }
    catch (e) { result.appendChild(h('.pdt-cent', { dataset: { lv: 'error' } }, e.message || String(e))); return; }

    var text = testIn.value;
    if (!text) { result.appendChild(h('.pdt-empty', 'Enter test text to see matches.')); return; }

    var matches = [];
    if (re.global) {
      var m, guard = 0;
      while ((m = re.exec(text)) && guard++ < 500) {
        matches.push(m);
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    } else {
      var one = re.exec(text);
      if (one) matches.push(one);
    }

    /* highlighted preview */
    var hl = h('pre.pdt-mono', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '.85em', lineHeight: '1.7', margin: '0 0 10px' } });
    var last2 = 0;
    matches.forEach(function (m) {
      if (m.index > last2) hl.appendChild(document.createTextNode(text.slice(last2, m.index)));
      hl.appendChild(h('mark', { style: { background: 'rgba(91,157,255,.35)', color: 'inherit', borderRadius: '3px', padding: '0 1px' } }, m[0]));
      last2 = m.index + m[0].length;
    });
    hl.appendChild(document.createTextNode(text.slice(last2)));
    result.appendChild(h('.pdt-label', 'Preview'));
    result.appendChild(hl);
    result.appendChild(h('.pdt-label', matches.length + ' match(es)'));

    var list = h('div');
    matches.slice(0, 100).forEach(function (m, i) {
      var rows = [kv('#' + (i + 1), truncate(m[0], 60) + '  @ ' + m.index)];
      for (var g = 1; g < m.length; g++) {
        rows.push(kv('group ' + g, m[g] == null ? '(undefined)' : truncate(String(m[g]), 60)));
      }
      if (m.groups) {
        for (var gn in m.groups) rows.push(kv('"' + gn + '"', truncate(String(m.groups[gn]), 60)));
      }
      list.appendChild(h('.pdt-kvwrap', rows));
    });
    result.appendChild(list);
    if (matches.length > 100) result.appendChild(h('.pdt-label', '\u2026 and ' + (matches.length - 100) + ' more'));
  }

  patIn.addEventListener('input', debounce(run, 300));
  flagsIn.addEventListener('input', debounce(run, 300));
  testIn.addEventListener('input', debounce(run, 300));

  wrap.appendChild(h('.pdt-label', 'Pattern'));
  wrap.appendChild(h('.pdt-row', [patIn, flagsIn]));
  wrap.appendChild(h('.pdt-label', 'Test text'));
  wrap.appendChild(testIn);
  wrap.appendChild(h('.pdt-row', { style: { margin: '8px 0', flexWrap: 'wrap' } },
    ['[a-z]+', '\\d+', '^[\\w.-]+@[\\w.-]+\\.\\w+$', 'https?://[^\\s]+'].map(function (p) {
      var b = h('button.pdt-chip', { type: 'button' }, truncate(p, 22));
      b.addEventListener('click', function () { patIn.value = p; run(); });
      return b;
    })));
  wrap.appendChild(resultCard);
  setTimeout(run, 30);
  return wrap;
}

/* ================= Color ================= */
function buildTkColor() {
  var wrap = h('div');

  /* single color inspector */
  var card = h('.pdt-card');
  var picker = h('input', { type: 'color', value: '#5b9dff', style: { width: '52px', height: '40px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg2)', padding: '2px', flex: 'none' } });
  var hexIn = h('input.pdt-input.pdt-mono', { value: '#5b9dff', autocapitalize: 'off', spellcheck: 'false' });
  card.appendChild(h('.pdt-row', [picker, hexIn]));
  var outs = h('div', { style: { marginTop: '8px' } });
  card.appendChild(outs);

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    var h = 0, s = mx === 0 ? 0 : d / mx, v = mx;
    if (d) {
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = ((b - r) / d + 2);
      else h = ((r - g) / d + 4);
      h *= 60;
    }
    return 'hsv(' + Math.round(h) + ', ' + Math.round(s * 100) + '%, ' + Math.round(v * 100) + '%)';
  }
  function rgbToCmyk(r, g, b) {
    var rr = r / 255, gg = g / 255, bb = b / 255;
    var k = 1 - Math.max(rr, gg, bb);
    if (k >= 1) return 'cmyk(0%, 0%, 0%, 100%)';
    var c = (1 - rr - k) / (1 - k), m = (1 - gg - k) / (1 - k), y = (1 - bb - k) / (1 - k);
    return 'cmyk(' + Math.round(c * 100) + '%, ' + Math.round(m * 100) + '%, ' + Math.round(y * 100) + '%, ' + Math.round(k * 100) + '%)';
  }
  function drawColor() {
    var rgb = parseColorStr(hexIn.value);
    outs.textContent = '';
    if (!rgb) {
      outs.appendChild(h('.pdt-cent', { dataset: { lv: 'error' } }, 'Could not parse "' + truncate(hexIn.value, 30) + '" — use hex, rgb() or hsl()'));
      return;
    }
    var hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    picker.value = hex;
    outs.appendChild(h('.pdt-swatch', { style: { width: '100%', justifyContent: 'flex-start' } }, [
      h('i', { style: { background: hex, width: '38px', height: '24px' } }),
      h('span.pdt-grow.pdt-mono', { style: { fontSize: '.85em' } }, hex)
    ]));
    outs.appendChild(kv('RGB', 'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')'));
    outs.appendChild(kv('HSL', rgbToHsl(rgb.r, rgb.g, rgb.b)));
    outs.appendChild(kv('HSV', rgbToHsv(rgb.r, rgb.g, rgb.b)));
    outs.appendChild(kv('CMYK', rgbToCmyk(rgb.r, rgb.g, rgb.b)));
    outs.appendChild(kv('Luminance', (Math.round(relLuminance(rgb.r, rgb.g, rgb.b) * 1000) / 1000)));
  }
  picker.addEventListener('input', function () { hexIn.value = picker.value; drawColor(); });
  hexIn.addEventListener('input', debounce(drawColor, 200));
  drawColor();
  wrap.appendChild(card);

  /* contrast checker */
  var cc = h('.pdt-card');
  cc.appendChild(h('.pdt-label', 'Contrast checker (WCAG)'));
  var fgPick = h('input', { type: 'color', value: '#e8eaed', style: { width: '46px', height: '34px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg2)', padding: '2px' } });
  var bgPick = h('input', { type: 'color', value: '#1e1f24', style: { width: '46px', height: '34px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg2)', padding: '2px' } });
  var swapBtn = h('button.pdt-ib', { type: 'button', title: 'Swap', onclick: function () {
    var t = fgPick.value; fgPick.value = bgPick.value; bgPick.value = t; drawContrast();
  } }, iconEl('repeat', 14));
  cc.appendChild(h('.pdt-row', [fgPick, swapBtn, bgPick]));
  var cOut = h('div', { style: { marginTop: '8px' } });
  cc.appendChild(cOut);
  function drawContrast() {
    var fg = parseColorStr(fgPick.value), bg = parseColorStr(bgPick.value);
    var ratio = contrastRatio(fg, bg);
    var norm = ratio >= 4.5, large = ratio >= 3, aaa = ratio >= 7;
    cOut.textContent = '';
    var preview = h('div', {
      style: {
        background: bgPick.value, color: fgPick.value, padding: '10px', borderRadius: '8px',
        fontSize: '.95em', marginBottom: '8px', border: '1px solid var(--border)'
      }
    }, 'The quick brown fox jumps over 1,234 lazy dogs.');
    cOut.appendChild(preview);
    cOut.appendChild(kv('Contrast ratio', ratio.toFixed(2) + ':1'));
    cOut.appendChild(kv('AA normal text', ratio >= 4.5 ? '\u2713 pass' : '\u2717 fail (' + ratio.toFixed(2) + ' < 4.5)'));
    cOut.appendChild(kv('AA large text', ratio >= 3 ? '\u2713 pass' : '\u2717 fail (' + ratio.toFixed(2) + ' < 3)'));
    cOut.appendChild(kv('AAA normal text', ratio >= 7 ? '\u2713 pass' : '\u2717 fail (' + ratio.toFixed(2) + ' < 7)'));
    cOut.appendChild(kv('AAA large text', ratio >= 4.5 ? '\u2713 pass' : '\u2717 fail (' + ratio.toFixed(2) + ' < 4.5)'));
  }
  fgPick.addEventListener('input', drawContrast);
  bgPick.addEventListener('input', drawContrast);
  drawContrast();
  wrap.appendChild(cc);

  /* page palette */
  var pc = h('.pdt-card');
  pc.appendChild(h('.pdt-label', 'Colors used on this page'));
  var palBtn = h('button.pdt-btn', { type: 'button' }, [iconEl('droplet', 14), 'Extract palette']);
  var palOut = h('div', { style: { marginTop: '8px' } });
  palBtn.addEventListener('click', function () {
    var colors = {};
    try {
      Array.prototype.forEach.call(document.querySelectorAll('body *'), function (el) {
        if (el.id === 'pdt-host' || (hostEl && hostEl.contains(el))) return;
        var cs;
        try { cs = getComputedStyle(el); } catch (e) { return; }
        ['color', 'backgroundColor', 'borderTopColor'].forEach(function (p) {
          var v = cs.getPropertyValue(p);
          var rgb = parseColorStr(v);
          if (rgb && !(rgb.r > 250 && rgb.g > 250 && rgb.b > 250)) {
            var hex = rgbToHex(rgb.r, rgb.g, rgb.b);
            colors[hex] = (colors[hex] || 0) + 1;
          }
        });
      });
    } catch (e) { /* noop */ }
    var list = Object.keys(colors).sort(function (a, b) { return colors[b] - colors[a]; }).slice(0, 24);
    palOut.textContent = '';
    if (!list.length) { palOut.appendChild(h('.pdt-empty', 'No colors found.')); return; }
    var grid = h('.pdt-row', { style: { flexWrap: 'wrap' } });
    list.forEach(function (hex) {
      var sw = h('button.pdt-swatch', { title: hex + ' (' + colors[hex] + '\u00D7) — tap to copy' }, [
        h('i', { style: { background: hex } }), hex
      ]);
      sw.addEventListener('click', function () { copyText(hex, true); toast('Copied ' + hex); });
      grid.appendChild(sw);
    });
    palOut.appendChild(grid);
  });
  pc.appendChild(palBtn);
  pc.appendChild(palOut);
  wrap.appendChild(pc);
  return wrap;
}

/* ================= QR ================= */
function buildTkQr() {
  var wrap = h('div');
  var textIn = h('textarea.pdt-area', { rows: 3, placeholder: 'Text or URL to encode…', spellcheck: 'false' });
  textIn.value = location.href;

  var ecSel = h('select.pdt-select', { style: { width: '150px', flex: 'none' } });
  [['M', 'EC level M (recommended)'], ['L', 'EC level L (more data)']].forEach(function (o) {
    var op = h('option', o[1]);
    op.value = o[0];
    ecSel.appendChild(op);
  });
  var scaleSel = h('select.pdt-select', { style: { width: '130px', flex: 'none' } });
  [['3', 'Small'], ['5', 'Medium'], ['8', 'Large']].forEach(function (o) {
    var op = h('option', o[1]);
    op.value = o[0];
    scaleSel.appendChild(op);
  });
  scaleSel.value = '5';

  var canvas = h('canvas', { style: { display: 'block', margin: '12px auto', background: '#fff', borderRadius: '10px', border: '1px solid var(--border)', maxWidth: '100%' } });
  var info = h('.pdt-label', { style: { textAlign: 'center' } }, '');

  function render() {
    try {
      var qr = qrRender(canvas, textIn.value || ' ', parseInt(scaleSel.value, 10) || 5, ecSel.value);
      info.textContent = 'Version ' + qr.version + ' (' + qr.size + '\u00D7' + qr.size + ') · ' +
        (textIn.value.length) + ' chars · ' + qr.ec;
      info.style.color = 'var(--muted)';
    } catch (e) {
      info.textContent = e.message || String(e);
      info.style.color = 'var(--err)';
    }
  }
  textIn.addEventListener('input', debounce(render, 300));
  ecSel.addEventListener('change', render);
  scaleSel.addEventListener('change', render);

  wrap.appendChild(h('.pdt-label', 'Content'));
  wrap.appendChild(textIn);
  wrap.appendChild(h('.pdt-row', { style: { margin: '8px 0' } }, [
    h('button.pdt-btn', { type: 'button', onclick: function () { textIn.value = location.href; render(); } }, [iconEl('link', 14), 'Page URL']),
    h('span.pdt-grow'),
    ecSel, scaleSel
  ]));
  wrap.appendChild(canvas);
  wrap.appendChild(info);
  wrap.appendChild(h('.pdt-row', { style: { justifyContent: 'center' } }, [
    h('button.pdt-btn', { type: 'button', onclick: function () {
      try {
        var a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = 'qr-' + Date.now() + '.png';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { a.remove(); }, 300);
        toast('QR code downloaded');
      } catch (e) { toast('Download failed'); }
    } }, [iconEl('download', 14), 'Download PNG'])
  ]));
  wrap.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em', color: 'var(--muted)' } },
    'Scan with any camera app. Great for sending the current URL to another device or sharing Wi-Fi credentials.'));
  setTimeout(render, 30);
  return wrap;
}

/* ================= Media ================= */
function buildTkMedia() {
  var wrap = h('div');
  var meds = [];
  try {
    meds = Array.prototype.slice.call(document.querySelectorAll('video, audio'));
  } catch (e) { /* noop */ }

  if (!meds.length) {
    return h('.pdt-empty', 'No <video> or <audio> elements on this page.');
  }

  /* global controls */
  var g = h('.pdt-row', { style: { flexWrap: 'wrap', marginBottom: '10px' } });
  [
    ['Pause all', 'pause', function () { meds.forEach(function (m) { m.pause(); }); }],
    ['Mute all', 'alert', function () { meds.forEach(function (m) { m.muted = true; }); }],
    ['Unmute all', 'unlock', function () { meds.forEach(function (m) { m.muted = false; }); }],
    ['Loop all', 'repeat', function () { meds.forEach(function (m) { m.loop = !m.loop; }); toast('Toggled loop on ' + meds.length + ' element(s)'); }]
  ].forEach(function (t) {
    var b = h('button.pdt-btn', { type: 'button' }, [iconEl(t[1], 14), t[0]]);
    b.addEventListener('click', t[2]);
    g.appendChild(b);
  });
  wrap.appendChild(g);

  function mediaCard(m, i) {
    var isVideo = m.tagName === 'VIDEO';
    var card = h('.pdt-card');
    var state = h('span.pdt-badge.b-other', m.paused ? 'paused' : 'playing');
    var name = (m.title || m.src || (isVideo ? 'video' : 'audio') + ' #' + (i + 1));

    /* play/pause + title row */
    var playBtn = h('button.pdt-ib', { type: 'button', title: 'Play / pause' }, iconEl(m.paused ? 'play' : 'pause', 18));
    playBtn.addEventListener('click', function () {
      if (m.paused) { m.play().catch(function () { toast('Playback blocked'); }); }
      else m.pause();
    });
    card.appendChild(h('.pdt-row', [
      playBtn,
      h('span.pdt-grow', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '.9em' } }, truncate(name, 34)),
      state
    ]));

    /* time + seek */
    var cur = h('span.pdt-mono', { style: { fontSize: '.8em', color: 'var(--muted)', flex: 'none', width: '44px' } }, fmtClock(m.currentTime));
    var dur = h('span.pdt-mono', { style: { fontSize: '.8em', color: 'var(--muted)', flex: 'none', width: '44px', textAlign: 'right' } }, fmtClock(isFinite(m.duration) ? m.duration : 0));
    var seek = h('input', { type: 'range', min: '0', max: '100', step: '0.1', value: '0', style: { flex: '1' } });
    function fmtClock(s) {
      if (!isFinite(s) || s < 0) s = 0;
      var mm = Math.floor(s / 60), ss = Math.floor(s % 60);
      return mm + ':' + (ss < 10 ? '0' : '') + ss;
    }
    seek.addEventListener('input', function () {
      if (isFinite(m.duration)) m.currentTime = (seek.value / 100) * m.duration;
    });
    card.appendChild(h('.pdt-row', { style: { marginTop: '8px' } }, [cur, seek, dur]));

    /* speed */
    var speedVal = h('span.pdt-mono', { style: { fontSize: '.82em', flex: 'none', width: '40px', textAlign: 'right' } }, (m.playbackRate || 1) + '\u00D7');
    var speed = h('input', { type: 'range', min: '0.25', max: '4', step: '0.05', value: String(m.playbackRate || 1) });
    speed.addEventListener('input', function () {
      m.playbackRate = parseFloat(speed.value);
      speedVal.textContent = speed.value + '\u00D7';
    });
    card.appendChild(h('.pdt-row', { style: { marginTop: '6px' } }, [
      h('span', { style: { fontSize: '.8em', color: 'var(--muted)', flex: 'none' } }, 'Speed'), speed, speedVal
    ]));

    /* quick chips */
    var chips = h('.pdt-row', { style: { flexWrap: 'wrap', marginTop: '8px' } });
    [['1\u00D7', 1], ['1.5\u00D7', 1.5], ['2\u00D7', 2], ['3\u00D7', 3]].forEach(function (sp) {
      var c = h('button.pdt-chip', { type: 'button' }, sp[0]);
      c.addEventListener('click', function () {
        m.playbackRate = sp[1];
        speed.value = String(sp[1]);
        speedVal.textContent = sp[0];
      });
      chips.appendChild(c);
    });
    var mute = h('button.pdt-chip' + (m.muted ? '' : '.on'), { type: 'button' }, m.muted ? 'muted' : 'sound');
    mute.addEventListener('click', function () {
      m.muted = !m.muted;
      mute.textContent = m.muted ? 'muted' : 'sound';
      mute.classList.toggle('on', !m.muted);
    });
    chips.appendChild(mute);
    var skipBack = h('button.pdt-chip', { type: 'button' }, '\u221210s');
    skipBack.addEventListener('click', function () { m.currentTime = Math.max(0, m.currentTime - 10); });
    chips.appendChild(skipBack);
    var skipFwd = h('button.pdt-chip', { type: 'button' }, '+10s');
    skipFwd.addEventListener('click', function () { m.currentTime = m.currentTime + 10; });
    chips.appendChild(skipFwd);
    card.appendChild(chips);

    /* live state refresh */
    function refresh() {
      state.textContent = m.paused ? 'paused' : 'playing';
      if (isFinite(m.duration) && m.duration > 0) {
        seek.value = String((m.currentTime / m.duration) * 100);
        cur.textContent = fmtClock(m.currentTime);
      }
      playBtn.textContent = '';
      playBtn.appendChild(iconEl(m.paused ? 'play' : 'pause', 18));
    }
    m.addEventListener('play', refresh);
    m.addEventListener('pause', refresh);
    m.addEventListener('timeupdate', refresh);
    refresh();
    return card;
  }

  meds.slice(0, 20).forEach(function (m, i) { wrap.appendChild(mediaCard(m, i)); });
  if (meds.length > 20) wrap.appendChild(h('.pdt-label', '\u2026 and ' + (meds.length - 20) + ' more'));
  return wrap;
}

registerPanel({
  id: 'toolkit', label: 'Toolkit', icon: 'zap',
  render: function (panel) { panelEls.toolkit = panel; renderToolkitPanel(); },
  onShow: renderToolkitPanel
});
