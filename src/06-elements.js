/*
 * 06-elements.js — inspect mode (touch-friendly), DOM tree, selected-element editor,
 *                event listener capture, Edit HTML, XPath
 */

var inspectOn = false, ovlBox = null, ovlLabel = null;
var elTreeEl = null, elDetailEl = null, elEvEl = null, elSub = 'tree';

/* ---------------- event listener capture (installed at load) ----------------
 * Records every addEventListener()/removeEventListener() call made AFTER DevTools
 * loaded (up to 5000), so the Events tab can list them per element. */
var evtListeners = [];
var EVT_CAP = 5000;
(function installListenerCapture() {
  try {
    var AEL = EventTarget.prototype.addEventListener;
    var REL = EventTarget.prototype.removeEventListener;
    natives.ael = AEL; natives.rel = REL;
    stab().diag.ael = true;
    EventTarget.prototype.addEventListener = function (type, fn, opts) {
      try {
        if (typeof fn === 'function' && evtListeners.length < EVT_CAP) {
          evtListeners.push({
            el: this, type: type, fn: fn,
            capture: !!(opts && (opts.capture === true || (typeof opts === 'object' && opts.capture))),
            once: !!(opts && typeof opts === 'object' && opts.once),
            passive: !!(opts && typeof opts === 'object' && opts.passive)
          });
        }
      } catch (e) { /* hostile target */ }
      return AEL.apply(this, arguments);
    };
    EventTarget.prototype.removeEventListener = function (type, fn, opts) {
      try {
        var cap = !!(opts && (opts.capture === true || (typeof opts === 'object' && opts.capture)));
        for (var i = 0; i < evtListeners.length; i++) {
          var L = evtListeners[i];
          if (L.el === this && L.type === type && L.fn === fn && L.capture === cap) { evtListeners.splice(i, 1); break; }
        }
      } catch (e) { /* hostile target */ }
      return REL.apply(this, arguments);
    };
  } catch (e) { /* prototype locked */ }
})();

function listenersFor(el) {
  var out = [];
  try {
    evtListeners.forEach(function (L) {
      if (L.el === el) {
        out.push({
          type: L.type, capture: L.capture, once: L.once, passive: L.passive,
          name: L.fn.name || 'anonymous',
          code: truncate(String(L.fn).replace(/\s+/g, ' '), 200)
        });
      }
    });
  } catch (e) { /* noop */ }
  /* inline on* handlers are always visible */
  if (el && el.nodeType === 1 && el.attributes) {
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (/^on[a-z]+$/i.test(a.name)) {
        out.push({ type: a.name.slice(2), capture: false, once: false, passive: false, name: '(inline ' + a.name + ')', code: truncate(a.value, 200) });
      }
    }
  }
  return out;
}

function xpathFor(el) {
  if (!el || el.nodeType !== 1) return '';
  if (el.id) return '//*[@id="' + el.id + '"]';
  var parts = [];
  var node = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    var s = node.tagName.toLowerCase();
    var p = node.parentElement;
    if (p) {
      var sibs = Array.prototype.filter.call(p.children, function (c) { return c.tagName === node.tagName; });
      if (sibs.length > 1) s += '[' + (sibs.indexOf(node) + 1) + ']';
    }
    parts.unshift(s);
    node = node.parentElement;
  }
  return '/' + (node && node === document.documentElement ? 'html/' : '') + parts.join('/');
}

/* ---------------- inspect mode ---------------- */
function toggleInspect() { inspectOn ? stopInspect(true) : startInspect(); }

/* stable safe()-wrapped references — add/removeEventListener need the SAME
 * function object, so the wrappers are created exactly once */
var inspFns = null;
function inspHandlers() {
  if (!inspFns) {
    inspFns = {
      touch: safe(inspTouch, 'insp.touch'),
      end: safe(inspEnd, 'insp.end'),
      mouse: safe(inspMouse, 'insp.mouse'),
      click: safe(inspClick, 'insp.click')
    };
  }
  return inspFns;
}

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
  (document.body || document.documentElement).appendChild(ovlBox);
  (document.body || document.documentElement).appendChild(ovlLabel);
  var F = inspHandlers();
  document.addEventListener('touchstart', F.touch, true);
  document.addEventListener('touchmove', F.touch, true);
  document.addEventListener('touchend', F.end, true);
  document.addEventListener('touchcancel', F.end, true);
  document.addEventListener('mousemove', F.mouse, true);
  document.addEventListener('click', F.click, true);
  toast('Inspect: touch an element, release to select');
  var b = root ? root.querySelector('.pdt-ib[title="Inspect element"]') : null;
  if (b) b.style.color = 'var(--accent)';
}

