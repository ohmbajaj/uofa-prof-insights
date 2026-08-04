/**
 * Generates the extension icons: a rounded cardinal tile with a white star.
 *
 * Written by hand rather than pulled from a raster library so the icons are
 * reproducible from source with zero extra dependencies — `npm run icons`
 * regenerates them byte-for-byte.
 *
 * Usage: node scripts/generate-icons.mjs [outDir]
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] ?? join(ROOT, 'src', 'assets');

// UofA cardinal and a lighter tint for the gradient.
const CARDINAL = [0xab, 0x05, 0x32];
const CARDINAL_LIGHT = [0xc8, 0x14, 0x45];
const WHITE = [0xff, 0xff, 0xff];

/** Supersampling factor — each output pixel averages SS x SS samples. */
const SS = 4;

// ---------------------------------------------------------------- PNG writing

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

/** Encodes an RGBA pixel buffer as a PNG. */
function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA

  // One filter byte (0 = none) per scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      raw[p++] = rgba[i];
      raw[p++] = rgba[i + 1];
      raw[p++] = rgba[i + 2];
      raw[p++] = rgba[i + 3];
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------- geometry

/** Point-in-polygon via the even-odd ray casting rule. */
function inPolygon(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const xi = points[i];
    const yi = points[i + 1];
    const xj = points[j];
    const yj = points[j + 1];
    const straddles = yi > py !== yj > py;
    if (straddles && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Flat list of x,y for a five-pointed star. */
function starPoints(cx, cy, outer, inner, rotation = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i * Math.PI) / 5;
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return pts;
}

function inRoundedRect(px, py, size, radius) {
  const min = radius;
  const max = size - radius;
  const cx = px < min ? min : px > max ? max : px;
  const cy = py < min ? min : py > max ? max : py;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// --------------------------------------------------------------------- render

function renderIcon(size) {
  const rgba = new Uint8Array(size * size * 4);

  // Small icons need proportionally chunkier geometry to stay legible.
  const radius = size * (size <= 16 ? 0.22 : 0.2);
  const starOuter = size * (size <= 16 ? 0.42 : 0.36);
  const starInner = starOuter * 0.42;
  const cx = size / 2;
  const cy = size / 2 + (size <= 16 ? 0 : size * 0.005);

  const star = starPoints(cx, cy, starOuter, starInner);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let tileHits = 0;
      let starHits = 0;

      // Supersample: count how many sub-samples land in the tile and the star.
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (!inRoundedRect(px, py, size, radius)) continue;
          tileHits++;
          if (inPolygon(px, py, star)) starHits++;
        }
      }

      const total = SS * SS;
      const i = (y * size + x) * 4;
      if (tileHits === 0) {
        rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 0;
        continue;
      }

      // Vertical gradient across the tile, then blend the star over it.
      const base = mix(CARDINAL_LIGHT, CARDINAL, y / Math.max(1, size - 1));
      const starRatio = starHits / tileHits;
      const [r, g, b] = mix(base, WHITE, starRatio);

      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = Math.round((tileHits / total) * 255);
    }
  }

  return encodePNG(size, rgba);
}

mkdirSync(OUT, { recursive: true });
for (const size of [16, 48, 128]) {
  const file = join(OUT, `icon-${size}.png`);
  writeFileSync(file, renderIcon(size));
  console.log(`wrote ${file}`);
}
