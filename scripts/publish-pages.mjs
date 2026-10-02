import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';

const repo = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(repo, 'frontend/dist');

await cp(path.join(repo, 'frontend/font-licenses'), path.join(dist, 'licenses'), { recursive: true });
await cp(path.join(repo, 'frontend/font-licenses'), path.join(dist, 'pro/licenses'), { recursive: true });

// The runtime and Actions artifact include both editions and Classic media.
await cp(path.join(repo, 'backend/public/media'), path.join(dist, 'media'), { recursive: true });
await cp(path.join(dist, 'index.html'), path.join(dist, '404.html'));
await writeFile(path.join(dist, '.nojekyll'), '');

if (process.argv.includes('--artifact-only')) {
  console.log('Pages artifact prepared in frontend/dist (Classic + /pro/).');
} else {
  // Only replace known generated folders; keep any unrelated /docs files intact.
  const docs = path.join(repo, 'docs');
  await mkdir(docs, { recursive: true });
  for (const folder of ['assets', 'media', 'pro', 'licenses']) {
    await rm(path.join(docs, folder), { recursive: true, force: true });
    await cp(path.join(dist, folder), path.join(docs, folder), { recursive: true });
  }
  for (const file of ['index.html', '404.html', '.nojekyll']) {
    await cp(path.join(dist, file), path.join(docs, file));
  }

  // Also provide the requested standalone repository /pro/ edition.
  const standalone = path.join(repo, 'pro');
  await mkdir(standalone, { recursive: true });
  await rm(path.join(standalone, 'assets'), { recursive: true, force: true });
  await cp(path.join(dist, 'pro'), standalone, { recursive: true });
  const html = await readFile(path.join(standalone, 'index.html'), 'utf8');
  await writeFile(
    path.join(standalone, 'index.html'),
    html.replace('name="classic-edition-url" content="../"', 'name="classic-edition-url" content="../docs/"'),
  );
  console.log('Published Classic to docs/, Pro to docs/pro/ and standalone pro/.');
}
