#!/usr/bin/env node
// Genera la sección Actualidad / News a partir de noticias.json (fuente única).
//   node tools/actualidad.mjs                      → escribe en la raíz del sitio
//   node tools/actualidad.mjs --root <dir> --noindex → vista previa (añade noindex a todo lo generado)
// Salida: actualidad/, actualidad/<slug>/, en/news/, en/news/<slug>/ y el bloque
// <!-- actualidad:start --> … <!-- actualidad:end --> de index.html y en/index.html (3 últimas).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const ROOT = path.resolve(args.includes('--root') ? args[args.indexOf('--root') + 1] : REPO);
const NOINDEX = args.includes('--noindex');
const SITE = 'https://www.alianzaia.org';
const OG_IMAGE = `${SITE}/img/isotipo-oficial.png`;
const HOME_CARDS = 3;

const data = JSON.parse(fs.readFileSync(path.join(REPO, 'noticias.json'), 'utf8'));
const HEAD_STYLES = fs.readFileSync(path.join(REPO, 'tools', 'actualidad-head.html'), 'utf8');
const news = [...data.noticias].sort((a, b) => b.fecha.localeCompare(a.fecha));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MES = {
  es: { short: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
        long: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] },
  en: { short: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        long: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] },
};
function fecha(iso, lang, largo) {
  const [y, m, d] = iso.split('-').map(Number);
  const mes = MES[lang][largo ? 'long' : 'short'][m - 1];
  return lang === 'es' && largo ? `${d} de ${mes} de ${y}` : `${d} ${mes} ${y}`;
}

const T = {
  es: {
    lang: 'es', base: 'actualidad', section: 'Actualidad', homeTitle: 'Lo último de la Alianza.',
    listTitle: 'Actualidad de la Alianza', siteName: 'Alianza IA',
    listDesc: 'Noticias y posiciones de la Alianza Iberoamericana de IA sobre la inteligencia artificial en Iberoamérica y Europa.',
    more: 'Leer más →', all: 'Ver toda la actualidad', back: '← Toda la actualidad', sources: 'Fuente oficial', menu: 'Abrir menú',
    langLabel: 'Idioma', brandLabel: 'Alianza IA — Alianza Iberoamericana de IA', brandWord: 'Alianza', brandRing: 'IA',
    nav: [['', 'Inicio'], ['#quienes', 'Quiénes somos'], ['#reto', 'El reto'], ['#modelo', 'El modelo'], ['#proyectos', 'Proyectos']],
    join: 'Únete a la Alianza',
    footer: { tag: 'Una IA útil, confiable y competitiva para Iberoamérica y Europa.', h1: 'La Alianza', h2: 'Participa', h3: 'Contacto',
      collab: 'Formas de colaborar', legal: [['privacidad.html', 'Privacidad'], ['cookies.html', 'Cookies'], ['condiciones.html', 'Condiciones']],
      copy: '© 2026 Alianza Iberoamericana de IA (AI Alliance) · Corporación XV. Todos los derechos reservados.',
      aria: 'Alianza IA — Alianza Iberoamericana de IA' },
  },
  en: {
    lang: 'en', base: 'en/news', section: 'News', homeTitle: 'The latest from the Alliance.',
    listTitle: 'News from the Alliance', siteName: 'AI Alliance',
    listDesc: 'News and positions of the Ibero-American AI Alliance on artificial intelligence in Ibero-America and Europe.',
    more: 'Read more →', all: 'See all news', back: '← All news', sources: 'Official source', menu: 'Open menu',
    langLabel: 'Language', brandLabel: 'AI Alliance — The AI bridge between Ibero-America and Europe', brandWord: 'AI Alliance', brandRing: '',
    nav: [['', 'Home'], ['#quienes', 'Who we are'], ['#reto', 'The challenge'], ['#modelo', 'The model'], ['#proyectos', 'Projects']],
    join: 'Join the Alliance',
    footer: { tag: 'Useful, trustworthy and competitive AI for Ibero-America and Europe.', h1: 'The Alliance', h2: 'Get involved', h3: 'Contact',
      collab: 'Ways to collaborate', legal: [['privacidad.html', 'Privacy'], ['cookies.html', 'Cookies'], ['condiciones.html', 'Terms']],
      copy: '© 2026 Ibero-American AI Alliance (AI Alliance) · Corporación XV. All rights reserved.',
      aria: 'AI Alliance — Ibero-American AI Alliance' },
  },
};
const other = (lang) => (lang === 'es' ? 'en' : 'es');
const urlList = (lang) => `${SITE}/${T[lang].base}/`;
const urlItem = (lang, n) => `${SITE}/${T[lang].base}/${n[lang].slug}/`;

