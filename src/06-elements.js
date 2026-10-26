/*
 * 06-elements.js — inspect mode (touch-friendly), DOM tree, selected-element editor
 */

var inspectOn = false, ovlBox = null, ovlLabel = null;
var elTreeEl = null, elDetailEl = null, elSub = 'tree';

/* ---------------- inspect mode ---------------- */
function toggleInspect() { inspectOn ? stopInspect(true) : startInspect(); }

function startInspect() {
  if (inspectOn) return;
  inspectOn = true;
  ovlBox = document.createElement('div');
  ovlBox.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #5b9dff;' +
    'background:rgba(91,157,255,.12);border-radius:3px;display:none;box-shadow:0 0 0 1px rgba(0,0,0,.35)';
  ovlLabel = document.createElement('div');
  ovlLabel.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;display:none;' +
    'background:#1e1f24;color:#fff;font:600 11px/1.4 -apple-system,Roboto,sans-serif;padding:3px 8px;' +
    'border-radius:6px;white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis';
  document.body.appendChild(ovlBox);
  document.body.appendChild(ovlLabel);
  document.addEventListener('touchstart', inspTouch, true);
  document.addEventListener('touchmove', inspTouch, true);
  document.addEventListener('touchend', inspEnd, true);
  document.addEventListener('mousemove', inspMouse, true);
  document.addEventListener('click', inspClick, true);
  toast('Inspect: touch an element, release to select');
  var b = root.querySelector('.pdt-ib[title="Inspect element"]');
  if (b) b.style.color = 'var(--accent)';
}

function stopInspect(cancel) {
  if (!inspectOn) return;
  inspectOn = false;
  document.removeEventListener('touchstart', inspTouch, true);
  document.removeEventListener('touchmove', inspTouch, true);
  document.removeEventListener('touchend', inspEnd, true);
  document.removeEventListener('mousemove', inspMouse, true);
  document.removeEventListener('click', inspClick, true);
  if (ovlBox) { ovlBox.remove(); ovlBox = null; }
  if (ovlLabel) { ovlLabel.remove(); ovlLabel = null; }
  var b = root ? root.querySelector('.pdt-ib[title="Inspect element"]') : null;
  if (b) b.style.color = '';
  if (!cancel) toast('Inspection off');
}

function inspTarget(x, y) {
  /* hide our own UI from hit-testing */
  var el = null;
  try { el = document.elementFromPoint(x, y); } catch (e) { return null; }
  while (el && (el === hostEl || (hostEl && hostEl.contains(el)))) el = el.parentElement;
  if (el === document.documentElement || el === document.body) return el;
  return el;
}

function drawHighlight(el) {
  if (!ovlBox || !el) return;
  var r = el.getBoundingClientRect();
  if (r.width < 1 && r.height < 1) { ovlBox.style.display = 'none'; ovlLabel.style.display = 'none'; return; }
  ovlBox.style.display = 'block';
  ovlBox.style.left = r.left + 'px'; ovlBox.style.top = r.top + 'px';
  ovlBox.style.width = r.width + 'px'; ovlBox.style.height = r.height + 'px';
  var desc = el.tagName.toLowerCase();
  if (el.id) desc += '#' + el.id;
  if (el.classList && el.classList.length) desc += '.' + Array.prototype.slice.call(el.classList, 0, 3).join('.');
  desc += '  ' + Math.round(r.width) + ' \u00D7 ' + Math.round(r.height);
  ovlLabel.style.display = 'block';
  ovlLabel.textContent = desc;
  ovlLabel.style.left = Math.max(4, Math.min(window.innerWidth - 160, r.left)) + 'px';
  ovlLabel.style.top = (r.top > 30 ? (r.top - 26) : (r.bottom + 6)) + 'px';
}

var inspLast = null, inspStart = null;
function inspTouch(e) {
  var t = e.touches[0];
  if (!t) return;
  if (!inspStart) inspStart = { x: t.clientX, y: t.clientY, t: Date.now() };
  inspLast = inspTarget(t.clientX, t.clientY);
  drawHighlight(inspLast);
}
function inspEnd(e) {
  var st = inspStart; inspStart = null;
  var el = inspLast; inspLast = null;
  if (!el) return;
  if (st && Date.now() - st.t < 700) {
    selectElement(el);
    stopInspect(false);
    e.preventDefault();
    /* swallow the click that follows the tap */
    document.addEventListener('click', function swallow(ev) {
      ev.stopPropagation(); ev.preventDefault();
      document.removeEventListener('click', swallow, true);
    }, true);
  }
}
function inspMouse(e) {
  if (e.pointerType === 'touch') return;
  inspLast = inspTarget(e.clientX, e.clientY);
  drawHighlight(inspLast);
}
function inspClick(e) {
  if (e.pointerType === 'touch') return;
  e.preventDefault(); e.stopPropagation();
  if (inspLast) { selectElement(inspLast); stopInspect(false); }
}

