// PWA icons, generated at startup so the repo stays free of binary blobs.
// Draws a rounded dark square with a teal ">_" prompt, anti-aliased via signed
// distance fields (a full PNG encoder is only ~40 lines, so no dependency).
const zlib = require('zlib');

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Distance from a point to a line segment — used to stroke the glyph. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function render(size) {
  const bg = [24, 24, 27];
  const fg = [45, 212, 191];
  const radius = size * 0.22;
  const stroke = size * 0.085;
  const raw = Buffer.alloc((size * 4 + 1) * size);

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // PNG filter: none
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      const qx = Math.abs(px - size / 2) - (size / 2 - radius);
      const qy = Math.abs(py - size / 2) - (size / 2 - radius);
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
        + Math.min(Math.max(qx, qy), 0) - radius;
      const bgAlpha = Math.max(0, Math.min(1, 0.5 - outside));

      // ">" chevron plus the "_" underscore
      let d = Math.min(
        segDist(px, py, size * 0.26, size * 0.3, size * 0.5, size * 0.5),
        segDist(px, py, size * 0.5, size * 0.5, size * 0.26, size * 0.7)
      );
      d = Math.min(d, segDist(px, py, size * 0.56, size * 0.7, size * 0.76, size * 0.7));
      const fgAlpha = Math.max(0, Math.min(1, (stroke / 2 - d) + 0.5)) * bgAlpha;

      const o = rowStart + 1 + x * 4;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(bg[c] * (1 - fgAlpha) + fg[c] * fgAlpha);
      raw[o + 3] = Math.round(bgAlpha * 255);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { render };
