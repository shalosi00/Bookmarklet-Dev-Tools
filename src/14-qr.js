/*
 * 14-qr.js — compact QR code encoder (ISO/IEC 18004), byte mode,
 *            versions 1-10, EC levels L and M, full mask selection.
 *            Renders to canvas; no external dependencies.
 *
 * Verified against the jsQR decoder in the automated test suite.
 */

/* ---- GF(256) arithmetic, primitive polynomial 0x11D ---- */
var QR_EXP = new Array(512), QR_LOG = new Array(256);
(function () {
  var x = 1;
  for (var i = 0; i < 255; i++) {
    QR_EXP[i] = x; QR_LOG[x] = i;
    x <<= 1; if (x & 0x100) x ^= 0x11D;
  }
  for (var j = 255; j < 512; j++) QR_EXP[j] = QR_EXP[j - 255];
})();
function qrGmul(a, b) { return (a && b) ? QR_EXP[QR_LOG[a] + QR_LOG[b]] : 0; }

/* ---- Reed-Solomon ---- */
function qrRsGenerator(ecLen) {
  /* coefficients, index 0 = highest degree; product of (x - a^i) */
  var g = [1];
  for (var i = 0; i < ecLen; i++) {
    var ng = new Array(g.length + 1);
    for (var t = 0; t < ng.length; t++) ng[t] = 0;
    for (var j = 0; j < g.length; j++) {
      ng[j] ^= g[j];
      ng[j + 1] ^= qrGmul(g[j], QR_EXP[i]);
    }
    g = ng;
  }
  return g;
}
function qrRsEncode(data, ecLen) {
  var gen = qrRsGenerator(ecLen);
  var rem = new Array(ecLen);
  for (var t = 0; t < ecLen; t++) rem[t] = 0;
  for (var i = 0; i < data.length; i++) {
    var factor = data[i] ^ rem[0];
    for (var s = 0; s < ecLen - 1; s++) rem[s] = rem[s + 1];
    rem[ecLen - 1] = 0;
    if (factor) for (var j = 0; j < ecLen; j++) rem[j] ^= qrGmul(gen[j + 1], factor);
  }
  return rem;
}

/* ---- block structure tables: [ecPerBlock, [[blocks, dataPerBlock], …]] ---- */
var QR_BLOCKS = {
  L: { 1: [7, [[1, 19]]], 2: [10, [[1, 34]]], 3: [15, [[1, 55]]], 4: [20, [[1, 80]]],
       5: [26, [[1, 108]]], 6: [18, [[2, 68]]], 7: [20, [[2, 78]]], 8: [24, [[2, 97]]],
       9: [30, [[2, 116]]], 10: [18, [[2, 68], [2, 69]]] },
  M: { 1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]],
       5: [24, [[2, 43]]], 6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]],
       9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]] }
};
var QR_ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
};
function qrDataCodewords(v, ec) {
  var spec = QR_BLOCKS[ec][v], n = 0;
  spec[1].forEach(function (b) { n += b[0] * b[1]; });
  return n;
}

/* ---- bit buffer ---- */
function qrBitBuf() { return { bits: [], len: 0 }; }
function qrPushBits(buf, val, n) {
  for (var i = n - 1; i >= 0; i--) {
    buf.bits.push((val >>> i) & 1);
    buf.len++;
  }
}

/* ---- format / version BCH codes ---- */
function qrBch15(data) {
  var v = data << 10;
  var deg = 14;
  while (deg >= 10) {
    if (v & (1 << deg)) v ^= 0x537 << (deg - 10);
    deg--;
  }
  return (data << 10) | v;
}
function qrBch18(data) {
  var v = data << 12;
  var deg = 17;
  while (deg >= 12) {
    if (v & (1 << deg)) v ^= 0x1F25 << (deg - 12);
    deg--;
  }
  return (data << 12) | v;
}

