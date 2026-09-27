// Erzeugt die zwei Fixture-Bilder fuer f3-status-board (deterministisch,
// nur Node-Standardbibliothek). Einmallauf; Ausgabe: checks/*.png.
// Prueft die eigenen Pixel per Selbst-Check (Farben/Anzahlen).
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || require("path").join(__dirname, "..", "variants");

function crc32(buf) {
  let tab = crc32.tab;
  if (!tab) {
    tab = crc32.tab = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tab[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = tab[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(w, h, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < h; y++) {
    rows.push(Buffer.from([0]));
    rows.push(Buffer.from(rgb.subarray(y * w * 3, (y + 1) * w * 3)));
  }
  const idat = zlib.deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const C = {
  white: [240, 240, 240], black: [20, 20, 20], green: [34, 160, 70],
  red: [220, 50, 50], blue: [50, 120, 220], gray: [170, 170, 170],
  darkgray: [110, 110, 110],
};

function canvas(w, h, bg) {
  const buf = Buffer.alloc(w * 3 * h);
  for (let i = 0; i < w * h; i++) { buf[i * 3] = bg[0]; buf[i * 3 + 1] = bg[1]; buf[i * 3 + 2] = bg[2]; }
  return {
    buf,
    rect(x, y, rw, rh, col) {
      for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) {
        if (i < 0 || j < 0 || i >= w || j >= h) continue;
        buf[(j * w + i) * 3] = col[0]; buf[(j * w + i) * 3 + 1] = col[1]; buf[(j * w + i) * 3 + 2] = col[2];
      }
    },
    frame(x, y, rw, rh, col) {
      this.rect(x, y, rw, 2, col); this.rect(x, y + rh - 2, rw, 2, col);
      this.rect(x, y, 2, rh, col); this.rect(x + rw - 2, y, 2, rh, col);
    },
    count(col) {
      let n = 0;
      for (let i = 0; i < w * h; i++) {
        if (buf[i * 3] === col[0] && buf[i * 3 + 1] === col[1] && buf[i * 3 + 2] === col[2]) n++;
      }
      return n;
    },
  };
}

// v-shot: Status-Board 240x160 — blauer Kopf, 4x3 Zellen (3 rot, Rest gruen).
{
  const W = 240, H = 160;
  const c = canvas(W, H, C.white);
  c.rect(0, 0, W, 24, C.blue);
  const reds = new Set(['1,0', '3,1', '0,2']);
  for (let r = 0; r < 3; r++) {
    for (let col = 0; col < 4; col++) {
      const x = 6 + col * 59, y = 30 + r * 42;
      c.rect(x, y, 53, 36, reds.has(`${col},${r}`) ? C.red : C.green);
      c.frame(x, y, 53, 36, C.black);
    }
  }
  if (c.count(C.red) === 0 || c.count(C.blue) === 0) throw new Error('shot: Farben fehlen');
  fs.writeFileSync(path.join(OUT, 'v-shot', 'checks', 'board.png'), png(W, H, c.buf));
  console.log(`shot ok: red_px=${c.count(C.red)} blue_px=${c.count(C.blue)} green_px=${c.count(C.green)}`);
}

// v-diagram: Pipeline 240x120 — 4 Kae sten, 3 grau, letzte gruen, Pfeile dazwischen.
{
  const W = 240, H = 120;
  const c = canvas(W, H, C.white);
  for (let i = 0; i < 4; i++) {
    const x = 8 + i * 59;
    c.rect(x, 40, 50, 40, i === 3 ? C.green : C.gray);
    c.frame(x, 40, 50, 40, C.black);
    if (i < 3) {
      c.rect(x + 50, 58, 9, 4, C.black); // Pfeilschaft
      c.rect(x + 55, 54, 4, 12, C.black); // Pfeilspitze (Block)
    }
  }
  if (c.count(C.green) === 0 || c.count(C.gray) === 0) throw new Error('diagram: Farben fehlen');
  fs.writeFileSync(path.join(OUT, 'v-diagram', 'checks', 'flow.png'), png(W, H, c.buf));
  console.log(`diagram ok: gray_px=${c.count(C.gray)} green_px=${c.count(C.green)}`);
}
