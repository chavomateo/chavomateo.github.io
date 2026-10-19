// Sirve la plataforma ya construida (plataforma/dist) en Render (Web Service, Fráncfort).
// Sin dependencias: solo node:http. Cabeceras de seguridad y, mientras sea preview, noindex.
//
//   PORT        puerto (lo pone Render)
//   PF_OUT      carpeta construida              (por defecto plataforma/dist)
//   PF_NOINDEX  "0" para permitir indexación     (por defecto noindex)
//
// Uso: node plataforma/tools/serve.mjs
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = resolve(raiz, process.env.PF_OUT || 'plataforma/dist');
const noindex = process.env.PF_NOINDEX !== '0';
const tipos = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
};
const cabeceras = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000',
  ...(noindex ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
};

function resolver(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  const f = normalize(join(dist, p));
  if (f !== dist && !f.startsWith(dist + sep)) return null;
  if (existsSync(f) && statSync(f).isDirectory()) return existsSync(join(f, 'index.html')) ? join(f, 'index.html') : null;
  if (existsSync(f)) return f;
  if (!extname(f) && existsSync(f + '.html')) return f + '.html';
  return null;
}

createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, cabeceras).end(); return; }
  if (req.url === '/healthz') { res.writeHead(200, { ...cabeceras, 'Content-Type': 'text/plain' }).end('ok'); return; }
  // /dir sin barra final → /dir/ para que las rutas relativas funcionen
  const sinQuery = req.url.split('?')[0];
  if (!extname(sinQuery) && !sinQuery.endsWith('/')) {
    const f = resolver(sinQuery + '/');
    if (f) { res.writeHead(301, { ...cabeceras, Location: sinQuery + '/' + (req.url.slice(sinQuery.length)) }).end(); return; }
  }
  const f = resolver(req.url);
  if (!f) {
    const nf = join(dist, '404.html');
    res.writeHead(404, { ...cabeceras, 'Content-Type': 'text/html; charset=utf-8' });
    if (existsSync(nf) && req.method === 'GET') createReadStream(nf).pipe(res); else res.end('No encontrado');
    return;
  }
  const ext = extname(f).toLowerCase();
  res.writeHead(200, {
    ...cabeceras,
    'Content-Type': tipos[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(f).pipe(res);
}).listen(process.env.PORT || 10000, () => console.log(`plataforma servida desde ${dist}`));