/* ---- matrix helpers ---- */
function qrNewMatrix(size) {
  var m = [], f = [];
  for (var r = 0; r < size; r++) {
    m.push(new Array(size).fill(0));
    f.push(new Array(size).fill(0));
  }
  return { m: m, f: f, size: size };
}
function qrSet(mat, r, c, dark) {
  if (r < 0 || c < 0 || r >= mat.size || c >= mat.size) return;
  mat.m[r][c] = dark ? 1 : 0;
  mat.f[r][c] = 1;
}

function qrDrawFunctionPatterns(mat, version) {
  var size = mat.size;
  /* finders + separators at three corners */
  [[0, 0], [0, size - 7], [size - 7, 0]].forEach(function (pos) {
    for (var dr = -1; dr <= 7; dr++) {
      for (var dc = -1; dc <= 7; dc++) {
        var r = pos[0] + dr, c = pos[1] + dc;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        var dark = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        qrSet(mat, r, c, dark);
      }
    }
  });
  /* timing patterns */
  for (var i = 8; i < size - 8; i++) {
    qrSet(mat, 6, i, i % 2 === 0);
    qrSet(mat, i, 6, i % 2 === 0);
  }
  /* alignment patterns */
  var centers = QR_ALIGN[version] || [];
  var last = size - 7;
  for (var a = 0; a < centers.length; a++) {
    for (var b = 0; b < centers.length; b++) {
      var cr = centers[a], cc = centers[b];
      if ((cr === 6 && cc === 6) || (cr === 6 && cc === last) || (cr === last && cc === 6)) continue;
      for (var dr2 = -2; dr2 <= 2; dr2++) {
        for (var dc2 = -2; dc2 <= 2; dc2++) {
          var dark2 = Math.max(Math.abs(dr2), Math.abs(dc2)) !== 1;
          qrSet(mat, cr + dr2, cc + dc2, dark2);
        }
      }
    }
  }
  /* reserve format info areas (values drawn later, per mask).
     Exact positions only — never overwrite timing modules at (6,8) / (8,6). */
  [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8], [8, 7],
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5]].forEach(function (p) { qrSet(mat, p[0], p[1], 0); });
  for (var i3 = 0; i3 < 8; i3++) qrSet(mat, 8, size - 1 - i3, 0);   /* row 8, right run */
  for (var i5 = 0; i5 < 8; i5++) qrSet(mat, size - 1 - i5, 8, 0);   /* col 8, bottom run */
  /* dark module */
  qrSet(mat, size - 8, 8, true);
  /* version info (v >= 7) */
  if (version >= 7) {
    var vdata = qrBch18(version);
    for (var vi = 0; vi < 18; vi++) {
      var bit = (vdata >>> vi) & 1;
      var a2 = size - 11 + (vi % 3), b2 = Math.floor(vi / 3);
      qrSet(mat, b2, a2, !!bit);      /* top-right  */
      qrSet(mat, a2, b2, !!bit);      /* bottom-left */
    }
  }
}

function qrDrawFormat(mat, ecBits, maskId) {
  var size = mat.size;
  var data = (ecBits << 3) | maskId;
  var bits = qrBch15(data) ^ 0x5412;
  function bit(i) { return ((bits >>> i) & 1) !== 0; }
  /* copy 1 — around top-left finder */
  for (var i = 0; i <= 5; i++) qrSet(mat, i, 8, bit(i));      /* col 8, rows 0-5 */
  qrSet(mat, 7, 8, bit(6));
  qrSet(mat, 8, 8, bit(7));
  qrSet(mat, 8, 7, bit(8));                                    /* row 8, col 7 */
  for (var j = 9; j < 15; j++) qrSet(mat, 8, 14 - j, bit(j));  /* row 8, cols 5-0 */
  /* copy 2 */
  for (var k = 0; k < 8; k++) qrSet(mat, 8, size - 1 - k, bit(k));      /* row 8, right run */
  for (var l = 8; l < 15; l++) qrSet(mat, size - 15 + l, 8, bit(l));    /* col 8, bottom run */
  qrSet(mat, size - 8, 8, true);   /* dark module stays dark */
}

