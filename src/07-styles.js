/*
 * 07-styles.js — box model diagram, computed styles, inline CSS editor,
 *                page color swatches, stylesheet tools
 */

var stSub = 'box';
var stBoxEl = null, stCompEl = null, stColorsEl = null;

function renderStylesPanel() {
  if (!panelEls.styles) return;
  var panel = panelEls.styles;
  panel.textContent = '';

  if (!ctx.selected || !ctx.selected.isConnected) {
    panel.appendChild(h('.pdt-empty', [
      'Select an element first (Elements tab or Inspect mode).',
      h('div', [h('button.pdt-btn.acc', { type: 'button', onclick: function () { startInspect(); } }, [iconEl('inspect', 14), 'Inspect element'])])
    ]));
    return;
  }

  var subs = [['box', 'Box Model'], ['computed', 'Computed'], ['inline', 'Inline CSS'], ['colors', 'Colors'], ['sheets', 'Sheets']];
  var subBar = h('.pdt-sub');
  subs.forEach(function (s) {
    var b = h('button.pdt-subb' + (stSub === s[0] ? '.on' : ''), s[1]);
    b.addEventListener('click', function () { stSub = s[0]; renderStylesPanel(); });
    subBar.appendChild(b);
  });
  panel.appendChild(subBar);

  var scroll = h('.pdt-scroll');
  panel.appendChild(scroll);
  if (stSub === 'box') scroll.appendChild(buildBoxModel());
  else if (stSub === 'computed') scroll.appendChild(buildComputed());
  else if (stSub === 'inline') scroll.appendChild(buildInlineEditor());
  else if (stSub === 'colors') { stColorsEl = scroll; scroll.appendChild(buildColors()); }
  else scroll.appendChild(buildSheets());
}

/* ---------------- box model ---------------- */
function buildBoxModel() {
  var el = ctx.selected;
  var cs = getComputedStyle(el);
  var m = [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft];
  var b = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth];
  var p = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft];
  var r = el.getBoundingClientRect();

  function zone() { /* flat representation below is used instead */ }
  var _ = zone; /* keep signature simple */
  function zbox(cls, top, right, bottom, left, centerLabel, centerSub) {
    var inner = h('div.z.' + cls, { style: { margin: '2px' } }, [
      h('div.lbl', top), h('div.lbl', right), h('div.lbl', centerLabel), h('div.lbl', left), h('div.lbl', bottom)
    ]);
    if (centerSub) inner.appendChild(h('div.lbl', centerSub));
    return inner;
  }

  var diagram = h('.pdt-bm', [
    zbox('zm', m[0], m[1], m[2], m[3], 'margin'),
    zbox('zb', b[0], b[1], b[2], b[3], 'border'),
    zbox('zp', p[0], p[1], p[2], p[3], 'padding'),
    zbox('zc', '', '', '', '', Math.round(r.width) + ' \u00D7 ' + Math.round(r.height) + ' px', el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''))
  ]);

  var info = h('.pdt-card', [
    kv('Content size', Math.round(r.width - px(p[1]) - px(p[3]) - px(b[1]) - px(b[3])) + ' \u00D7 ' +
      Math.round(r.height - px(p[0]) - px(p[2]) - px(b[0]) - px(b[2])) + ' px'),
    kv('Border box', Math.round(r.width) + ' \u00D7 ' + Math.round(r.height) + ' px'),
    kv('box-sizing', cs.boxSizing),
    kv('display', cs.display),
    kv('position', cs.position),
    kv('z-index', cs.zIndex === 'auto' ? 'auto' : cs.zIndex),
    kv('overflow', cs.overflow + ' / ' + cs.overflowY)
  ]);
  return h('div', [diagram, h('div', { style: { height: '12px' } }), info]);
}
function px(s) { var v = parseFloat(s); return isNaN(v) ? 0 : v; }