// P = prefijo hasta la raíz del sitio; H = prefijo hasta la portada del idioma.
function page({ lang, P, title, desc, canonical, alt, type, published, current, body, jsonld }) {
  const t = T[lang];
  const H = lang === 'es' ? P : `${P}en/`;
  const langLinks = lang === 'es'
    ? `<a href="./" aria-current="true">ES</a><span class="sep">·</span><a href="${alt.rel}">EN</a>`
    : `<a href="${alt.rel}">ES</a><span class="sep">·</span><a href="./" aria-current="true">EN</a>`;
  const navLinks = t.nav.map(([h, l]) => `      <a href="${H}${h}">${l}</a>`).join('\n');
  const listHref = current === 'list' ? './' : '../';
  return `<!doctype html>
<html lang="${lang}" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${NOINDEX ? '  <meta name="robots" content="noindex,nofollow">\n' : ''}  <title>${esc(title)}</title>
  <link rel="canonical" href="${canonical}">
  <meta name="description" content="${esc(desc)}">
  <meta property="og:site_name" content="${t.siteName}">
  <meta property="og:locale" content="${lang === 'es' ? 'es_ES' : 'en_GB'}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${OG_IMAGE}">
  <meta property="og:type" content="${type}">
${published ? `  <meta property="article:published_time" content="${published}">\n` : ''}  <meta name="twitter:card" content="summary">
  <link rel="alternate" hreflang="${lang}" href="${canonical}">
  <link rel="alternate" hreflang="${other(lang)}" href="${alt.abs}">
  <link rel="alternate" hreflang="x-default" href="${lang === 'es' ? canonical : alt.abs}">
  <link rel="icon" type="image/png" href="${P}favicon.png">
  <link rel="apple-touch-icon" href="${P}apple-touch-icon.png">
  <link href="${P}fonts/roboto.css" rel="stylesheet">
  <link rel="stylesheet" href="${P}styles.css">
  <link rel="stylesheet" href="${P}styles-v2.css">
${HEAD_STYLES.replaceAll('{{P}}', P)}${jsonld ? `  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>\n` : ''}</head>
<body>
  <header class="nav on-dark" id="nav">
    <a class="brand" href="${H}" aria-label="${t.brandLabel}">
      <span class="brand-word">${t.brandWord}</span>
      <span class="brand-ring" aria-hidden="true">${t.brandRing}</span>
    </a>
    <button class="nav-toggle" id="nav-toggle" aria-label="${t.menu}" aria-expanded="false"><span></span><span></span><span></span></button>
    <nav class="nav-links" id="nav-links">
${navLinks}
      <a href="${listHref}" aria-current="page">${t.section}</a>
      <a href="${H}#unete" class="nav-cta" data-ai-cta="nav_join">${t.join}</a>
      <span class="nav-lang" aria-label="${t.langLabel}">${langLinks}</span>
    </nav>
  </header>

${body}
  <footer class="footer">
    <div class="wrap footer-grid">
      <div class="footer-col footer-brand-col">
        <div class="footer-brand">
          <span class="brand" aria-label="${t.footer.aria}">
            <span class="brand-word">Alianza</span>
            <span class="brand-ring" aria-hidden="true">IA</span>
          </span>
        </div>
        <p class="footer-tag">${t.footer.tag}</p>
        <a href="${H}#unete" class="btn btn-primary" data-ai-cta="footer_join">${t.join}</a>
      </div>
      <div class="footer-col">
        <h4>${t.footer.h1}</h4>
${t.nav.slice(1).map(([h, l]) => `        <a href="${H}${h}">${l}</a>`).join('\n')}
        <a href="${listHref}">${t.section}</a>
      </div>
      <div class="footer-col">
        <h4>${t.footer.h2}</h4>
        <a href="${H}#unete">${t.join}</a>
        <a href="${H}#tu-lugar">${t.footer.collab}</a>
        <a href="mailto:info@alianzaia.org">Global AI Leaders</a>
      </div>
      <div class="footer-col">
        <h4>${t.footer.h3}</h4>
        <a href="mailto:info@alianzaia.org">info@alianzaia.org</a>
        <a href="${H}#inicio">Corporación XV</a>
      </div>
    </div>
    <div class="wrap footer-bottom">
      <nav class="footer-legal-links">
${t.footer.legal.map(([h, l]) => `        <a href="${H}${h}">${l}</a>`).join('\n')}
      </nav>
      <p class="footer-copy">${t.footer.copy}</p>
    </div>
  </footer>

  <script src="${P}vendor/gsap.min.js"></script>
  <script src="${P}vendor/ScrollTrigger.min.js"></script>
  <script src="${P}vendor/lenis.min.js"></script>
  <script src="${P}app.js"></script>
</body>
</html>
`;
}

