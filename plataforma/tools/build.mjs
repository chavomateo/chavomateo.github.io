// Genera la plataforma lista para servir en su propio dominio (por defecto plataforma.alianzaia.org).
// El host no está fijado en el código: se pasa por variables de entorno, así que si Carlos decide
// otro dominio (p. ej. uno de AES) basta con cambiar PF_HOST y volver a construir.
//
//   PF_HOST     dominio de la plataforma            (por defecto plataforma.alianzaia.org)
//   PF_BASE     ruta base dentro de ese dominio     (por defecto /)
//   WEB_ORIGIN  web institucional de la Alianza     (por defecto https://www.alianzaia.org)
//   PF_OUT      carpeta de salida                   (por defecto plataforma/dist)
//
// Uso: node plataforma/tools/build.mjs
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const host = process.env.PF_HOST || 'plataforma.alianzaia.org';
let base = process.env.PF_BASE || '/';
if (!base.startsWith('/')) base = '/' + base;
if (!base.endsWith('/')) base += '/';
const web = (process.env.WEB_ORIGIN || 'https://www.alianzaia.org').replace(/\/$/, '');
const out = resolve(raiz, process.env.PF_OUT || 'plataforma/dist');
if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) throw new Error(`PF_HOST no válido: ${host}`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. La plataforma, sin el esquema de base de datos, las herramientas ni la propia salida.
const fuera = new Set(['db', 'tools', 'tests', 'dist']);
for (const n of readdirSync(join(raiz, 'plataforma'))) {
  if (!fuera.has(n) && !n.startsWith('dist') && join(raiz, 'plataforma', n) !== out) cpSync(join(raiz, 'plataforma', n), join(out, n), { recursive: true });
}
// El inventario de candidatos es interno aunque esté minimizado: nunca se publica en dist.
rmSync(join(out, 'data', 'kit-espacios-datos-candidatos.json'), { force: true });
// 2. Recursos compartidos con la web de la Alianza (los alojamos nosotros, sin CDN de terceros).
for (const r of ['styles.css', 'favicon.png', 'fonts', 'img/isotipo-oficial.png', 'img/cursor-arrow.png']) {
  cpSync(join(raiz, r), join(out, r), { recursive: true });
}

// 3. Reescritura de rutas: /plataforma/ pasa a la base; los enlaces a páginas de la web
//    institucional pasan a URL absoluta, porque en el subdominio no existen.
const aWeb = ['/proyecto-alianzaia/', '/privacidad.html', '/condiciones.html', '/cookies.html'];
const reescribir = (txt) => {
  let t = txt.replaceAll('/plataforma/', base);
  for (const p of aWeb) t = t.replaceAll(`"${p}`, `"${web}${p}`).replaceAll(`'${p}`, `'${web}${p}`);
  return t;
};
const recorrer = (d) => {
  for (const n of readdirSync(d)) {
    const f = join(d, n);
    if (statSync(f).isDirectory()) { recorrer(f); continue; }
    if (['.html', '.js', '.css', '.json'].includes(extname(f))) writeFileSync(f, reescribir(readFileSync(f, 'utf8')));
  }
};
recorrer(out);

// 4. Configuración que leen las páginas en tiempo de ejecución.
writeFileSync(join(out, 'config.json'), JSON.stringify({ host, base, web }, null, 2) + '\n');
writeFileSync(join(out, 'HOST'), host + '\n');

// 5. Comprobación: no puede quedar ninguna referencia al prefijo antiguo.
const restos = [];
const revisar = (d) => {
  for (const n of readdirSync(d)) {
    const f = join(d, n);
    if (statSync(f).isDirectory()) revisar(f);
    else if (['.html', '.js', '.css'].includes(extname(f)) && base !== '/plataforma/' && readFileSync(f, 'utf8').includes('/plataforma/')) restos.push(relative(out, f));
  }
};
revisar(out);
if (restos.length) throw new Error(`Quedan rutas /plataforma/ en: ${restos.join(', ')}`);
console.log(`Plataforma generada en ${relative(raiz, out)} para https://${host}${base} (web: ${web})`);
