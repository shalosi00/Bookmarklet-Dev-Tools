/*
 * 09-page.js — Page panel: metadata / Open Graph, headings outline, links,
 *              images, accessibility audit, tech detection.
 */

var pgSub = 'overview';

function flashEl(el) {
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var old = el.style.outline;
    el.style.outline = '3px solid #5b9dff';
    el.style.outlineOffset = '1px';
    setTimeout(function () { el.style.outline = old; }, 2200);
  } catch (e) { /* noop */ }
}

function metaContent(name) {
  var el = document.querySelector('meta[name="' + name + '"]') ||
    document.querySelector('meta[property="' + name + '"]');
  return el ? (el.content || '') : '';
}

function renderPagePanel() {
  if (!panelEls.page) return;
  var panel = panelEls.page;
  panel.textContent = '';
  var subs = [['overview', 'Overview'], ['head', 'Headings'], ['links', 'Links'],
    ['imgs', 'Images'], ['a11y', 'A11y'], ['tech', 'Tech']];
  var subBar = h('.pdt-sub');
  subs.forEach(function (s) {
    var b = h('button.pdt-subb' + (pgSub === s[0] ? '.on' : ''), s[1]);
    b.addEventListener('click', function () { pgSub = s[0]; renderPagePanel(); });
    subBar.appendChild(b);
  });
  panel.appendChild(subBar);
  var sc = h('.pdt-scroll');
  panel.appendChild(sc);
  if (pgSub === 'overview') sc.appendChild(buildPgOverview());
  else if (pgSub === 'head') sc.appendChild(buildPgHeadings());
  else if (pgSub === 'links') sc.appendChild(buildPgLinks());
  else if (pgSub === 'imgs') sc.appendChild(buildPgImages());
  else if (pgSub === 'a11y') sc.appendChild(buildPgA11y());
  else sc.appendChild(buildPgTech());
}

/* ---------------- overview: metadata ---------------- */
function buildPgOverview() {
  var wrap = h('div');
  var doctype = '';
  try { doctype = document.doctype ? document.doctype.name : '(missing)'; } catch (e) { /* noop */ }

  var canon = '';
  try {
    var cLink = document.querySelector('link[rel="canonical"]');
    canon = metaContent('canonical') || (cLink && cLink.href) || '(missing)';
  } catch (e) { canon = '(missing)'; }

  var card = h('.pdt-card', [
    kv('Title', truncate(document.title || '(empty)', 90)),
    kv('Description', truncate(metaContent('description') || '(missing)', 120)),
    kv('Canonical', truncate(canon, 90)),
    kv('Language', document.documentElement.lang || '(missing)'),
    kv('Charset', (document.characterSet || '(unknown)') + ' · doctype: ' + doctype),
    kv('Viewport', metaContent('viewport') || '(missing)'),
    kv('Robots', metaContent('robots') || '(none)'),
    kv('Theme color', metaContent('theme-color') || '(none)'),
    kv('Color scheme', metaContent('color-scheme') || '(none)'),
    kv('Generator', metaContent('generator') || '(none)'),
    kv('Revision', (document.lastModified || '—') + ' (lastModified)'),
    kv('URL', truncate(location.href, 100))
  ]);
  wrap.appendChild(card);

  /* Open Graph / Twitter */
  var ogTags = [];
  try {
    Array.prototype.forEach.call(document.querySelectorAll('meta[property^="og:"], meta[name^="og:"], meta[name^="twitter:"]'), function (m) {
      var key = (m.getAttribute('property') || m.getAttribute('name') || '').trim();
      var val = (m.content || '').trim();
      if (key && val) ogTags.push([key, val]);
    });
  } catch (e) { /* noop */ }
  if (ogTags.length) {
    var og = h('.pdt-card');
    og.appendChild(h('.pdt-label', 'Social preview (' + ogTags.length + ' tags)'));
    ogTags.slice(0, 30).forEach(function (t) { og.appendChild(kv(t[0], truncate(t[1], 80))); });
    wrap.appendChild(og);
  } else {
    wrap.appendChild(h('.pdt-card', h('.pdt-mtext', { style: { fontSize: '.85em' } },
      'No Open Graph or Twitter Card tags — social shares of this page will render without a preview.')));
  }
  return wrap;
}

