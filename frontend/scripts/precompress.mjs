// Writes .br and .gz copies next to every compressible file of a build. Caddy serves them
// as they are (`file_server { precompressed br gzip }`): brotli 11 is 16–19 % smaller than Caddy's
// on-the-fly zstd-3, Safari gets brotli instead of gzip-5, and no CPU is spent per visit.
//   node scripts/precompress.mjs dist/frontend/browser
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const root = process.argv[2];
if (!root) throw new Error('usage: node scripts/precompress.mjs <dir>');
const COMPRESSIBLE = /\.(?:js|mjs|css|html|json|svg|txt|xml|webmanifest)$/;
const MIN_BYTES = 1024;

let files = 0;
let before = 0;
let after = 0;
for (const path of walk(root)) {
  if (!COMPRESSIBLE.test(path)) continue;
  const body = readFileSync(path);
  if (body.length < MIN_BYTES) continue;
  const br = brotliCompressSync(body, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: body.length,
    },
  });
  const gz = gzipSync(body, { level: 9 });
  if (br.length < body.length) writeFileSync(`${path}.br`, br);
  if (gz.length < body.length) writeFileSync(`${path}.gz`, gz);
  files++;
  before += body.length;
  after += Math.min(br.length, body.length);
}
console.log(
  `precompressed ${files} files: ${(before / 1024).toFixed(0)} kB → ${(after / 1024).toFixed(0)} kB (brotli)`,
);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (!/\.(?:br|gz)$/.test(name)) yield path;
  }
}
