// qr.js — minimal QR Code generator (Model 2, ECC level M).
//
// Adapted from Kazuhiko Arase's QR Code Generator (MIT, 2009). Stripped
// to just what DV needs: encode a UTF-8 string of ≤ ~250 chars (preview
// URLs) at version auto-pick, ECC M, into a boolean matrix you can paint
// into any canvas / SVG. No external deps.
//
// Public API (window.DV.qr):
//   makeMatrix(text)   → { size, modules: bool[size][size] }
//   renderSVG(text, opts) → string of inline SVG (drop into innerHTML)
//
// opts: { cell?: number=4, margin?: number=2, dark?: string="#000",
//         light?: string="#fff", attrs?: string="" }
(function(){
  "use strict";

  // ── Galois field tables (GF(256) with primitive 0x11d) ──
  var EXP_TABLE = new Array(256), LOG_TABLE = new Array(256);
  for (var i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
  for (i = 8; i < 256; i++) EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
  for (i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;

  function gexp(n) { while (n < 0) n += 255; while (n >= 256) n -= 255; return EXP_TABLE[n]; }
  function glog(n) { if (n < 1) throw new Error("glog(" + n + ")"); return LOG_TABLE[n]; }

  function Polynomial(num, shift) {
    var offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + (shift || 0));
    for (var i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
  }
  Polynomial.prototype.get = function(i) { return this.num[i]; };
  Polynomial.prototype.getLength = function() { return this.num.length; };
  Polynomial.prototype.multiply = function(e) {
    var num = new Array(this.getLength() + e.getLength() - 1);
    for (var j = 0; j < num.length; j++) num[j] = 0;
    for (var i = 0; i < this.getLength(); i++) {
      for (var jj = 0; jj < e.getLength(); jj++) {
        num[i + jj] ^= gexp(glog(this.get(i)) + glog(e.get(jj)));
      }
    }
    return new Polynomial(num, 0);
  };
  Polynomial.prototype.mod = function(e) {
    if (this.getLength() - e.getLength() < 0) return this;
    var ratio = glog(this.get(0)) - glog(e.get(0));
    var num = this.num.slice();
    for (var i = 0; i < e.getLength(); i++) num[i] ^= gexp(glog(e.get(i)) + ratio);
    return new Polynomial(num, 0).mod(e);
  };

  // ── Capacity tables (version 1..10, ECC level M) ──
  // [version][totalCodewords, dataCodewords, ecCodewordsPerBlock, blocks]
  var RS = {
    1:  [26,   16,  10, 1],
    2:  [44,   28,  16, 1],
    3:  [70,   44,  26, 1],
    4:  [100,  64,  18, 2],
    5:  [134,  86,  24, 2],
    6:  [172, 108,  16, 4],
    7:  [196, 124,  18, 4],
    8:  [242, 154,  22, 4],
    9:  [292, 182,  22, 5],
    10: [346, 216,  26, 5]
  };

  function getErrorCorrectPolynomial(ec) {
    var a = new Polynomial([1], 0);
    for (var i = 0; i < ec; i++) a = a.multiply(new Polynomial([1, gexp(i)], 0));
    return a;
  }

  // ── BitBuffer ──
  function BitBuffer() { this.buffer = []; this.length = 0; }
  BitBuffer.prototype.get = function(i) { return ((this.buffer[Math.floor(i / 8)] >>> (7 - i % 8)) & 1) === 1; };
  BitBuffer.prototype.put = function(num, len) {
    for (var i = 0; i < len; i++) this.putBit(((num >>> (len - i - 1)) & 1) === 1);
  };
  BitBuffer.prototype.putBit = function(bit) {
    var bufIdx = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIdx) this.buffer.push(0);
    if (bit) this.buffer[bufIdx] |= (0x80 >>> (this.length % 8));
    this.length++;
  };

  // ── Mode: byte (0x4) — encodes UTF-8 bytes ──
  function utf8Bytes(str) {
    var s = unescape(encodeURIComponent(str));
    var arr = new Array(s.length);
    for (var i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
    return arr;
  }

  function pickVersion(byteLen) {
    for (var v = 1; v <= 10; v++) {
      var dataCw = RS[v][1];
      // Mode (4 bits) + length (8 or 16 bits) + payload + 4 terminator bits
      var lenBits = v < 10 ? 8 : 16;
      var totalBits = 4 + lenBits + 8 * byteLen + 4;
      if (Math.ceil(totalBits / 8) <= dataCw) return v;
    }
    throw new Error("Text too long for QR (max ~216 bytes at ECC M)");
  }

  function buildBytes(version, bytes) {
    var buf = new BitBuffer();
    buf.put(4, 4);                                             // mode = byte
    buf.put(bytes.length, version < 10 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) buf.put(bytes[i], 8);
    var dataCw = RS[version][1];
    while (buf.length + 4 <= dataCw * 8) buf.putBit(0);        // terminator
    while (buf.length % 8) buf.putBit(0);                       // pad to byte
    var pad = [0xEC, 0x11], pi = 0;
    while (Math.ceil(buf.length / 8) < dataCw) { buf.put(pad[pi++ & 1], 8); }
    return buf;
  }

  function createData(version, bytes) {
    var buf = buildBytes(version, bytes);
    var info = RS[version];
    var totalCw = info[0], dataCw = info[1], ecCw = info[2], blocks = info[3];
    var perBlock = Math.floor(dataCw / blocks);
    var extra = dataCw - perBlock * blocks;
    var dataBlocks = [], ecBlocks = [];
    var offset = 0;
    for (var b = 0; b < blocks; b++) {
      var size = perBlock + (b >= blocks - extra ? 1 : 0);
      var dat = new Array(size);
      for (var i = 0; i < size; i++) dat[i] = (buf.buffer[offset + i] || 0) & 0xff;
      offset += size;
      dataBlocks.push(dat);
      // ECC
      var poly = new Polynomial(dat, ecCw);
      var mod = poly.mod(getErrorCorrectPolynomial(ecCw));
      var ecArr = new Array(ecCw);
      for (var k = 0; k < ecCw; k++) {
        var diff = mod.getLength() - ecCw + k;
        ecArr[k] = diff >= 0 ? mod.get(diff) : 0;
      }
      ecBlocks.push(ecArr);
    }
    // Interleave
    var result = new Array(totalCw), ri = 0;
    var maxData = 0; for (var d = 0; d < blocks; d++) maxData = Math.max(maxData, dataBlocks[d].length);
    for (var di = 0; di < maxData; di++) for (var dj = 0; dj < blocks; dj++) if (di < dataBlocks[dj].length) result[ri++] = dataBlocks[dj][di];
    for (var ei = 0; ei < ecCw; ei++) for (var ej = 0; ej < blocks; ej++) result[ri++] = ecBlocks[ej][ei];
    return result;
  }

  // ── Matrix layout ──
  function setupPositionPattern(m, row, col, size) {
    for (var r = -1; r <= 7; r++) for (var c = -1; c <= 7; c++) {
      if (row + r < 0 || size <= row + r || col + c < 0 || size <= col + c) continue;
      m[row + r][col + c] = (0 <= r && r <= 6 && (c === 0 || c === 6))
        || (0 <= c && c <= 6 && (r === 0 || r === 6))
        || (2 <= r && r <= 4 && 2 <= c && c <= 4);
    }
  }
  function setupTimingPattern(m, size) {
    for (var r = 8; r < size - 8; r++) if (m[r][6] === null) m[r][6] = (r % 2 === 0);
    for (var c = 8; c < size - 8; c++) if (m[6][c] === null) m[6][c] = (c % 2 === 0);
  }
  function setupTypeInfo(m, size, mask) {
    var data = (0 << 3) | mask;          // ECC level M = 0, mask 0..7
    var bch = data << 10;
    var poly = 0x537 << 4;
    while (bchDigit(bch) - bchDigit(poly) >= 0) bch ^= (poly >> (bchDigit(poly) - bchDigit(bch) + 4));
    var bits = ((data << 10) | (bch & 0x3ff)) ^ 0x5412;
    for (var i = 0; i < 15; i++) {
      var bit = ((bits >> i) & 1) === 1;
      // Vertical
      if (i < 6) m[i][8] = bit;
      else if (i < 8) m[i + 1][8] = bit;
      else m[size - 15 + i][8] = bit;
      // Horizontal
      if (i < 8) m[8][size - i - 1] = bit;
      else if (i < 9) m[8][15 - i - 1 + 1] = bit;
      else m[8][15 - i - 1] = bit;
    }
    m[size - 8][8] = true;
  }
  function bchDigit(data) { var d = 0; while (data !== 0) { d++; data >>>= 1; } return d; }

  function maskFn(p, r, c) {
    switch (p) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return (r * c) % 2 + (r * c) % 3 === 0;
      case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
      case 7: return ((r * c) % 3 + (r + c) % 2) % 2 === 0;
    }
    throw new Error("bad mask " + p);
  }

  function mapData(m, size, data, mask) {
    var inc = -1, row = size - 1, bitIdx = 7, byteIdx = 0;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (var k = 0; k < 2; k++) {
          if (m[row][col - k] === null) {
            var dark = false;
            if (byteIdx < data.length) dark = (((data[byteIdx] >>> bitIdx) & 1) === 1);
            if (maskFn(mask, row, col - k)) dark = !dark;
            m[row][col - k] = dark;
            bitIdx--;
            if (bitIdx === -1) { byteIdx++; bitIdx = 7; }
          }
        }
        row += inc;
        if (row < 0 || size <= row) { row -= inc; inc = -inc; break; }
      }
    }
  }

  function makeMatrix(text) {
    var bytes = utf8Bytes(text);
    var version = pickVersion(bytes.length);
    var size = version * 4 + 17;
    var m = new Array(size);
    for (var r = 0; r < size; r++) { m[r] = new Array(size); for (var c = 0; c < size; c++) m[r][c] = null; }
    setupPositionPattern(m, 0, 0, size);
    setupPositionPattern(m, size - 7, 0, size);
    setupPositionPattern(m, 0, size - 7, size);
    setupTimingPattern(m, size);
    var data = createData(version, bytes);
    var bestMask = 0;
    setupTypeInfo(m, size, bestMask);
    mapData(m, size, data, bestMask);
    return { size: size, modules: m };
  }

  function renderSVG(text, opts) {
    opts = opts || {};
    var matrix = makeMatrix(text);
    var n = matrix.size;
    var cell = opts.cell || 4;
    var margin = opts.margin != null ? opts.margin : 2;
    var dark = opts.dark || "#000";
    var light = opts.light || "#fff";
    var dim = (n + margin * 2) * cell;
    var paths = "";
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (matrix.modules[r][c]) {
          var x = (c + margin) * cell;
          var y = (r + margin) * cell;
          paths += "M" + x + " " + y + "h" + cell + "v" + cell + "h-" + cell + "z";
        }
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" width="' + dim + '" height="' + dim + '" ' + (opts.attrs || "") + '>'
      + '<rect width="100%" height="100%" fill="' + light + '"/>'
      + '<path fill="' + dark + '" d="' + paths + '"/>'
      + '</svg>';
  }

  window.DV = window.DV || {};
  window.DV.qr = { makeMatrix: makeMatrix, renderSVG: renderSVG };
})();