/* ---------------- headings outline ---------------- */
function buildPgHeadings() {
  var wrap = h('div');
  var heads = [];
  try { heads = Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3,h4,h5,h6')); } catch (e) { /* noop */ }
  if (!heads.length) return h('.pdt-empty', 'No heading tags (h1\u2013h6) found.');

  var counts = {};
  heads.forEach(function (hd) { counts[hd.tagName.toLowerCase()] = (counts[hd.tagName.toLowerCase()] || 0) + 1; });
  wrap.appendChild(h('.pdt-card', [
    kv('Total headings', String(heads.length)),
    kv('h1 count', String(counts.h1 || 0) + (counts.h1 === 1 ? ' (ideal)' : counts.h1 ? ' (\u22652 — should be one per page)' : ' (missing — bad for SEO)')),
    kv('Breakdown', ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(function (t) { return t + ':' + (counts[t] || 0); }).join(' · '))
  ]));

  var list = h('.pdt-card');
  list.appendChild(h('.pdt-label', 'Outline (tap to scroll)'));
  heads.slice(0, 200).forEach(function (hd) {
    var lvl = parseInt(hd.tagName.slice(1), 10);
    var text = (hd.textContent || '').trim().replace(/\s+/g, ' ');
    var row = h('.pdt-hrow', { style: { paddingLeft: ((lvl - 1) * 14) + 'px' } }, [
      h('span.pdt-badge.b-h' + lvl, 'h' + lvl),
      h('span.pdt-grow', truncate(text || '(empty heading)', 60))
    ]);
    row.addEventListener('click', function () { flashEl(hd); });
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}

/* ---------------- links ---------------- */
function buildPgLinks() {
  var wrap = h('div');
  var links = [];
  try { links = Array.prototype.slice.call(document.querySelectorAll('a[href]')); } catch (e) { /* noop */ }
  var internal = 0, external = 0, anchors = 0, blank = 0, nofollow = 0, empty = 0;
  var seen = {};
  var uniq = [];
  links.forEach(function (a) {
    var href = a.getAttribute('href') || '';
    var host = '';
    try { host = new URL(a.href, location.href).host; } catch (e) { host = ''; }
    var key = host + '|' + href;
    if (!seen[key]) { seen[key] = 1; uniq.push(a); }
    if (!href) empty++;
    else if (href.charAt(0) === '#') anchors++;
    else if (host && host !== location.host) { external++; if (a.rel && a.rel.indexOf('nofollow') >= 0) nofollow++; }
    else internal++;
    if (a.target === '_blank') blank++;
  });

  wrap.appendChild(h('.pdt-card', [
    kv('Total links', String(links.length) + ' (' + uniq.length + ' unique URLs)'),
    kv('Internal', String(internal)),
    kv('External', String(external) + (nofollow ? ' (' + nofollow + ' nofollow)' : '')),
    kv('In-page anchors', String(anchors)),
    kv('Opens in new tab', String(blank)),
    kv('Empty href', String(empty))
  ]));

  var list = h('.pdt-card');
  list.appendChild(h('.pdt-label', 'All links (tap to copy URL)'));
  uniq.slice(0, 150).forEach(function (a) {
    var href = a.getAttribute('href') || '';
    var text = (a.textContent || '').trim().replace(/\s+/g, ' ');
    var host = '';
    try { host = new URL(a.href, location.href).host; } catch (e) { /* noop */ }
    var isExt = host && host !== location.host;
    var row = h('.pdt-hrow', [
      h('span.pdt-badge.' + (isExt ? 'b-other' : 'b-get'), isExt ? 'ext' : 'int'),
      h('span.pdt-grow', [
        h('div', truncate(text || '(no text)', 46)),
        h('div.pdt-mono', { style: { fontSize: '.82em', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          truncate(href, 64))
      ])
    ]);
    row.addEventListener('click', function () { copyText(a.href || href, true); toast('Copied: ' + truncate(a.href || href, 60)); });
    list.appendChild(row);
  });
  if (uniq.length > 150) list.appendChild(h('.pdt-label', '\u2026 and ' + (uniq.length - 150) + ' more'));
  wrap.appendChild(list);
  return wrap;
}

/* ---------------- images ---------------- */
function buildPgImages() {
  var wrap = h('div');
  var imgs = [];
  try { imgs = Array.prototype.slice.call(document.images); } catch (e) { /* noop */ }
  if (!imgs.length) return h('.pdt-empty', 'No <img> elements found.');

  var broken = [], noAlt = [], distorted = [], lazy = 0, huge = [];
  imgs.forEach(function (img) {
    if (img.complete && img.naturalWidth === 0) broken.push(img);
    if (!img.hasAttribute('alt')) noAlt.push(img);
    if (img.loading === 'lazy') lazy++;
    var w = img.naturalWidth, d = img.getBoundingClientRect().width;
    if (w > 40 && d > 40) {
      var ratio = Math.round(w / Math.max(1, d));
      if (ratio >= 3) huge.push([img, ratio]);
    }
    /* dimension mismatch (displayed smaller than natural by a lot) */
    var nw = img.naturalWidth, nh = img.naturalHeight;
    var dw = img.getBoundingClientRect().width, dh = img.getBoundingClientRect().height;
    if (nw > 20 && nh > 20 && dw > 20 && dh > 20) {
      var natRatio = nw / nh, disRatio = dw / dh;
      if (Math.abs(natRatio - disRatio) / Math.max(natRatio, disRatio) > 0.25) distorted.push(img);
    }
  });

  wrap.appendChild(h('.pdt-card', [
    kv('Images', String(imgs.length)),
    kv('Broken', String(broken.length)),
    kv('Missing alt', String(noAlt.length)),
    kv('Aspect-distorted', String(distorted.length)),
    kv('Lazy-loaded', String(lazy))
  ]));

  function issueList(title, arr, descFn) {
    if (!arr.length) return null;
    var c = h('.pdt-card');
    c.appendChild(h('.pdt-label', title + ' (' + arr.length + ')'));
    arr.slice(0, 50).forEach(function (img) {
      var row = h('.pdt-hrow', [
        h('span.pdt-grow.pdt-mono', { style: { fontSize: '.8em' } },
          truncate(img.currentSrc || img.src || '(empty src)', 56))
      ].concat(descFn ? [h('span', { style: { fontSize: '.8em', color: 'var(--muted)' } }, descFn(img))] : []));
      row.addEventListener('click', function () { flashEl(img); });
      c.appendChild(row);
    });
    return c;
  }
  var b1 = issueList('Broken images', broken, null);
  if (b1) wrap.appendChild(b1);
  var b2 = issueList('Images without alt', noAlt, null);
  if (b2) wrap.appendChild(b2);
  var b3 = issueList('Distorted (stretched)', distorted, null);
  if (b3) wrap.appendChild(b3);
  if (!broken.length && !noAlt.length && !distorted.length) {
    wrap.appendChild(h('.pdt-card', h('.pdt-mtext', { style: { fontSize: '.85em' } },
      'No image issues detected. All images have alt text and are rendered at their natural aspect ratio.')));
  }
  return wrap;
}

/* ---------------- accessibility audit ---------------- */
function buildPgA11y() {
  var wrap = h('div');
  var issues = [];
  function addIssue(sev, msg, els) {
    issues.push({ sev: sev, msg: msg, els: els || [] });
  }

  /* language */
  if (!document.documentElement.lang) addIssue('err', '<html> has no lang attribute', [document.documentElement]);
  /* title */
  if (!document.title) addIssue('err', 'Page has no <title>');
  else if (document.title.length > 70) addIssue('warn', 'Title is very long (' + document.title.length + ' chars)');
  /* description */
  if (!metaContent('description')) addIssue('warn', 'No meta description');
  /* viewport */
  if (!metaContent('viewport')) addIssue('warn', 'No viewport meta tag');
  /* images alt */
  var noAlt = [];
  try { noAlt = Array.prototype.filter.call(document.images, function (i) { return !i.hasAttribute('alt'); }); } catch (e) { /* noop */ }
  if (noAlt.length) addIssue('err', noAlt.length + ' image(s) missing alt attribute', noAlt);
  /* inputs without labels */
  var noLabel = [];
  try {
    noLabel = Array.prototype.filter.call(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'), function (f) {
      if (f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || f.getAttribute('title')) return false;
      if (f.id && document.querySelector('label[for="' + CSS.escape(f.id) + '"]')) return false;
      var p = f.closest('label');
      if (p) return false;
      return true;
    });
  } catch (e) { /* noop */ }
  if (noLabel.length) addIssue('err', noLabel.length + ' form control(s) without a label', noLabel);
  /* buttons / links without accessible text */
  var noText = [];
  try {
    noText = Array.prototype.filter.call(document.querySelectorAll('button, a[href]'), function (b) {
      var txt = (b.textContent || '').trim();
      var aria = b.getAttribute('aria-label') || b.getAttribute('aria-labelledby');
      var img = b.querySelector('img[alt]:not([alt=""]), svg[aria-label]');
      return !txt && !aria && !img;
    });
  } catch (e) { /* noop */ }
  if (noText.length) addIssue('err', noText.length + ' button/link(s) without accessible text', noText);
  /* iframes without title */
  var noTitled = [];
  try { noTitled = Array.prototype.filter.call(document.querySelectorAll('iframe'), function (f) { return !f.title; }); } catch (e) { /* noop */ }
  if (noTitled.length) addIssue('warn', noTitled.length + ' iframe(s) without title', noTitled);
  /* tables without th */
  var noTh = [];
  try {
    noTh = Array.prototype.filter.call(document.querySelectorAll('table'), function (t) {
      return !t.querySelector('th');
    });
  } catch (e) { /* noop */ }
  if (noTh.length) addIssue('warn', noTh.length + ' table(s) without header cells', noTh);

  var errCount = issues.filter(function (i) { return i.sev === 'err'; }).length;
  var warnCount = issues.length - errCount;
  var score = Math.max(0, 100 - errCount * 12 - warnCount * 5);

  var head = h('.pdt-card');
  var big = h('.pdt-fpsnum', String(score) + '/100');
  big.style.fontSize = '1.7em';
  big.style.color = score >= 85 ? 'var(--ok)' : score >= 60 ? 'var(--warn)' : 'var(--err)';
  head.appendChild(h('.pdt-row', [big, h('span.pdt-grow', [
    h('div', errCount + ' error(s) · ' + warnCount + ' warning(s)'),
    h('div', { style: { fontSize: '.82em', color: 'var(--muted)' } }, 'Quick heuristic audit — not a full WCAG check')
  ])]));
  wrap.appendChild(head);

  if (!issues.length) {
    wrap.appendChild(h('.pdt-card', h('.pdt-mtext', { style: { fontSize: '.85em' } },
      'No common issues found. Language, title, labels, alt text, and accessible names all check out.')));
    return wrap;
  }

  issues.forEach(function (iss) {
    var c = h('.pdt-card');
    c.appendChild(h('.pdt-row', [
      iconEl(iss.sev === 'err' ? 'xc' : 'alert', 16),
      h('span.pdt-grow', iss.msg)
    ]));
    (iss.els || []).slice(0, 12).forEach(function (el) {
      var tag = el === document.documentElement ? 'html' :
        el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');
      var row = h('button.pdt-chip', { type: 'button', style: { marginTop: '6px' } }, '\u2192 ' + truncate(tag, 24));
      row.addEventListener('click', function () { flashEl(el); });
      c.appendChild(row);
    });
    wrap.appendChild(c);
  });
  return wrap;
}

/* ---------------- tech detection ---------------- */
function buildPgTech() {
  var wrap = h('div');

  /* frameworks */
  var fw = [];
  function fwAdd(name, test) { try { var v = test(); if (v) fw.push([name, v]); } catch (e) { /* noop */ } }
  fwAdd('jQuery', function () { return window.jQuery && window.jQuery.fn && window.jQuery.fn.jquery ? 'v' + window.jQuery.fn.jquery : null; });
  fwAdd('React', function () {
    var r = document.querySelector('[data-reactroot], [data-reactid]');
    return (window.React && window.React.version && 'v' + window.React.version) || (r ? 'detected' : null);
  });
  fwAdd('Vue', function () { return window.Vue && window.Vue.version ? 'v' + window.Vue.version : null; });
  fwAdd('Angular', function () {
    return (window.ng && window.ng.version && 'v' + window.ng.version.full) ||
      (document.querySelector('[ng-version]') && document.querySelector('[ng-version]').getAttribute('ng-version')) || null;
  });
  fwAdd('Svelte', function () { return document.querySelector('[class*="svelte-"]') ? 'detected' : null; });
  fwAdd('Next.js', function () { return document.getElementById('__NEXT_DATA__') ? 'detected' : null; });
  fwAdd('Nuxt', function () { return window.__NUXT__ || document.getElementById('__nuxt') ? 'detected' : null; });
  fwAdd('WordPress', function () { return document.querySelector('meta[name="generator"][content*="WordPress"]') ? 'detected' : null; });
  fwAdd('Bootstrap', function () {
    return document.querySelector('link[href*="bootstrap"]') ? 'detected' : null;
  });
  fwAdd('Google Analytics', function () { return window.ga || window.gtag || window.dataLayer ? 'detected' : null; });
  fwAdd('Google Tag Manager', function () { return document.querySelector('script[src*="googletagmanager.com"]') ? 'detected' : null; });
  fwAdd('Cloudflare Beacon', function () { return document.querySelector('script[src*="cloudflareinsights.com"]') ? 'detected' : null; });

  var fwCard = h('.pdt-card');
  fwCard.appendChild(h('.pdt-label', 'Detected libraries & services'));
  if (fw.length) fw.forEach(function (f) { fwCard.appendChild(kv(f[0], f[1])); });
  else fwCard.appendChild(h('.pdt-mtext', { style: { fontSize: '.85em' } }, 'No common libraries detected.'));
  wrap.appendChild(fwCard);

  /* scripts */
  var scripts = [], inlineScripts = 0, asyncS = 0, deferS = 0;
  try {
    scripts = Array.prototype.slice.call(document.querySelectorAll('script[src]')).map(function (s) { return s.src; });
    inlineScripts = Array.prototype.filter.call(document.querySelectorAll('script:not([src])'), function (s) {
      return (s.textContent || '').trim().length > 0;
    }).length;
    asyncS = document.querySelectorAll('script[src][async]').length;
    deferS = document.querySelectorAll('script[src][defer]').length;
  } catch (e) { /* noop */ }
  wrap.appendChild(h('.pdt-card', [
    kv('External scripts', String(scripts.length) + ' (' + asyncS + ' async, ' + deferS + ' defer)'),
    kv('Inline scripts', String(inlineScripts))
  ]));
  if (scripts.length) {
    var sc2 = h('.pdt-card');
    sc2.appendChild(h('.pdt-label', 'Script URLs (tap to copy)'));
    scripts.slice(0, 60).forEach(function (src) {
      var row = h('.pdt-hrow', [h('span.pdt-grow.pdt-mono', { style: { fontSize: '.8em' } }, clipUrl(src))]);
      row.addEventListener('click', function () { copyText(src, true); toast('Copied script URL'); });
      sc2.appendChild(row);
    });
    wrap.appendChild(sc2);
  }

  /* stylesheets */
  var sheets = [];
  try {
    sheets = Array.prototype.slice.call(document.querySelectorAll('link[rel="stylesheet"]')).map(function (l) { return l.href; });
  } catch (e) { /* noop */ }
  var inlineStyles = document.querySelectorAll('style').length;
  wrap.appendChild(h('.pdt-card', [
    kv('Stylesheets', String(sheets.length) + ' external, ' + inlineStyles + ' inline')
  ]));
  if (sheets.length) {
    var sh = h('.pdt-card');
    sh.appendChild(h('.pdt-label', 'Stylesheet URLs'));
    sheets.slice(0, 40).forEach(function (href) {
      sh.appendChild(h('.pdt-hrow', [h('span.pdt-grow.pdt-mono', { style: { fontSize: '.8em' } }, clipUrl(href))]));
    });
    wrap.appendChild(sh);
  }

  /* storage usage */
  var stCard = h('.pdt-card');
  stCard.appendChild(h('.pdt-label', 'Storage estimate'));
  stCard.appendChild(h('.pdt-mtext', { style: { fontSize: '.85em' } }, 'Checking\u2026'));
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(function (est) {
      stCard.textContent = '';
      stCard.appendChild(h('.pdt-label', 'Storage estimate'));
      stCard.appendChild(kv('Used', fmtBytes(est.usage || 0)));
      stCard.appendChild(kv('Quota', fmtBytes(est.quota || 0)));
    }, function () { stCard.textContent = ''; stCard.appendChild(h('.pdt-label', 'Storage estimate: unavailable')); });
  } else {
    stCard.textContent = '';
    stCard.appendChild(h('.pdt-label', 'Storage estimate: not supported'));
  }
  wrap.appendChild(stCard);
  return wrap;
}

registerPanel({
  id: 'page', label: 'Page', icon: 'file',
  render: function (panel) { panelEls.page = panel; renderPagePanel(); },
  onShow: renderPagePanel
});
