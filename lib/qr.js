// QR rendering for the access link, so a phone can just scan the terminal
// instead of retyping a 70-character URL with a token in it.
//
// qrcode-terminal ships the encoder but only knows how to draw to a terminal,
// so the SVG renderer below walks the module grid itself.
const QRCode = require('qrcode-terminal/vendor/QRCode/index.js');
const QRErrorCorrectLevel = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js');

function encode(text) {
  const qr = new QRCode(-1, QRErrorCorrectLevel.L); // -1 = pick the smallest version that fits
  qr.addData(text);
  qr.make();
  return qr;
}

/** Runs of dark modules are merged into single rects to keep the SVG small. */
function toSvg(text, moduleSize = 5, quiet = 4) {
  const qr = encode(text);
  const count = qr.getModuleCount();
  const size = (count + quiet * 2) * moduleSize;
  let rects = '';
  for (let row = 0; row < count; row++) {
    let runStart = -1;
    for (let col = 0; col <= count; col++) {
      const dark = col < count && qr.isDark(row, col);
      if (dark && runStart < 0) runStart = col;
      if (!dark && runStart >= 0) {
        const x = (runStart + quiet) * moduleSize;
        const y = (row + quiet) * moduleSize;
        rects += `<rect x="${x}" y="${y}" width="${(col - runStart) * moduleSize}" height="${moduleSize}"/>`;
        runStart = -1;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`
    + `<rect width="${size}" height="${size}" fill="#ffffff"/><g fill="#000000">${rects}</g></svg>`;
}

/**
 * Half-block rendering: two QR rows per text row, so a version-4 code fits in
 * an 80x24 terminal. Assumes a dark terminal background — the full block is the
 * *light* module, because that is what actually reflects light on screen.
 */
function toTerminal(text) {
  const qr = encode(text);
  const count = qr.getModuleCount();
  const quiet = 2;
  const total = count + quiet * 2;
  const dark = (row, col) => {
    const r = row - quiet;
    const c = col - quiet;
    if (r < 0 || c < 0 || r >= count || c >= count) return false;
    return qr.isDark(r, c);
  };
  const lines = [];
  for (let row = 0; row < total; row += 2) {
    let line = '';
    for (let col = 0; col < total; col++) {
      const top = dark(row, col);
      const bottom = dark(row + 1, col);
      if (top && bottom) line += ' ';
      else if (top) line += '▄';
      else if (bottom) line += '▀';
      else line += '█';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

module.exports = { toSvg, toTerminal };