/* ---------------- computed styles ---------------- */
var COMPUTED_GROUPS = [
  ['Layout', ['display', 'position', 'width', 'height', 'margin', 'padding', 'border', 'box-sizing', 'flex-direction', 'justify-content', 'align-items', 'grid-template-columns', 'gap', 'overflow', 'float', 'z-index']],
  ['Typography', ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'text-transform', 'text-decoration', 'white-space', 'color']],
  ['Visual', ['background-color', 'background-image', 'opacity', 'border-radius', 'box-shadow', 'transform', 'filter', 'cursor', 'pointer-events', 'visibility']],
  ['Flex/Grid item', ['flex', 'flex-grow', 'flex-shrink', 'align-self', 'order', 'grid-area']]
];
function buildComputed() {
  var el = ctx.selected;
  var cs = getComputedStyle(el);
  var wrap = h('div');
  var search = h('input.pdt-input', { type: 'search', placeholder: 'Filter properties', style: { marginBottom: '10px' } });
  var list = h('div');
  function draw() {
    list.textContent = '';
    var q = search.value.toLowerCase();
    COMPUTED_GROUPS.forEach(function (g) {
      var rows = [];
      g[1].forEach(function (prop) {
        var v = '';
        try { v = cs.getPropertyValue(prop); } catch (e) { return; }
        if (!v) return;
        if (q && (prop + ' ' + v).toLowerCase().indexOf(q) < 0) return;
        rows.push(kv(prop, truncate(v, 90)));
      });
      if (rows.length) {
        list.appendChild(h('.pdt-label', g[0]));
        rows.forEach(function (r) { list.appendChild(r); });
      }
    });
    if (!list.children.length) list.appendChild(h('.pdt-empty', 'No matching properties'));
  }
  search.addEventListener('input', debounce(draw, 150));
  draw();
  wrap.appendChild(search);
  wrap.appendChild(list);
  return wrap;
}

/* ---------------- inline CSS editor ---------------- */
function buildInlineEditor() {
  var el = ctx.selected;
  var area = h('textarea.pdt-area', { rows: 8, spellcheck: 'false', placeholder: 'color: red; font-size: 20px;' });
  area.value = el.style.cssText || '';
  var out = h('div', [
    h('.pdt-label', 'element.style { }'),
    area,
    h('.pdt-row', { style: { marginTop: '10px' } }, [
      h('button.pdt-btn.acc', { type: 'button', onclick: function () {
        el.setAttribute('style', area.value);
        toast('Inline styles applied');
        renderStylesPanel();
      } }, [iconEl('check', 14), 'Apply live']),
      h('button.pdt-btn.danger', { type: 'button', onclick: function () {
        el.removeAttribute('style'); area.value = ''; toast('Inline styles removed');
      } }, [iconEl('trash', 14), 'Clear all'])
    ])
  ]);
  return out;
}

