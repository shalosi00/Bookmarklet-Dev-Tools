/*
 * 09-sources.js — page HTML / CSS / JS viewers with line numbers, copy, download
 */

var srcSub = 'html';

function codeBlock(code, lang) {
  code = String(code == null ? '' : code);
  if (code.length > 300000) code = code.slice(0, 300000) + '\n… [truncated at 300 KB]';
  var lines = code.split('\n');
  var nums = [];
  for (var i = 1; i <= lines.length; i++) nums.push(i);
  var gutter = h('div.pdt-gutter');
  gutter.textContent = nums.join('\n');
  var pre = h('div.pdt-codepre');
  pre.innerHTML = highlight(code, lang);
  return h('.pdt-viewer', [gutter, pre]);
}

/* Single-pass token highlighter. escapeHtml() only escapes & < >, so quotes stay raw. */
function highlight(code, lang) {
  var s = escapeHtml(code);
  var re, fn;
  if (lang === 'js') {
    re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`[^`]*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\b(var|let|const|function|return|if|else|for|while|do|switch|case|break|continue|new|typeof|instanceof|try|catch|finally|throw|class|extends|super|this|null|undefined|true|false|async|await|yield|delete|void)\b|\b(\d+\.?\d*)\b/g;
    fn = function (m, com, str, kw, num) {
      if (com) return '<span class="tk-com">' + com + '</span>';
      if (str) return '<span class="tk-str">' + str + '</span>';
      if (kw) return '<span class="tk-kw">' + kw + '</span>';
      if (num) return '<span class="tk-num">' + num + '</span>';
      return m;
    };
  } else if (lang === 'css') {
    re = /(\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(#[0-9a-fA-F]{3,8}\b|\b\d+\.?\d*(?:px|em|rem|%|vh|vw|s|ms|fr|ch|deg)?\b)|([\w-]+)(?=\s*:)/g;
    fn = function (m, com, str, num, prop) {
      if (com) return '<span class="tk-com">' + com + '</span>';
      if (str) return '<span class="tk-str">' + str + '</span>';
      if (num) return '<span class="tk-num">' + num + '</span>';
      if (prop) return '<span class="tk-attr">' + prop + '</span>';
      return m;
    };
  } else if (lang === 'html') {
    re = /(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?[a-zA-Z][\w-]*|\/?&gt;)|([a-zA-Z-]+)=("[^"]*")/g;
    fn = function (m, com, tag, attr, val) {
      if (com) return '<span class="tk-com">' + com + '</span>';
      if (tag) return '<span class="tk-tag">' + tag + '</span>';
      if (attr) return '<span class="tk-attr">' + attr + '</span>=<span class="tk-str">' + val + '</span>';
      return m;
    };
  } else {
    return s;
  }
  try { return s.replace(re, fn); } catch (e) { return s; }
}

function fileViewer(name, content, lang, mime) {
  var panel = panelEls.sources;
  panel.textContent = '';
  panel.appendChild(h('.pdt-toolbar', [
    h('button.pdt-ib', { type: 'button', onclick: function () { renderSourcesPanel(); } }, iconEl('back')),
    h('span.pdt-ver', { style: { marginRight: 'auto' } }, truncate(name, 40)),
    h('button.pdt-ib', { type: 'button', title: 'Copy', onclick: function () { copyText(content); } }, iconEl('copy')),
    h('button.pdt-ib', { type: 'button', title: 'Download', onclick: function () { downloadFile(name, content, mime); } }, iconEl('download'))
  ]));
  panel.appendChild(codeBlock(content, lang));
}

function renderSourcesPanel() {
  if (!panelEls.sources) return;
  var panel = panelEls.sources;
  panel.textContent = '';

  var subs = [['html', 'HTML'], ['css', 'CSS'], ['js', 'JS']];
  var subBar = h('.pdt-sub');
  subs.forEach(function (s) {
    var b = h('button.pdt-subb' + (srcSub === s[0] ? '.on' : ''), s[1]);
    b.addEventListener('click', function () { srcSub = s[0]; renderSourcesPanel(); });
    subBar.appendChild(b);
  });
  panel.appendChild(subBar);
  var list = h('.pdt-scroll');
  panel.appendChild(list);

  if (srcSub === 'html') {
    var htmlSize = document.documentElement.outerHTML.length;
    list.appendChild(h('.pdt-card', [
      kv('Document', truncate(document.title || '(untitled)', 50)),
      kv('Doctype', document.doctype ? document.doctype.name : '—'),
      kv('Size', fmtBytes(htmlSize)),
      h('.pdt-row', { style: { marginTop: '8px', flexWrap: 'wrap' } }, [
        h('button.pdt-btn.acc', { type: 'button', onclick: function () {
          fileViewer('page.html', document.documentElement.outerHTML, 'html', 'text/html');
        } }, [iconEl('eye', 14), 'View HTML']),
        h('button.pdt-btn', { type: 'button', onclick: function () { copyText(document.documentElement.outerHTML); } }, [iconEl('copy', 14), 'Copy']),
        h('button.pdt-btn', { type: 'button', onclick: function () { downloadFile('page.html', document.documentElement.outerHTML, 'text/html'); } }, [iconEl('download', 14), 'Save'])
      ])
    ]));
  } else if (srcSub === 'css') {
    var sheets = [];
    try { sheets = Array.prototype.slice.call(document.styleSheets); } catch (e) { /* noop */ }
    if (!sheets.length) list.appendChild(h('.pdt-empty', 'No stylesheets found'));
    sheets.forEach(function (ss, i) {
      var count = null;
      try { count = ss.cssRules ? ss.cssRules.length : null; } catch (e) { count = null; }
      var name = ss.href ? (ss.href.split('/').pop().split('?')[0] || 'stylesheet.css') : 'inline-' + (i + 1) + '.css';
      list.appendChild(h('.pdt-card', [
        kv('File', truncate(name, 40)),
        kv('Source', ss.href ? clipUrl(ss.href) : 'inline <style>'),
        count != null ? kv('Rules', String(count)) : kv('Rules', 'blocked (CORS)'),
        h('.pdt-row', { style: { marginTop: '8px', flexWrap: 'wrap' } }, [
          h('button.pdt-btn', { type: 'button', onclick: function () { viewSheet(ss, name); } }, [iconEl('eye', 14), 'View']),
          h('button.pdt-btn', { type: 'button', onclick: function () {
            viewSheet(ss, name, true);
          } }, [iconEl('copy', 14), 'Copy'])
        ])
      ]));
    });
  } else {
    var scripts = Array.prototype.slice.call(document.querySelectorAll('script'));
    var shown = [];
    scripts.forEach(function (s, i) {
      if ((s.src && /Bookmarklet-Dev-Tools|pdt/i.test(s.src)) || s.id === 'pdt-page-css') return;
      shown.push({ el: s, name: s.src ? (s.src.split('/').pop().split('?')[0] || 'script.js') : 'inline-' + (i + 1) + '.js' });
    });
    if (!shown.length) list.appendChild(h('.pdt-empty', 'No scripts found'));
    shown.forEach(function (s) {
      list.appendChild(h('.pdt-card', [
        kv('File', truncate(s.name, 40)),
        kv('Source', s.el.src ? clipUrl(s.el.src) : 'inline <script>'),
        kv('Size', s.el.src ? '—' : fmtBytes(s.el.textContent.length)),
        h('.pdt-row', { style: { marginTop: '8px' } }, [
          h('button.pdt-btn', { type: 'button', onclick: function () {
            if (s.el.src) {
              fetch(s.el.src).then(function (r) { return r.text(); }).then(function (t) {
                fileViewer(s.name, t, 'js', 'text/javascript');
              }, function () { toast('Fetch failed (CORS?)'); });
            } else {
              fileViewer(s.name, s.el.textContent, 'js', 'text/javascript');
            }
          } }, [iconEl('eye', 14), 'View'])
        ])
      ]));
    });
  }
}

function viewSheet(ss, name, onlyCopy) {
  function useText(t) { if (onlyCopy) copyText(t); else fileViewer(name, t, 'css', 'text/css'); }
  if (ss.href) {
    fetch(ss.href).then(function (r) { return r.text(); }).then(useText, function () { toast('Fetch failed (CORS?)'); });
  } else {
    var txt = '';
    try { Array.prototype.forEach.call(ss.cssRules, function (r) { txt += r.cssText + '\n\n'; }); } catch (e) { /* noop */ }
    useText(txt || '/* empty */');
  }
}

registerPanel({
  id: 'sources', label: 'Sources', icon: 'sources',
  render: function (panel) { panelEls.sources = panel; renderSourcesPanel(); }
});