// Tarjeta con el mismo patrón que las de Proyectos: fecha · titular + etiqueta + entradilla corta · «Leer más →».
function card(n, lang, href) {
  const x = n[lang];
  return `        <li data-reveal><a href="${href}"><span class="auth-year"><time datetime="${n.fecha}">${fecha(n.fecha, lang)}</time></span><h3>${esc(x.titulo)}<span class="proj-tag">${esc(x.etiqueta)}</span><span class="news-excerpt">${esc(x.resumen)}</span></h3><span class="auth-more">${T[lang].more}</span></a></li>`;
}

function writeFile(rel, content) {
  const f = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}

const generated = [];
for (const lang of ['es', 'en']) {
  const t = T[lang];
  const depth = t.base.split('/').length;
  const P = '../'.repeat(depth);
  // Se regenera la carpeta entera: lo que no esté en noticias.json desaparece.
  const dir = path.join(ROOT, t.base);
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    if (e.isDirectory() && !news.some((n) => n[lang].slug === e.name)) fs.rmSync(path.join(dir, e.name), { recursive: true });
  }

  // Listado
  const otherListRel = lang === 'es' ? '../en/news/' : '../../actualidad/';
  const listBody = `  <section class="hero news-hero">
    <div class="wrap">
      <span class="news-kicker">${t.section}</span>
      <h1>${t.listTitle}</h1>
      <p>${t.listDesc}</p>
    </div>
  </section>

  <main class="section news-main">
    <div class="wrap">
${data.destacado ? `      <aside class="news-faq" aria-labelledby="news-faq-q">
        <h2 id="news-faq-q">${esc(data.destacado[lang].pregunta)}</h2>
        <p>${esc(data.destacado[lang].respuesta)}</p>
      </aside>