function stopInspect(cancel) {
  if (!inspectOn) return;
  inspectOn = false;
  var F = inspHandlers();
  document.removeEventListener('touchstart', F.touch, true);
  document.removeEventListener('touchmove', F.touch, true);
  document.removeEventListener('touchend', F.end, true);
  document.removeEventListener('touchcancel', F.end, true);
  document.removeEventListener('mousemove', F.mouse, true);
  document.removeEventListener('click', F.click, true);
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

var inspLast = null, inspStart = null, inspTouchAt = 0;
function inspTouch(e) {
  inspTouchAt = Date.now();          /* Firefox does not set pointerType on the
                                     * click that follows a tap — remember the
                                     * touch so inspClick can ignore it */
  var t = e.touches[0];
  if (!t) return;
  if (!inspStart) inspStart = { x: t.clientX, y: t.clientY, t: Date.now() };
  inspLast = inspTarget(t.clientX, t.clientY);
  drawHighlight(inspLast);
}
function inspEnd(e) {
  inspTouchAt = Date.now();
  if (e && e.type === 'touchcancel') { /* gesture aborted (browser took over,
    scroll happened) — cancel quietly, never select on cancel */
    inspStart = null; inspLast = null; return;
  }
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
  /* Chrome marks touch-driven clicks with pointerType; Firefox leaves it
   * undefined, so also skip clicks that immediately follow a touch. */
  if (e.pointerType === 'touch' || Date.now() - inspTouchAt < 800) return;
  e.preventDefault(); e.stopPropagation();
  if (inspLast) { selectElement(inspLast); stopInspect(false); }
}

/* ---------------- selection ---------------- */
function selectElement(el) {
  ctx.selected = el;
  /* $0 .. $4 history (like DevTools) — dedupe consecutive, cap 5 */
  if (ctx.selHistory[0] !== el) {
    ctx.selHistory.unshift(el);
    if (ctx.selHistory.length > 5) ctx.selHistory.length = 5;
  }
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
    h('button.pdt-btn', { type: 'button', onclick: function () { copyText(xpathFor(el)); } }, [iconEl('copy', 14), 'Copy XPath']),
    h('button.pdt-btn', { type: 'button', onclick: function () { editOuterHtml(el); } }, [iconEl('edit', 14), 'Edit HTML']),
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

/* ---------------- edit outer HTML ---------------- */
function editOuterHtml(el) {
  var area = h('textarea.pdt-area', { rows: 10, spellcheck: 'false' });
  area.value = el.outerHTML;
  modal('Edit HTML — ' + el.tagName.toLowerCase(), function (body, close) {
    body.appendChild(area);
    body.appendChild(h('.pdt-mfoot', [
      h('button.pdt-btn', { type: 'button', onclick: close }, 'Cancel'),
      h('button.pdt-btn.acc', { type: 'button', onclick: function () {
        try {
          var p = el.parentElement, idx = -1;
          if (p) idx = Array.prototype.indexOf.call(p.children, el);
          var tpl = document.createElement('template');
          tpl.innerHTML = area.value;
          if (!tpl.content.firstChild) { toast('Nothing to insert — element removed'); close(); return; }
          if (p) {
            p.replaceChild(tpl.content.firstChild, el);
            var next = p.children[idx] || p.firstElementChild;
            if (next) { ctx.selected = next; }
          } else {
            el.outerHTML = area.value;
          }
          close(); renderDetail(); renderTree(); toast('HTML updated');
        } catch (e) { toast('Edit failed: ' + (e.message || e)); }
      } }, 'Apply')
    ]));
  }, true);
}

/* ---------------- events sub-tab ---------------- */
function renderEvents() {
  if (!elEvEl) return;
  elEvEl.textContent = '';
  var stats = h('.pdt-card');
  stats.appendChild(kv('Listeners captured', String(evtListeners.length)));
  stats.appendChild(h('.pdt-mtext', { style: { fontSize: '.82em', color: 'var(--muted)', marginTop: '6px' } },
    'Listeners are recorded from the moment DevTools loads. Handlers attached earlier by the page, and those added via inline on* attributes, are detected per element below.'));
  elEvEl.appendChild(stats);

  var el = ctx.selected;
  if (!el || !el.isConnected) {
    elEvEl.appendChild(h('.pdt-empty', 'Select an element (crosshair button) to see its listeners.'));
  } else {
    var list = listenersFor(el);
    var card = h('.pdt-card');
    card.appendChild(h('.pdt-label', 'Listeners on ' + (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')) + ' (' + list.length + ')'));
    if (!list.length) card.appendChild(h('.pdt-empty', 'No listeners on this element.'));
    list.forEach(function (L) {
      var flags = [L.capture ? 'capture' : 'bubble', L.once ? 'once' : '', L.passive ? 'passive' : '']
        .filter(Boolean).join(', ');
      card.appendChild(h('.pdt-evl', [
        h('.pdt-row', [
          h('span.pdt-badge.b-post', L.type),
          h('span.pdt-grow.pdt-mono', { style: { fontSize: '.85em' } }, L.name),
          h('span', { style: { fontSize: '.78em', color: 'var(--muted)' } }, flags)
        ]),
        h('pre.pdt-mono', { style: { fontSize: '.78em', color: 'var(--fg2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '4px 0 8px' } }, L.code)
      ]));
    });
    elEvEl.appendChild(card);
  }

  /* busiest elements */
  var perEl = new Map();
  evtListeners.forEach(function (L) {
    var k = (L.el && L.el.tagName) ? (L.el === window ? 'window' : L.el === document ? 'document' :
      L.el.tagName.toLowerCase() + (L.el.id ? '#' + L.el.id : '')) : '(detached)';
    perEl.set(k, (perEl.get(k) || 0) + 1);
  });
  if (perEl.size) {
    var top = Array.from(perEl.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
    var c2 = h('.pdt-card');
    c2.appendChild(h('.pdt-label', 'Most listeners (all elements)'));
    top.forEach(function (t) { c2.appendChild(kv(t[0], t[1])); });
    elEvEl.appendChild(c2);
  }
}

/* ---------------- panel ---------------- */
function renderElementsPanel() {
  if (!panelEls.elements) return;
  var panel = panelEls.elements;
  panel.textContent = '';
  var subTree = h('button.pdt-subb' + (elSub === 'tree' ? '.on' : ''), 'Tree');
  var subDet = h('button.pdt-subb' + (elSub === 'detail' ? '.on' : ''), 'Selected');
  var subEv = h('button.pdt-subb' + (elSub === 'events' ? '.on' : ''), 'Events');
  subTree.addEventListener('click', function () { elSub = 'tree'; renderElementsPanel(); });
  subDet.addEventListener('click', function () { elSub = 'detail'; renderElementsPanel(); });
  subEv.addEventListener('click', function () { elSub = 'events'; renderElementsPanel(); });

  var top = h('.pdt-toolbar', [
    h('button.pdt-btn', { type: 'button', onclick: function () { startInspect(); } }, [iconEl('inspect', 14), 'Inspect']),
    h('span.pdt-grow')
  ]);
  panel.appendChild(top);
  panel.appendChild(h('.pdt-sub', [subTree, subDet, subEv]));

  elTreeEl = h('.pdt-scroll');
  elDetailEl = h('.pdt-scroll');
  elEvEl = h('.pdt-scroll');
  if (elSub !== 'tree') elTreeEl.style.display = 'none';
  if (elSub !== 'detail') elDetailEl.style.display = 'none';
  if (elSub !== 'events') elEvEl.style.display = 'none';
  panel.appendChild(elTreeEl);
  panel.appendChild(elDetailEl);
  panel.appendChild(elEvEl);
  renderTree();
  renderDetail();
  renderEvents();
}

registerPanel({
  id: 'elements', label: 'Elements', icon: 'elements',
  render: function (panel) {
    panelEls.elements = panel;
    renderElementsPanel();
  },
  onShow: function () { if (ctx.selected && !ctx.selected.isConnected) { ctx.selected = null; renderDetail(); } }
});
