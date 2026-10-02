import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const cx = (x + 0.5) / size - 0.5;
      const cy = (y + 0.5) / size - 0.5;
      const d = Math.sqrt(cx * cx + cy * cy);
      const inside = d < 0.46;
      const bar = Math.abs(cy) < 0.12 && Math.abs(cx) < 0.28;
      if (inside && bar) {
        raw[o++] = 0x1a; raw[o++] = 0x73; raw[o++] = 0xe8; raw[o++] = 0xff;
      } else if (inside) {
        raw[o++] = 0xe8; raw[o++] = 0xf0; raw[o++] = 0xfe; raw[o++] = 0xff;
      } else {
        raw[o++] = 0; raw[o++] = 0; raw[o++] = 0; raw[o++] = 0;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 48, 128]) {
  writeFileSync(join(outDir, `icon${size}.png`), png(size));
  console.log(`icons/icon${size}.png`);
}