/* ---------------- colors ---------------- */
function collectColors() {
  var found = {};
  function add(v) {
    v = String(v || '').trim();
    if (!v || v === '' || v === 'none' || v === 'transparent' || v.indexOf('var(') === 0) return;
    if (/^(#([0-9a-f]{3,8})|rgba?\(|hsla?\()/i.test(v)) found[v] = 1;
  }
  try {
    var cs = getComputedStyle(ctx.selected);
    ['color', 'background-color', 'border-top-color', 'outline-color', 'text-decoration-color', 'fill', 'stroke', 'caret-color'].forEach(function (p) { add(cs.getPropertyValue(p)); });
  } catch (e) { /* noop */ }
  try {
    Array.prototype.forEach.call(document.styleSheets, function (ss) {
      var rules = ss.cssRules;
      if (!rules) return;
      Array.prototype.forEach.call(rules, function (r) {
        var s = r.style;
        if (!s) return;
        for (var i = 0; i < s.length; i++) {
          var prop = s[i];
          if (/color|background|border|fill|stroke|outline/i.test(prop)) add(s.getPropertyValue(prop));
        }
      });
    });
  } catch (e) { /* CORS-protected sheets */ }
  return Object.keys(found).slice(0, 80);
}
function buildColors() {
  var cols = collectColors();
  if (!cols.length) return h('.pdt-empty', 'No colors found');
  var grid = h('div', { style: { display: 'flex', flexWrap: 'wrap' } });
  cols.forEach(function (c) {
    grid.appendChild(h('button.pdt-swatch', { type: 'button', onclick: function () { copyText(c); } }, [
      h('i', { style: { background: c } }), c
    ]));
  });
  return h('div', [h('.pdt-label', 'Tap a color to copy it'), grid]);
}

/* ---------------- stylesheets ---------------- */
function buildSheets() {
  var wrap = h('div');
  var sheets = [];
  try { sheets = Array.prototype.slice.call(document.styleSheets); } catch (e) { /* noop */ }
  if (!sheets.length) wrap.appendChild(h('.pdt-empty', 'No stylesheets found'));

  sheets.forEach(function (ss, i) {
    var count = 0, access = true;
    try { count = ss.cssRules ? ss.cssRules.length : 0; } catch (e) { access = false; }
    var name = ss.href ? clipUrl(ss.href) : 'inline <style> #' + (i + 1);
    var dis = ss.disabled;
    var card = h('.pdt-card', [
      h('.pdt-row', [
        h('span.pdt-grow.pdt-mono', truncate(name, 46)),
        h('button.pdt-ib', { type: 'button', title: 'Copy CSS', onclick: function () {
          copyStylesheet(ss);
        } }, iconEl('copy', 14))
      ]),
      kv('Rules', access ? String(count) : 'blocked (CORS)'),
      h('button.pdt-btn' + (dis ? '' : '.on'), { type: 'button', style: { marginTop: '6px' }, onclick: function () {
        try { ss.disabled = !ss.disabled; renderStylesPanel(); } catch (e) { toast('Cannot toggle this sheet'); }
      } }, [iconEl('eye', 14), dis ? 'Enable sheet' : 'Disable sheet'])
    ]);
    wrap.appendChild(card);
  });

  /* live page CSS editor */
  var area = h('textarea.pdt-area', { rows: 6, spellcheck: 'false', placeholder: '/* custom CSS applied to this page */\n* { outline: 1px solid rgba(255,0,0,.3); }' });
  var existing = document.getElementById('pdt-page-css');
  if (existing) area.value = existing.textContent;
  wrap.appendChild(h('.pdt-label', 'Custom page CSS (live)'));
  wrap.appendChild(area);
  wrap.appendChild(h('.pdt-row', { style: { marginTop: '8px' } }, [
    h('button.pdt-btn.acc', { type: 'button', onclick: function () {
      var st = document.getElementById('pdt-page-css');
      if (!st) {
        st = document.createElement('style');
        st.id = 'pdt-page-css';
        (document.head || document.documentElement).appendChild(st);
      }
      st.textContent = area.value;
      toast('Custom CSS applied');
    } }, [iconEl('check', 14), 'Apply CSS']),
    h('button.pdt-btn', { type: 'button', onclick: function () {
      var st = document.getElementById('pdt-page-css');
      if (st) st.remove();
      area.value = '';
      toast('Custom CSS removed');
    } }, [iconEl('trash', 14), 'Remove'])
  ]));
  return wrap;
}
function copyStylesheet(ss) {
  var text = '';
  try {
    if (ss.href) {
      fetch(ss.href).then(function (r) { return r.text(); }).then(function (t) { copyText(t); }, function () { toast('Could not fetch stylesheet'); });
      return;
    }
    Array.prototype.forEach.call(ss.cssRules, function (r) { text += r.cssText + '\n\n'; });
    copyText(text);
  } catch (e) { toast('Stylesheet blocked by CORS'); }
}

registerPanel({
  id: 'styles', label: 'Styles', icon: 'styles',
  render: function (panel) { panelEls.styles = panel; renderStylesPanel(); },
  onShow: renderStylesPanel
});
