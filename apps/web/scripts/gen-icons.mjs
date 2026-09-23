// Generates PWA icons without any image dependency: a minimal PNG encoder
// drawing a chunky kaiju silhouette on the game's background color.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

// 16x16 pixel-art kaiju, '#' = body, 'e' = eye, 's' = spike, '.' = background
const ART = [
  '................',
  '......ss........',
  '.....s##s.......',
  '....s####s......',
  '....##e###......',
  '....######......',
  '...s#######.....',
  '..s########s....',
  '.s#########ss...',
  '.###########s#..',
  '.############...',
  '..##########....',
  '..###...####....',
  '..###...####....',
  '.####...####....',
  '................',
];
const BG = [13, 27, 42];
const BODY = [102, 187, 106];
const SPIKE = [255, 213, 79];
const EYE = [255, 255, 255];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const cell = size / 16;
  const pad = size * 0.08; // maskable safe area: keep the art inside
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const ax = Math.floor((x - pad) / ((size - pad * 2) / 16));
      const ay = Math.floor((y - pad) / ((size - pad * 2) / 16));
      let c = BG;
      if (ax >= 0 && ay >= 0 && ax < 16 && ay < 16) {
        const ch = ART[ay][ax];
        c = ch === '#' ? BODY : ch === 's' ? SPIKE : ch === 'e' ? EYE : BG;
      }
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = c[0];
      raw[i + 1] = c[1];
      raw[i + 2] = c[2];
    }
  }
  void cell;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
for (const size of [180, 192, 512]) {
  writeFileSync(join(out, `icon-${size}.png`), png(size));
  console.log(`wrote icon-${size}.png`);
}