/* ---- mask formulas ---- */
function qrMaskBit(mask, r, c) {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(c / 3) + Math.floor(r / 2)) % 2 === 0;
    case 5: return (r * c) % 2 + (r * c) % 3 === 0;
    case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
    case 7: return ((r + c) % 2 + (r * c) % 3) % 2 === 0;
  }
  return false;
}

/* ---- penalty scoring (ISO 18004 section 8.8.2) ---- */
function qrPenalty(mat) {
  var size = mat.size, m = mat.m, result = 0, r, c;

  function runHistoryOps(getColor, length) {
    /* scan one line; returns penalty for that line */
    var pen = 0;
    var runColor = 0, runLen = 0;
    var hist = [0, 0, 0, 0, 0, 0, 0];
    function addHist(len) {
      if (hist[0] === 0) len += length;   /* light border before start */
      hist.pop(); hist.unshift(len);
    }
    function countPatterns() {
      var n = hist[1];
      var core = n > 0 && hist[2] === n && hist[3] === n * 3 && hist[4] === n && hist[5] === n;
      return (core && hist[0] >= n * 4 && hist[6] >= n ? 1 : 0) +
             (core && hist[6] >= n * 4 && hist[0] >= n ? 1 : 0);
    }
    for (var i = 0; i < length; i++) {
      var col = getColor(i) ? 1 : 0;
      if (col === runColor) {
        runLen++;
        if (runLen === 5) pen += 3;
        else if (runLen > 5) pen += 1;
      } else {
        addHist(runLen);
        if (!runColor) pen += countPatterns() * 40;
        runColor = col; runLen = 1;
      }
    }
    /* terminate */
    if (runColor) { addHist(runLen); runLen = 0; }
    runLen += length;  /* light border at end */
    addHist(runLen);
    pen += countPatterns() * 40;
    return pen;
  }

  /* rows */
  for (r = 0; r < size; r++) {
    result += runHistoryOps(function (i) { return m[r][i]; }, size);
  }
  /* columns */
  for (c = 0; c < size; c++) {
    result += runHistoryOps(function (i) { return m[i][c]; }, size);
  }
  /* 2x2 blocks */
  for (r = 0; r < size - 1; r++) {
    for (c = 0; c < size - 1; c++) {
      var v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) result += 3;
    }
  }
  /* dark ratio */
  var dark = 0;
  for (r = 0; r < size; r++) for (c = 0; c < size; c++) dark += m[r][c];
  var total = size * size;
  var kk = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += kk * 10;
  return result;
}

/* ---- data placement (zigzag, skipping col 6) ---- */
function qrPlaceData(mat, codewords) {
  var size = mat.size;
  var i = 0, total = codewords.length * 8;
  for (var right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (var vert = 0; vert < size; vert++) {
      for (var j = 0; j < 2; j++) {
        var c = right - j;
        var upward = ((right + 1) & 2) === 0;
        var r = upward ? size - 1 - vert : vert;
        if (!mat.f[r][c] && i < total) {
          mat.m[r][c] = (codewords[i >>> 3] >>> (7 - (i & 7))) & 1;
          i++;
        }
      }
    }
  }
}

