/*
 * 11-perf.js — navigation timing, resource waterfall, FPS meter, memory info
 */

var fpsRunning = false, fpsFrames = [], fpsLast = 0, fpsRafId = 0;
var fpsNumEl = null, fpsCanvasEl = null;

function renderPerfPanel() {
  if (!panelEls.perf) return;
  var panel = panelEls.perf;
  panel.textContent = '';

  var subs = [['nav', 'Timing'], ['res', 'Resources'], ['fps', 'FPS'], ['mem', 'Memory']];
  var subBar = h('.pdt-sub');
  subs.forEach(function (s) {
    var b = h('button.pdt-subb' + (perfSub === s[0] ? '.on' : ''), s[1]);
    b.addEventListener('click', function () { perfSub = s[0]; renderPerfPanel(); });
    subBar.appendChild(b);
  });
  panel.appendChild(subBar);
  var sc = h('.pdt-scroll');
  panel.appendChild(sc);

  if (perfSub === 'nav') sc.appendChild(buildNavTiming());
  else if (perfSub === 'res') sc.appendChild(buildResources());
  else if (perfSub === 'fps') sc.appendChild(buildFps());
  else sc.appendChild(buildMemory());
}

var perfSub = 'nav';

/* ---------------- navigation timing ---------------- */
function buildNavTiming() {
  var wrap = h('div');
  var phases = [];
  var t0 = null;

  var nav = null;
  try { nav = performance.getEntriesByType('navigation')[0]; } catch (e) { /* noop */ }

  if (nav) {
    t0 = nav.startTime;
    function ph(name, a, b, color) {
      if (a == null || b == null || b < a || b - a <= 0) return;
      phases.push({ name: name, start: a - t0, dur: b - a, color: color });
    }
    ph('Redirect', nav.redirectStart, nav.redirectEnd, 'var(--muted)');
    ph('DNS lookup', nav.domainLookupStart, nav.domainLookupEnd, 'var(--warn)');
    ph('TCP connect', nav.connectStart, nav.secureConnectionStart || nav.connectEnd, 'var(--err)');
    ph('TLS handshake', nav.secureConnectionStart, nav.connectEnd, 'var(--err)');
    ph('Request (waiting)', nav.requestStart, nav.responseStart, 'var(--accent)');
    ph('Response (download)', nav.responseStart, nav.responseEnd, 'var(--ok)');
    ph('DOM processing', nav.responseEnd, nav.domContentLoadedEventEnd, 'var(--accent)');
    ph('Load event', nav.loadEventStart, nav.loadEventEnd, 'var(--muted)');
  } else if (performance.timing) {
    var T = performance.timing;
    t0 = T.navigationStart;
    function ph2(name, a, b, color) {
      if (!a || !b || b < a || b - a <= 0) return;
      phases.push({ name: name, start: a - t0, dur: b - a, color: color });
    }
    ph2('Unload', T.unloadEventStart, T.unloadEventEnd, 'var(--muted)');
    ph2('Redirect', T.redirectStart, T.redirectEnd, 'var(--muted)');
    ph2('DNS lookup', T.domainLookupStart, T.domainLookupEnd, 'var(--warn)');
    ph2('TCP connect', T.connectStart, T.secureConnectionStart || T.connectEnd, 'var(--err)');
    ph2('TLS handshake', T.secureConnectionStart, T.connectEnd, 'var(--err)');
    ph2('Request (waiting)', T.requestStart, T.responseStart, 'var(--accent)');
    ph2('Response (download)', T.responseStart, T.responseEnd, 'var(--ok)');
    ph2('DOM processing', T.responseEnd, T.domContentLoadedEventEnd, 'var(--accent)');
    ph2('Load event', T.loadEventStart, T.loadEventEnd, 'var(--muted)');
  }

  if (!phases.length) return h('.pdt-empty', 'No navigation timing data available.');

  var total = 0;
  phases.forEach(function (p) { total = Math.max(total, p.start + p.dur); });
  if (!total) total = 1;

  var wrap2 = h('.pdt-card');
  phases.forEach(function (p) {
    var bar = h('i');
    bar.style.left = (p.start / total * 100) + '%';
    bar.style.width = Math.max(0.8, p.dur / total * 100) + '%';
    bar.style.background = p.color;
    wrap2.appendChild(h('.pdt-wfb', [bar, h('span', p.name + ' · ' + fmtMs(p.dur))]));
  });
  wrap2.appendChild(h('.pdt-label', 'Total: ' + fmtMs(total) + ' from navigation start'));

  wrap.appendChild(wrap2);
  wrap.appendChild(h('.pdt-card', [
    kv('Page', truncate(location.host + location.pathname, 40)),
    kv('Type', nav ? (nav.type || 'navigate') : '—'),
    kv('DOM content loaded', nav ? fmtMs(nav.domContentLoadedEventEnd - nav.startTime) : '—'),
    kv('Load complete', nav ? fmtMs(nav.loadEventEnd - nav.startTime) : '—'),
    kv('Transfer size', nav ? fmtBytes(nav.transferSize) : '—'),
    kv('Protocol', nav ? (nav.nextHopProtocol || '—') : '—')
  ]));
  return wrap;
}