` : ''}      <ul class="auth-list news-list">
${news.map((n) => card(n, lang, `${n[lang].slug}/`)).join('\n')}
      </ul>
    </div>
  </main>
`;
  writeFile(`${t.base}/index.html`, page({
    lang, P, title: `${t.section} · ${t.siteName}`, desc: t.listDesc, canonical: urlList(lang), type: 'website', current: 'list',
    alt: { rel: otherListRel, abs: urlList(other(lang)) }, body: listBody,
  }));
  generated.push(`${t.base}/index.html`);

  // Una página por noticia
  for (const n of news) {
    const x = n[lang];
    const o = other(lang);
    const otherRel = lang === 'es' ? `../../en/news/${n.en.slug}/` : `../../../actualidad/${n.es.slug}/`;
    const fuentes = x.fuentes.map((f) => `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.texto)}</a>`).join('<br>');
    const body = `  <section class="hero news-hero">
    <div class="wrap">
      <span class="news-kicker">${t.section} · ${esc(x.etiqueta)}</span>
      <h1 class="news-title">${esc(x.titulo)}</h1>
      <p class="news-hero-date"><time datetime="${n.fecha}">${fecha(n.fecha, lang, true)}</time></p>
    </div>
  </section>

  <main class="section news-main">
    <div class="wrap">
      <article class="news-article">
        <p class="news-lead">${esc(x.entradilla)}</p>
${x.parrafos.map((p) => `        <p>${esc(p)}</p>`).join('\n')}
${x.cierre ? `        <p class="news-disclaimer">${esc(x.cierre)}</p>\n` : ''}        <p class="news-sources"><strong>${t.sources}:</strong><br>${fuentes}</p>
        <p class="news-back"><a href="../">${t.back}</a></p>
      </article>
    </div>
  </main>
`;
    const canonical = urlItem(lang, n);
    writeFile(`${t.base}/${x.slug}/index.html`, page({
      lang, P: P + '../', title: `${x.titulo} · ${t.siteName}`, desc: x.resumen, canonical, type: 'article', published: n.fecha, current: 'item',
      alt: { rel: otherRel, abs: urlItem(o, n) }, body,
      jsonld: { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: x.titulo, description: x.resumen, datePublished: n.fecha,
        inLanguage: lang, mainEntityOfPage: canonical, image: OG_IMAGE,
        publisher: { '@type': 'Organization', name: lang === 'es' ? 'Alianza Iberoamericana de IA (AI Alliance)' : 'Ibero-American AI Alliance (AI Alliance)', url: SITE } },
    }));
    generated.push(`${t.base}/${x.slug}/index.html`);
  }

  // Bloque de la portada (3 últimas)
  const homeRel = lang === 'es' ? 'index.html' : 'en/index.html';
  const homeFile = path.join(ROOT, homeRel);
  const linkBase = lang === 'es' ? 'actualidad/' : 'news/';
  const block = `<!-- actualidad:start (generado por tools/actualidad.mjs desde noticias.json, no editar a mano) -->
  <section class="section" id="actualidad">
    <div class="wrap">
      <div class="sec-head" data-reveal>
        <span class="kicker">${t.section}</span>
        <h2 class="display" data-split>${t.homeTitle}</h2>
      </div>
      <ul class="auth-list news-list">
${news.slice(0, HOME_CARDS).map((n) => card(n, lang, `${linkBase}${n[lang].slug}/`)).join('\n')}
      </ul>
      <div style="text-align:center;margin-top:clamp(30px,4vw,44px)" data-reveal><a href="${linkBase}" class="btn btn-line" data-ai-cta="news_all">${t.all}</a></div>
    </div>
  </section>
  <!-- actualidad:end -->`;
  let home = fs.readFileSync(homeFile, 'utf8');
  const re = /<!-- actualidad:start[\s\S]*?<!-- actualidad:end -->/;
  if (!re.test(home)) throw new Error(`No encuentro los marcadores actualidad:start/end en ${homeRel}`);
  home = home.replace(re, () => block);
  if (NOINDEX && !home.includes('name="robots"')) home = home.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="robots" content="noindex,nofollow">');
  fs.writeFileSync(homeFile, home);
  generated.push(homeRel);
}

console.log(`Actualidad: ${news.length} noticias → ${ROOT}${NOINDEX ? ' (noindex)' : ''}`);
for (const g of generated) console.log('  ' + g);
