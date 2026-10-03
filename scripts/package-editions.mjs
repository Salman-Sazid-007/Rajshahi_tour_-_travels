// Packages the two built editions into downloadable ZIPs.
//
// Classic = frontend/dist without the nested pro/ edition.
// International Pro = frontend/dist/pro, which is self-contained.
//
// Run `npm run build` (or `build:pages`) first so frontend/dist exists.
// Output lands in release-artifacts/ at the repository root.

import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';

const repo = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(repo, 'frontend/dist');
const staging = path.join(repo, 'release-artifacts/.staging');
const outDir = path.join(repo, 'release-artifacts');

const { version } = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8'));

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const build = `v${version} — commit ${git('rev-parse', '--short', 'HEAD')} (${git('rev-parse', '--abbrev-ref', 'HEAD')})`;

async function readme(name) {
  const text = await readFile(path.join(repo, 'scripts/release-readme', `${name}.txt`), 'utf8');
  return text.replace('__BUILD__', build);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(staging, { recursive: true });

// Classic: everything the Pages build produces except the nested Pro edition.
const classic = path.join(staging, 'classic');
await cp(dist, classic, { recursive: true });
await rm(path.join(classic, 'pro'), { recursive: true, force: true });
await writeFile(path.join(classic, 'README.txt'), await readme('classic'));

// International Pro: the standalone, relative-path build.
const pro = path.join(staging, 'pro');
await cp(path.join(dist, 'pro'), pro, { recursive: true });
await writeFile(path.join(pro, 'README.txt'), await readme('pro'));

// Ship both setup guides inside each archive, and alongside them for upload.
const guides = ['Running-Locally.pdf', 'Bangla-Guide.pdf'];
const present = [];
for (const name of guides) {
  const src = path.join(repo, name);
  if (await access(src).then(() => true, () => false)) {
    await cp(src, path.join(classic, name));
    await cp(src, path.join(pro, name));
    present.push(name);
  } else {
    console.warn(`${name} not found — run the matching scripts/make-*-guide.mjs first.`);
  }
}

const archives = [
  { folder: 'classic', file: `rajshahi-tours-classic-v${version}.zip` },
  { folder: 'pro', file: `rajshahi-tours-international-pro-v${version}.zip` },
];

for (const { folder, file } of archives) {
  // -r recurse, -q quiet, -X drop platform extra fields for stable archives.
  execFileSync('zip', ['-rqX', path.join(outDir, file), folder], { cwd: staging, stdio: 'inherit' });
}

for (const name of present) await cp(path.join(repo, name), path.join(outDir, name));

await rm(staging, { recursive: true, force: true });

for (const file of (await readdir(outDir)).sort()) {
  console.log(`release-artifacts/${file}`);
}