/* ---------------- resources ---------------- */
function buildResources() {
  var wrap = h('div');
  var entries = [];
  try { entries = performance.getEntriesByType('resource').slice(0); } catch (e) { /* noop */ }
  if (!entries.length) return h('.pdt-empty', 'No resource timing entries.');

  var search = h('input.pdt-input', { type: 'search', placeholder: 'Filter resources' });
  var list = h('div');
  function draw() {
    list.textContent = '';
    var q = search.value.toLowerCase();
    var shown = entries.filter(function (e) { return !q || e.name.toLowerCase().indexOf(q) >= 0; });
    shown.sort(function (a, b) { return b.duration - a.duration; });
    shown = shown.slice(0, 120);
    var maxDur = 1;
    shown.forEach(function (e) { maxDur = Math.max(maxDur, e.duration); });
    shown.forEach(function (e) {
      var size = e.transferSize || e.encodedBodySize || null;
      var w = Math.max(1.5, (e.duration / maxDur) * 100);
      list.appendChild(h('.pdt-card', [
        h('.pdt-row', [
          h('span.pdt-grow.pdt-mono', { style: { fontSize: '.85em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, clipUrl(e.name)),
          h('span.m', { style: { color: 'var(--muted)', fontSize: '.8em', flex: 'none' } }, fmtMs(e.duration) + ' · ' + (size != null ? fmtBytes(size) : '—'))
        ]),
        h('.pdt-wfb', [h('i', { style: { width: w + '%' } })]),
        h('.pdt-label', { style: { margin: '2px 0 0' } }, e.initiatorType || 'other')
      ]));
    });
    if (!shown.length) list.appendChild(h('.pdt-empty', 'No matches'));
  }
  search.addEventListener('input', debounce(draw, 200));
  draw();
  wrap.appendChild(search);
  wrap.appendChild(h('div', { style: { height: '8px' } }));
  wrap.appendChild(list);
  return wrap;
}

/* ---------------- FPS meter ---------------- */
function buildFps() {
  var wrap = h('.pdt-card');
  fpsNumEl = h('div.pdt-fpsnum', '—');
  fpsCanvasEl = h('canvas', { width: 280, height: 70 });
  var startBtn = h('button.pdt-btn.acc', { type: 'button' }, [iconEl(fpsRunning ? 'pause' : 'play', 14), fpsRunning ? 'Stop' : 'Start']);

  startBtn.addEventListener('click', function () {
    if (fpsRunning) { stopFps(); } else { startFps(); }
    renderPerfPanel();
  });

  wrap.appendChild(h('.pdt-fps', [fpsNumEl, fpsCanvasEl]));
  wrap.appendChild(h('div', { style: { height: '10px' } }));
  wrap.appendChild(startBtn);
  wrap.appendChild(h('.pdt-label', 'Target: 60 fps. Below 30 indicates jank.'));
  return wrap;
}
function startFps() {
  if (fpsRunning) return;
  fpsRunning = true; fpsFrames = []; fpsLast = 0;
  function loop(t) {
    if (!fpsRunning) return;
    if (fpsLast) {
      fpsFrames.push(t - fpsLast);
      if (fpsFrames.length > 90) fpsFrames.shift();
      drawFps();
    }
    fpsLast = t;
    fpsRafId = requestAnimationFrame(loop);
  }
  fpsRafId = requestAnimationFrame(loop);
}
function stopFps() {
  fpsRunning = false;
  if (fpsRafId) cancelAnimationFrame(fpsRafId);
}
function drawFps() {
  if (!fpsNumEl || !fpsCanvasEl || !fpsFrames.length) return;
  var recent = fpsFrames.slice(-30);
  var avg = recent.reduce(function (a, b) { return a + b; }, 0) / recent.length;
  var fps = Math.round(1000 / Math.max(0.1, avg));
  fpsNumEl.textContent = fps + ' fps';
  fpsNumEl.style.color = fps >= 50 ? 'var(--ok)' : fps >= 30 ? 'var(--warn)' : 'var(--err)';
  try {
    var ctx2 = fpsCanvasEl.getContext('2d');
    var W = fpsCanvasEl.width, Hh = fpsCanvasEl.height;
    ctx2.clearRect(0, 0, W, Hh);
    var cs = getComputedStyle(app);
    var accent = (cs.getPropertyValue('--accent') || '#5b9dff').trim();
    var bars = fpsFrames.slice(-56);
    var bw = W / 56;
    bars.forEach(function (dt, i) {
      var f = Math.min(120, 1000 / Math.max(0.1, dt));
      var hh = (f / 120) * Hh;
      ctx2.fillStyle = f >= 50 ? accent : f >= 30 ? '#e0a63f' : '#e0564f';
      ctx2.fillRect(i * bw, Hh - hh, Math.max(1, bw - 1.5), hh);
    });
    ctx2.fillStyle = 'rgba(128,128,128,.5)';
    ctx2.fillRect(0, Hh - (60 / 120) * Hh, W, 1);
  } catch (e) { /* canvas unavailable */ }
}

/* ---------------- memory ---------------- */
function buildMemory() {
  var wrap = h('div');
  var mem = performance.memory;
  if (mem && mem.usedJSHeapSize) {
    var total = mem.jsHeapSizeLimit;
    var used = mem.usedJSHeapSize;
    var allocated = mem.totalJSHeapSize;
    function bar(pct, color) {
      return h('.pdt-wfb', [h('i', { style: { width: Math.min(100, pct) + '%', background: color } }), h('span', Math.round(pct) + '%')]);
    }
    wrap.appendChild(h('.pdt-card', [
      kv('Used JS heap', fmtBytes(used)),
      kv('Allocated', fmtBytes(allocated)),
      kv('Heap limit', fmtBytes(total)),
      h('.pdt-label', 'Used / limit'),
      bar((used / total) * 100, 'var(--accent)')
    ]));
    wrap.appendChild(h('.pdt-mtext', { style: { color: 'var(--muted)', fontSize: '.85em' } },
      'Note: precise memory data is Chrome-only. Firefox does not expose performance.memory.'));
  } else {
    wrap.appendChild(h('.pdt-card', [
      kv('performance.memory', 'not available'),
      kv('navigator.deviceMemory', (navigator.deviceMemory != null ? navigator.deviceMemory + ' GB' : 'not available')),
      kv('hardwareConcurrency', navigator.hardwareConcurrency || '—')
    ]));
    wrap.appendChild(h('.pdt-mtext', { style: { color: 'var(--muted)', fontSize: '.85em' } },
      'Firefox (including Android) does not expose JS heap sizes to web pages for privacy reasons. ' +
      'The FPS meter and resource timings above still work everywhere.'));
  }
  wrap.appendChild(h('.pdt-card', [
    h('button.pdt-btn', { type: 'button', onclick: function () {
      var paint = null;
      try { paint = performance.getEntriesByType('paint').map(function (p) { return p.name + ': ' + fmtMs(p.startTime); }); } catch (e) { /* noop */ }
      if (paint && paint.length) toast(paint.join(' · ')); else toast('No paint timing data');
    } }, [iconEl('clock', 14), 'Show paint timings'])
  ]));
  return wrap;
}

registerPanel({
  id: 'perf', label: 'Perf', icon: 'perf',
  render: function (panel) { panelEls.perf = panel; renderPerfPanel(); },
  onShow: renderPerfPanel
});
