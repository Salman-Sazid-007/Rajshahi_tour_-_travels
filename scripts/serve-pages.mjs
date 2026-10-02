import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
const prefix = '/Rajshahi_tour_-_travels';
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8' };
const server = http.createServer(async (req,res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url,'http://preview.invalid').pathname);
    if (pathname === '/') { res.writeHead(302,{Location:`${prefix}/pro/`}); res.end(); return; }
    if (pathname.startsWith('/api/')) {
      // Deliberate static-only preview: apiFetch recognizes non-JSON and uses demo data.
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('Static preview: no live API.');return;
    }
    let root = path.join(repo,'docs');
    if (pathname === prefix || pathname.startsWith(prefix+'/')) pathname = pathname.slice(prefix.length) || '/';
    else if (pathname === '/docs' || pathname.startsWith('/docs/')) pathname = pathname.slice(5) || '/';
    else if (pathname === '/pro' || pathname.startsWith('/pro/')) { root = path.join(repo,'pro'); pathname = pathname.slice(4) || '/'; }
    const target = path.resolve(root, `.${pathname}`);
    if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    const info = await stat(target);
    if (info.isDirectory() && !pathname.endsWith('/')) { res.writeHead(301,{Location:req.url.split('?')[0]+'/'});res.end();return; }
    const file = info.isDirectory() ? path.join(target,'index.html') : target;
    const data = await readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  } catch { res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found'); }
});
server.listen(port,'0.0.0.0',() => console.log(`Classic + International Pro preview: port ${port}, ${prefix}/pro/`));
const stop=()=>server.close(()=>process.exit(0));
process.on('SIGTERM',stop);process.on('SIGINT',stop);