/* ---------------- selection ---------------- */
function selectElement(el) {
  ctx.selected = el;
  elSub = 'detail';
  if (panelEls.elements) {
    renderElementsPanel();
    expandTo(el);
  }
  switchTab('elements');
}
function expandTo(el) {
  var node = el;
  while (node && node !== document) {
    try { node.__pdtOpen = true; } catch (e) { break; }
    node = node.parentElement;
  }
  if (panelEls.elements) renderTree();
}

function cssSelectorFor(el) {
  if (el.id) return '#' + el.id;
  var parts = [];
  var node = el;
  while (node && node.nodeType === 1 && parts.length < 5) {
    var s = node.tagName.toLowerCase();
    if (node.id) { parts.unshift('#' + node.id); break; }
    var p = node.parentElement;
    if (p) {
      var sibs = Array.prototype.filter.call(p.children, function (c) { return c.tagName === node.tagName; });
      if (sibs.length > 1) s += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
    }
    parts.unshift(s);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

/* ---------------- DOM tree ---------------- */
function renderTree() {
  if (!elTreeEl) return;
  elTreeEl.textContent = '';
  elTreeEl.appendChild(treeNode(document.documentElement, 0));
}

function treeNode(el, depth) {
  var wrap = h('.pdt-node');
  var kids = Array.prototype.slice.call(el.childNodes).filter(function (n) {
    if (n.nodeType === 3) return n.textContent.trim().length > 0;
    return n.nodeType === 1;
  });
  var open = !!el.__pdtOpen;
  var tw = h('span.pdt-tw', open ? '\u25BE' : (kids.length ? '\u25B8' : ''));
  tw.addEventListener('click', function (e) {
    e.stopPropagation();
    el.__pdtOpen = !el.__pdtOpen;
    renderTree();
  });
  var label = h('span.pdt-nrow', [tw]);
  if (ctx.selected === el) label.classList.add('sel');
  var tagSpan = h('span.pdt-tag', '<' + el.tagName.toLowerCase());
  label.appendChild(tagSpan);
  if (el.id) label.appendChild(h('span.pdt-attr', [h('span.an', ' id='), h('span.av', '"' + el.id + '"')]));
  if (el.classList && el.classList.length) {
    label.appendChild(h('span.pdt-attr', [h('span.an', ' class='), h('span.av', '"' + Array.prototype.slice.call(el.classList).join(' ') + '"')]));
  }
  label.appendChild(h('span.pdt-tag', '>'));
  label.addEventListener('click', function () {
    if (ctx.selected === el) { elSub = 'detail'; renderElementsPanel(); }
    else { ctx.selected = el; renderTree(); renderDetail(); }
  });
  wrap.appendChild(indent(depth, label));
  if (open && kids.length) {
    kids.forEach(function (n) {
      if (n.nodeType === 3) {
        wrap.appendChild(indent(depth + 1, h('.pdt-nrow.pdt-ntext', '"' + truncate(n.textContent.trim(), 64) + '"')));
      } else {
        wrap.appendChild(treeNode(n, depth + 1));
      }
    });
  }
  return wrap;
}
function indent(depth, rowEl) {
  if (!depth) return rowEl;
  var sp = h('span', { style: { display: 'inline-block', width: depth * 14 + 'px' } });
  return h('span', [sp, rowEl]);
}

/* ---------------- detail (selected element) ---------------- */
function renderDetail() {
  if (!elDetailEl) return;
  elDetailEl.textContent = '';
  var el = ctx.selected;
  if (!el || !el.isConnected) {
    elDetailEl.appendChild(h('.pdt-empty', 'No element selected.\nUse the crosshair button or Inspect mode.', [
      h('div', [h('button.pdt-btn.acc', { type: 'button', onclick: function () { startInspect(); } }, [iconEl('inspect', 14), 'Inspect element'])])
    ]));
    return;
  }

  /* breadcrumb */
  var crumb = h('.pdt-crumb');
  var chain = [];
  var n = el;
  while (n && n.nodeType === 1 && chain.length < 8) { chain.unshift(n); n = n.parentElement; }
  chain.forEach(function (c, i) {
    if (i) crumb.appendChild(h('i', ' \u203A '));
    var b = h('button', c.tagName.toLowerCase() + (c.id ? '#' + c.id : ''));
    if (c === el) b.classList.add('cur');
    b.addEventListener('click', function () { ctx.selected = c; renderDetail(); renderTree(); });
    crumb.appendChild(b);
  });

  /* info */
  var r = el.getBoundingClientRect();
  var info = h('.pdt-card', [
    kv('Tag', el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')),
    kv('Selector', cssSelectorFor(el)),
    kv('Size', Math.round(r.width) + ' \u00D7 ' + Math.round(r.height) + ' px'),
    kv('Position', Math.round(r.left) + ', ' + Math.round(r.top) + ' (viewport)')
  ]);

  /* classes with toggle chips */
  var clsCard = null;
  if (el.classList && el.classList.length) {
    var chips = h('.pdt-row', { style: { flexWrap: 'wrap' } });
    Array.prototype.forEach.call(el.classList, function (c) {
      var chip = h('button.pdt-chip.on', c);
      chip.addEventListener('click', function () {
        el.classList.toggle(c);
        chip.classList.toggle('on', el.classList.contains(c));
      });
      chips.appendChild(chip);
    });
    clsCard = h('.pdt-card', [h('.pdt-label', 'Classes (tap to toggle)'), chips]);
  }

  /* actions */
  var actions = h('.pdt-row', { style: { flexWrap: 'wrap' } }, [
    h('button.pdt-btn', { type: 'button', onclick: function () { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Scrolled to element'); } }, [iconEl('eye', 14), 'Scroll to']),
    h('button.pdt-btn', { type: 'button', onclick: function () { copyText(el.outerHTML); } }, [iconEl('copy', 14), 'Copy HTML']),
    h('button.pdt-btn', { type: 'button', onclick: function () { copyText(cssSelectorFor(el)); } }, [iconEl('copy', 14), 'Copy selector']),
    h('button.pdt-btn.danger', { type: 'button', onclick: function () {
      confirmModal('Delete this element from the page?', 'Delete', function () {
        var p = el.parentElement;
        if (p) { p.removeChild(el); ctx.selected = p; renderDetail(); renderTree(); toast('Element deleted'); }
      }, true);
    } }, [iconEl('trash', 14), 'Delete'])
  ]);

  /* attributes editor */
  var attrsCard = h('.pdt-card');
  attrsCard.appendChild(h('.pdt-label', 'Attributes'));
  var attrRows = [];
  var attrList = h('div');
  function renderAttrs() {
    attrList.textContent = '';
    attrRows = [];
    Array.prototype.forEach.call(el.attributes, function (a) {
      var nameEl = h('input.pdt-input', { value: a.name, style: { width: '34%' }, readOnly: true });
      var valEl = h('input.pdt-input.pdt-grow', { value: a.value });
      var del = h('button.pdt-ib', { type: 'button', onclick: function () {
        el.removeAttribute(a.name); renderDetail();
      } }, iconEl('trash', 14));
      var row = h('.pdt-row', { style: { marginBottom: '6px' } }, [nameEl, valEl, del]);
      attrRows.push({ name: a.name, input: valEl });
      attrList.appendChild(row);
    });
    if (!el.attributes.length) attrList.appendChild(h('.pdt-empty', 'No attributes'));
  }
  renderAttrs();
  var newName = h('input.pdt-input', { placeholder: 'name', style: { width: '34%' } });
  var newVal = h('input.pdt-input.pdt-grow', { placeholder: 'value' });
  attrList.appendChild(h('.pdt-row', [newName, newVal,
    h('button.pdt-ib', { type: 'button', onclick: function () {
      if (!newName.value.trim()) { toast('Attribute name required'); return; }
      el.setAttribute(newName.value.trim(), newVal.value);
      renderDetail();
    } }, iconEl('plus', 14))
  ]));
  attrsCard.appendChild(attrList);

  elDetailEl.appendChild(crumb);
  elDetailEl.appendChild(h('.pdt-scroll', [info, clsCard, attrsCard, h('.pdt-label', 'Actions'), actions]));
}

function kv(k, v) { return h('.pdt-kv', [h('b', k), h('span', String(v))]); }

/* ---------------- panel ---------------- */
function renderElementsPanel() {
  if (!panelEls.elements) return;
  var panel = panelEls.elements;
  panel.textContent = '';
  var subTree = h('button.pdt-subb' + (elSub === 'tree' ? '.on' : ''), 'Tree');
  var subDet = h('button.pdt-subb' + (elSub === 'detail' ? '.on' : ''), 'Selected');
  subTree.addEventListener('click', function () { elSub = 'tree'; renderElementsPanel(); });
  subDet.addEventListener('click', function () { elSub = 'detail'; renderElementsPanel(); });

  var top = h('.pdt-toolbar', [
    h('button.pdt-btn', { type: 'button', onclick: function () { startInspect(); } }, [iconEl('inspect', 14), 'Inspect']),
    h('span.pdt-grow')
  ]);
  panel.appendChild(top);
  panel.appendChild(h('.pdt-sub', [subTree, subDet]));

  elTreeEl = h('.pdt-scroll');
  elDetailEl = h('.pdt-scroll');
  if (elSub === 'tree') { elDetailEl.style.display = 'none'; } else { elTreeEl.style.display = 'none'; }
  panel.appendChild(elTreeEl);
  panel.appendChild(elDetailEl);
  renderTree();
  renderDetail();
}

registerPanel({
  id: 'elements', label: 'Elements', icon: 'elements',
  render: function (panel) {
    panelEls.elements = panel;
    renderElementsPanel();
  },
  onShow: function () { if (ctx.selected && !ctx.selected.isConnected) { ctx.selected = null; renderDetail(); } }
});
