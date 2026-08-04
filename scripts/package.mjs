/**
 * Zips `dist/` into a Chrome Web Store upload at `release/<name>-<version>.zip`.
 *
 * Writes the archive by hand (stored, no compression) so packaging needs no
 * dependencies. Chrome accepts stored entries, and the payload is ~200 KB.
 *
 * Usage: node scripts/package.mjs   (run `npm run build` first)
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const RELEASE = join(ROOT, 'release');

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const manifest = JSON.parse(await readFile(join(DIST, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));

/** Every file under `dir`, as paths relative to DIST with forward slashes. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(relative(DIST, full).split(sep).join('/'));
  }
  return out.sort();
}

/**
 * Chrome refuses to load an unpacked extension containing any entry whose name
 * starts with `_` — those are reserved for `_locales` and `_metadata`. Zipping
 * around such a file would hide the fact that dist/ itself cannot be loaded,
 * so this fails instead.
 */
function assertNoReservedNames(files) {
  const reserved = files.filter((f) => f.split('/').some((part) => part.startsWith('_')));
  if (reserved.length === 0) return;

  console.error(
    `dist/ contains reserved '_'-prefixed entries, which Chrome will not load:\n  ${reserved.join('\n  ')}\nRun \`npm run build\` to clear them.`,
  );
  process.exit(1);
}

/** DOS date/time as used by the ZIP local header. */
function dosStamp(date) {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

async function buildZip(files) {
  const { time, day } = dosStamp(new Date());
  const locals = [];
  const central = [];
  let offset = 0;

  for (const name of files) {
    const data = await readFile(join(DIST, name));
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length

    locals.push(local, nameBuf, data);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); // central directory signature
    dir.writeUInt16LE(20, 4); // version made by
    dir.writeUInt16LE(20, 6); // version needed
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(0, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(day, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt16LE(0, 30); // extra
    dir.writeUInt16LE(0, 32); // comment
    dir.writeUInt16LE(0, 34); // disk number
    dir.writeUInt16LE(0, 36); // internal attrs
    dir.writeUInt32LE(0, 38); // external attrs
    dir.writeUInt32LE(offset, 42);

    central.push(dir, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, end]);
}

// The store rejects a build whose manifest version does not match what the
// listing expects; catching the drift here is cheaper than a failed upload.
if (manifest.version !== pkg.version) {
  console.error(
    `version mismatch: manifest.json is ${manifest.version}, package.json is ${pkg.version}`,
  );
  process.exit(1);
}

const files = walk(DIST);
if (files.length === 0) {
  console.error('dist/ is empty — run `npm run build` first.');
  process.exit(1);
}
assertNoReservedNames(files);

mkdirSync(RELEASE, { recursive: true });
const outFile = join(RELEASE, `${pkg.name}-${manifest.version}.zip`);
const zip = await buildZip(files);
writeFileSync(outFile, zip);

console.log(`packaged ${files.length} files -> ${relative(ROOT, outFile)}`);
console.log(`${(zip.length / 1024).toFixed(1)} KB`);
