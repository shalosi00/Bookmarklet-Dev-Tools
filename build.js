#!/usr/bin/env node
/*
 * build.js — concatenates src/*.js into src.js (single-file bookmarklet build)
 * Usage: node build.js [--minify]
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'src.js');

const BANNER = '/*! Pocket DevTools v4.0.0 | MIT | improved fork of DeveloperExotic/Bookmarklet-Dev-Tools */\n';

const files = fs.readdirSync(SRC)
  .filter(f => f.endsWith('.js'))
  .sort();

if (!files.length) {
  console.error('No source files found in src/');
  process.exit(1);
}

let out = files.map(f => {
  const code = fs.readFileSync(path.join(SRC, f), 'utf8');
  return '/* ===== ' + f + ' ===== */\n' + code;
}).join('\n\n');

fs.writeFileSync(OUT, BANNER + out);
console.log('Built ' + OUT + ' (' + files.length + ' modules, ' + Math.round(out.length / 1024) + ' KB)');

if (process.argv.includes('--minify')) {
  try {
    const { minify } = require('terser');
    minify(out, { compress: true, mangle: true }).then(res => {
      if (res.code) {
        fs.writeFileSync(OUT, BANNER + res.code);
        console.log('Minified -> ' + Math.round(res.code.length / 1024) + ' KB');
      }
    }).catch(e => { console.error('Minify failed, keeping readable build:', e.message); });
  } catch (e) {
    console.error('terser not installed — shipping readable build. npm i -g terser to enable.');
  }
}
