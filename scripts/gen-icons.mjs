// Rasterises the app icon (same geometry as public/icons/icon.svg) into PNGs
// for the web manifest, without external dependencies.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function roundRect(x, y, w, h, r) {
  return (px, py) => {
    if (px < x || px > x + w || py < y || py > y + h) return false;
    const cx = Math.min(Math.max(px, x + r), x + w - r);
    const cy = Math.min(Math.max(py, y + r), y + h - r);
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
  };
}

function segment(ax, ay, bx, by, half) {
  return (px, py) => {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2 <= half * half;
  };
}

/** Shapes in 512-unit space, painted in order. `inset` shrinks the artwork for maskable icons. */
function shapes(maskable) {
  const line = [[104, 216], [216, 152], [296, 184], [408, 96]];
  const list = [
    [maskable ? () => true : roundRect(0, 0, 512, 512, 112), '#1c5cab'],
    [roundRect(104, 296, 64, 120, 16), '#86b6ef'],
    [roundRect(200, 232, 64, 184, 16), '#cde2fb'],
    [roundRect(296, 168, 64, 248, 16), '#ffffff'],
  ];
  for (let i = 0; i < line.length - 1; i++) list.push([segment(...line[i], ...line[i + 1], 14), '#eda100']);
  list.push([(px, py) => (px - 408) ** 2 + (py - 96) ** 2 <= 24 * 24, '#eda100']);
  return list;
}

function render(size, maskable) {
  const list = shapes(maskable).map(([f, c]) => [f, hex(c)]);
  const scale = maskable ? 0.72 : 1; // keep artwork inside the maskable safe zone
  const off = (512 - 512 * scale) / 2;
  const ss = 4; // supersampling for anti-aliasing
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const ux = ((x + (sx + 0.5) / ss) / size) * 512;
        const uy = ((y + (sy + 0.5) / ss) / size) * 512;
        let col = null;
        for (let i = 0; i < list.length; i++) {
          const [f, c] = list[i];
          const inBg = i === 0;
          const px = inBg ? ux : (ux - off) / scale, py = inBg ? uy : (uy - off) / scale;
          if (f(px, py)) col = c;
        }
        if (col) { r += col[0]; g += col[1]; b += col[2]; a += 255; }
      }
      const n = ss * ss, cov = a / 255;
      const o = 1 + x * 4;
      row[o] = cov ? Math.round(r / cov) : 0;
      row[o + 1] = cov ? Math.round(g / cov) : 0;
      row[o + 2] = cov ? Math.round(b / cov) : 0;
      row[o + 3] = Math.round(a / n);
    }
    rows.push(row);
  }
  return png(size, Buffer.concat(rows));
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size, maskable] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['maskable-512.png', 512, true]]) {
  writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), render(size, maskable));
  console.log('wrote', name);
}
