/**
 * zip-stream.js — minimal ZIP (STORED, no compression) streaming writer.
 *
 * Why no compression: most static-build outputs are already compressed
 * (gzipped JS, optimized PNGs/WebPs). DEFLATE would buy little and add
 * a CPU hit + an external dep. STORED keeps the writer ~150 LOC, deps
 * zero, and lets the response stream as soon as the first file is read.
 *
 * Public API:
 *   const z = createZipStream(res);  // res = http.ServerResponse
 *   await z.addFile("rel/path.txt", "/abs/path/on/disk");
 *   await z.end();
 *
 * Cap: per-file size 4 GiB (ZIP32 limit). Files larger get skipped with
 * a warning written to res. For multi-GB outputs use ZIP64 — out of
 * scope here.
 *
 * Order of writing:
 *   For each file:
 *     - Local File Header (LFH)  + filename
 *     - File data (STORED)
 *   Central directory (one CDR per file)
 *   End-of-central-directory record (EOCDR)
 */

"use strict";

const fs = require("fs");
const zlib = require("zlib");

const SIG_LFH    = 0x04034b50;
const SIG_CDR    = 0x02014b50;
const SIG_EOCDR  = 0x06054b50;
const METHOD_STORED = 0;

function _u32(buf, off, v) { buf.writeUInt32LE(v >>> 0, off); }
function _u16(buf, off, v) { buf.writeUInt16LE(v & 0xffff, off); }

// Convert a JS Date → DOS date+time bytes.
function _dosTime(d) {
  return ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1f);
}
function _dosDate(d) {
  return (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
}

function createZipStream(res) {
  const central = [];   // accumulate CDR bytes here, written at .end()
  let offset = 0;       // running offset into the output stream

  function _write(buf) {
    return new Promise(function(resolve) {
      if (!res.write(buf)) res.once("drain", resolve);
      else resolve();
    });
  }

  async function addFile(zipPath, absPath) {
    let stat;
    try { stat = fs.statSync(absPath); } catch (_) { return; }
    if (!stat.isFile()) return;
    if (stat.size > 0xFFFFFFFE) return; // ZIP32 cap; skip silently
    const nameBuf = Buffer.from(zipPath, "utf8");

    // Compute CRC32 + read whole file (we need both before writing the
    // header for STORED entries with a known size). For files > 8MB we
    // compute streaming, otherwise just read into memory once.
    let crc = 0;
    if (stat.size > 8 * 1024 * 1024) {
      crc = await new Promise(function(resolve, reject) {
        const r = fs.createReadStream(absPath);
        const h = zlib.crc32 ? null : null;
        let c = 0xFFFFFFFF;
        r.on("data", function(chunk) { c = _crc32Chunk(c, chunk); });
        r.on("end", function() { resolve((c ^ 0xFFFFFFFF) >>> 0); });
        r.on("error", reject);
      });
    } else {
      const data = fs.readFileSync(absPath);
      crc = _crc32(data);
    }

    const now = new Date();
    const dosT = _dosTime(now), dosD = _dosDate(now);

    // Local File Header
    const lfh = Buffer.alloc(30);
    _u32(lfh,  0, SIG_LFH);
    _u16(lfh,  4, 20);                  // version needed
    _u16(lfh,  6, 0x0800);              // flags: UTF-8 filename
    _u16(lfh,  8, METHOD_STORED);
    _u16(lfh, 10, dosT);
    _u16(lfh, 12, dosD);
    _u32(lfh, 14, crc);
    _u32(lfh, 18, stat.size);           // compressed size
    _u32(lfh, 22, stat.size);           // uncompressed size
    _u16(lfh, 26, nameBuf.length);
    _u16(lfh, 28, 0);                   // extra field length
    await _write(lfh);
    await _write(nameBuf);
    const localHeaderOffset = offset;
    offset += lfh.length + nameBuf.length;

    // File data (stream large files, single-shot small ones)
    if (stat.size > 8 * 1024 * 1024) {
      await new Promise(function(resolve, reject) {
        const r = fs.createReadStream(absPath);
        r.on("data", function(chunk) {
          if (!res.write(chunk)) r.pause();
        });
        res.on("drain", function() { r.resume(); });
        r.on("end", resolve);
        r.on("error", reject);
      });
    } else {
      const data = fs.readFileSync(absPath);
      await _write(data);
    }
    offset += stat.size;

    // Central Directory Record (kept in memory, written at end)
    const cdr = Buffer.alloc(46);
    _u32(cdr,  0, SIG_CDR);
    _u16(cdr,  4, 20);                  // version made by
    _u16(cdr,  6, 20);                  // version needed
    _u16(cdr,  8, 0x0800);              // UTF-8 flag
    _u16(cdr, 10, METHOD_STORED);
    _u16(cdr, 12, dosT);
    _u16(cdr, 14, dosD);
    _u32(cdr, 16, crc);
    _u32(cdr, 20, stat.size);
    _u32(cdr, 24, stat.size);
    _u16(cdr, 28, nameBuf.length);
    _u16(cdr, 30, 0);                   // extra
    _u16(cdr, 32, 0);                   // comment
    _u16(cdr, 34, 0);                   // disk #
    _u16(cdr, 36, 0);                   // internal attrs
    _u32(cdr, 38, 0);                   // external attrs
    _u32(cdr, 42, localHeaderOffset);
    central.push(Buffer.concat([cdr, nameBuf]));
  }

  async function end() {
    const cdrStart = offset;
    let cdrSize = 0;
    for (const b of central) {
      await _write(b);
      cdrSize += b.length;
    }
    offset += cdrSize;
    // EOCDR
    const eocdr = Buffer.alloc(22);
    _u32(eocdr,  0, SIG_EOCDR);
    _u16(eocdr,  4, 0);                 // disk
    _u16(eocdr,  6, 0);                 // disk w/ central
    _u16(eocdr,  8, central.length);    // entries on this disk
    _u16(eocdr, 10, central.length);    // total entries
    _u32(eocdr, 12, cdrSize);
    _u32(eocdr, 16, cdrStart);
    _u16(eocdr, 20, 0);                 // comment len
    await _write(eocdr);
    res.end();
  }

  return { addFile, end };
}

// CRC-32 (IEEE 802.3) — public domain table generation.
let _CRC_TABLE;
function _crcTable() {
  if (_CRC_TABLE) return _CRC_TABLE;
  _CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    _CRC_TABLE[n] = c >>> 0;
  }
  return _CRC_TABLE;
}
function _crc32Chunk(crc, chunk) {
  const t = _crcTable();
  let c = crc;
  for (let i = 0; i < chunk.length; i++) c = t[(c ^ chunk[i]) & 0xff] ^ (c >>> 8);
  return c;
}
function _crc32(buf) { return (_crc32Chunk(0xFFFFFFFF, buf) ^ 0xFFFFFFFF) >>> 0; }

module.exports = { createZipStream };
