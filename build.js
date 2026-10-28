#!/usr/bin/env node
/*
 * build.js — concatenates src/*.js into the distribution files:
 *
 *   src.readable.js          readable concatenation (for reading on GitHub)
 *   src.js                   minified single-file bookmarklet build
 *   pocket-devtools.user.js  userscript edition — same core plus a userscript
 *                            header; installed in Tampermonkey/Violentmonkey it
 *                            runs at document-start on every page load, so the
 *                            tools and their capture survive a page refresh.
 *
 * Usage: node build.js [--minify]
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const VERSION = '5.1.0';

const BANNER = '/*! Pocket DevTools v' + VERSION +
  ' | MIT | improved fork of DeveloperExotic/Bookmarklet-Dev-Tools */\n';

const USERSCRIPT_HEADER =
'// ==UserScript==\n' +
'// @name         Pocket DevTools (persistent edition)\n' +
'// @namespace    https://github.com/shalosi00/Bookmarklet-Dev-Tools\n' +
'// @version      ' + VERSION + '\n' +
'// @description  Mobile-first dev tools (console, elements, network, storage, perf, toolkit) that survive page refresh. Improved fork of DeveloperExotic/Bookmarklet-Dev-Tools. Use the bookmarklet edition for on-demand loading.\n' +
'// @author       shalosi00\n' +
'// @license      MIT\n' +
'// @match        *://*/*\n' +
'// @run-at       document-start\n' +
'// @grant        none\n' +
'// @noframes\n' +
'// ==/UserScript==\n' +
'/* Pocket DevTools v' + VERSION + ' — userscript edition (persistent).\n' +
' * Identical core to src.js; the flag below tells the tools they were\n' +
' * injected by a userscript manager: capture starts at document-start and\n' +
' * the panel reopens automatically after a refresh if it was open.\n' +
' * Configure auto-inject / excluded sites in Settings -> Persistence. */\n' +
'window.__PDT_USERSCRIPT__ = true;\n';

const files = fs.readdirSync(SRC)
  .filter(f => f.endsWith('.js'))
  .sort();

if (!files.length) {
  console.error('No source files found in src/');
  process.exit(1);
}

const concat = files.map(f => {
  const code = fs.readFileSync(path.join(SRC, f), 'utf8');
  return '/* ===== ' + f + ' ===== */\n' + code;
}).join('\n\n');

/* readable build (kept in the repo for easy GitHub reading) */
fs.writeFileSync(path.join(__dirname, 'src.readable.js'), BANNER + concat);
console.log('Readable build: src.readable.js (' + files.length + ' modules, ' +
  Math.round(concat.length / 1024) + ' KB)');

const finish = (core) => {
  fs.writeFileSync(path.join(__dirname, 'src.js'), BANNER + core);
  fs.writeFileSync(path.join(__dirname, 'pocket-devtools.user.js'),
    USERSCRIPT_HEADER + core);
  console.log('Bookmarklet build: src.js (' + Math.round(core.length / 1024) + ' KB)');
  console.log('Userscript build:  pocket-devtools.user.js (' +
    Math.round((USERSCRIPT_HEADER.length + core.length) / 1024) + ' KB)');
};

if (process.argv.includes('--minify')) {
  try {
    const { minify } = require('terser');
    minify(concat, { compress: true, mangle: true }).then(res => {
      if (res.code) return finish(res.code);
      console.error('Minify returned no code — shipping readable build.');
      finish(concat);
    }).catch(e => {
      console.error('Minify failed, shipping readable build:', e.message);
      finish(concat);
    });
  } catch (e) {
    console.error('terser not installed — shipping readable build. npm i -g terser to enable.');
    finish(concat);
  }
} else {
  finish(concat);
}