/* ---- encode text -> full QR matrix ---- */
function qrGenerate(text, ec) {
  ec = (ec === 'L') ? 'L' : 'M';
  var bytes;
  try { bytes = new TextEncoder().encode(String(text)); }
  catch (e) {
    /* UTF-8 by hand for very old engines */
    var s = unescape(encodeURIComponent(String(text)));
    bytes = [];
    for (var q = 0; q < s.length; q++) bytes.push(s.charCodeAt(q) & 0xFF);
  }
  if (!bytes.length) bytes = [0];

  /* choose version (1-10): prefer M, fall back to L for longer texts */
  var tried = [['M', 1], ['L', 1]], chosen = null;
  for (var t = 0; t < tried.length && !chosen; t++) {
    var e = tried[t][0];
    for (var v = 1; v <= 10; v++) {
      var countBits = v < 10 ? 8 : 16;
      if (4 + countBits + bytes.length * 8 + 4 <= qrDataCodewords(v, e) * 8) { chosen = { ec: e, v: v }; break; }
    }
  }
  if (!chosen) throw new Error('Text too long for QR (max ~270 bytes)');

  var spec = QR_BLOCKS[chosen.ec][chosen.v];
  var dataCap = qrDataCodewords(chosen.v, chosen.ec);
  var countBits = chosen.v < 10 ? 8 : 16;

  /* build the data bit stream */
  var buf = qrBitBuf();
  qrPushBits(buf, 4, 4);                    /* byte mode */
  qrPushBits(buf, bytes.length, countBits); /* char count */
  for (var b = 0; b < bytes.length; b++) qrPushBits(buf, bytes[b], 8);
  /* terminator */
  var cap = dataCap * 8;
  for (var tb = 0; tb < 4 && buf.len < cap; tb++) { buf.bits.push(0); buf.len++; }
  /* pad to byte boundary */
  while (buf.len % 8 !== 0) { buf.bits.push(0); buf.len++; }
  /* to codewords */
  var data = [];
  for (var cw = 0; cw < buf.bits.length / 8; cw++) {
    var byte = 0;
    for (var k = 0; k < 8; k++) byte = (byte << 1) | buf.bits[cw * 8 + k];
    data.push(byte);
  }
  /* pad codewords */
  var padAlt = [0xEC, 0x11], pi = 0;
  while (data.length < dataCap) data.push(padAlt[(pi++) % 2]);

  /* split into blocks + compute EC */
  var blocks = [], off = 0;
  spec[1].forEach(function (b2) {
    for (var n = 0; n < b2[0]; n++) {
      var chunk = data.slice(off, off + b2[1]);
      off += b2[1];
      blocks.push({ d: chunk, ec: qrRsEncode(chunk, spec[0]) });
    }
  });

  /* interleave */
  var maxD = 0;
  blocks.forEach(function (bl) { maxD = Math.max(maxD, bl.d.length); });
  var final = [];
  for (var di = 0; di < maxD; di++) {
    blocks.forEach(function (bl) { if (di < bl.d.length) final.push(bl.d[di]); });
  }
  for (var ei = 0; ei < spec[0]; ei++) {
    blocks.forEach(function (bl) { final.push(bl.ec[ei]); });
  }

  /* build the matrix, try all masks, keep the best */
  var size = 17 + 4 * chosen.v;
  var ecBits = chosen.ec === 'L' ? 1 : 0;
  var best = null;
  for (var mask = 0; mask < 8; mask++) {
    var mat = qrNewMatrix(size);
    qrDrawFunctionPatterns(mat, chosen.v);
    qrPlaceData(mat, final);
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        if (!mat.f[r][c] && qrMaskBit(mask, r, c)) mat.m[r][c] ^= 1;
      }
    }
    qrDrawFormat(mat, ecBits, mask);
    var pen = qrPenalty(mat);
    if (!best || pen < best.pen) best = { pen: pen, mat: mat };
  }

  return { size: size, version: chosen.v, ec: chosen.ec, modules: best.mat.m };
}

/* ---- render to canvas ---- */
function qrRender(canvas, text, scale, ec) {
  var qr = qrGenerate(text, ec || 'M');
  var margin = 4;
  var dim = (qr.size + margin * 2) * scale;
  canvas.width = dim; canvas.height = dim;
  var g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, dim, dim);
  g.fillStyle = '#000000';
  for (var r = 0; r < qr.size; r++) {
    for (var c = 0; c < qr.size; c++) {
      if (qr.modules[r][c]) g.fillRect((margin + c) * scale, (margin + r) * scale, scale, scale);
    }
  }
  return qr;
}
