// Builds the site: wraps each src/pages/*.html in src/layout.html, fills in
// {{> partial}} includes, and writes plain HTML to site/ ready to upload.
// Run with: node build.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The live address, with no trailing slash. Used for canonical links, sitemap.xml and robots.txt.
// Leave empty ('') to build without them.
const SITE_URL = 'https://virush007.github.io/poplar-dental-sparkhill';
// The folder the site is served from. Use '' once a custom domain points at it.
const BASE_PATH = '/poplar-dental-sparkhill';

const root = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const partials = Object.fromEntries(
  readdirSync(join(root, 'src/partials'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f.replace(/\.html$/, ''), read(`src/partials/${f}`)])
);

const includePartials = (html) =>
  html.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
    if (!(name in partials)) throw new Error(`Unknown partial: ${name}`);
    return includePartials(partials[name]);
  });

const layout = includePartials(read('src/layout.html'));
const out = join(root, 'site');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'assets'), join(out, 'assets'), { recursive: true });
// Files in static/ (such as Netlify's _headers) go to the root of the site as they are.
if (existsSync(join(root, 'static'))) cpSync(join(root, 'static'), out, { recursive: true });
// The n8n chat assistant reads the knowledge base from the live site on every message.
const knowledgeBase = join(root, 'knowledge-base', 'poplar-dental-knowledge-base.md');
if (existsSync(knowledgeBase)) cpSync(knowledgeBase, join(out, 'knowledge-base.md'));

const pages = readdirSync(join(root, 'src/pages')).filter((f) => f.endsWith('.html'));
const pageUrl = (file) => `${SITE_URL}/${file === 'index.html' ? '' : file}`;
const indexable = [];

for (const file of pages) {
  const source = read(`src/pages/${file}`);
  // Each page starts with a settings comment, for example:
  // <!-- {"title": "...", "description": "...", "nav": "treatments", "noindex": true, "rootRelative": true} -->
  const settings = source.match(/^<!--\s*(\{[\s\S]*?\})\s*-->\s*/);
  if (!settings) throw new Error(`${file} is missing its settings comment`);
  const meta = JSON.parse(settings[1]);
  const body = includePartials(source.slice(settings[0].length));
  const canonical = SITE_URL && !meta.noindex ? `<link rel="canonical" href="${pageUrl(file)}">` : '';
  const robots = meta.noindex ? '<meta name="robots" content="noindex">' : '';

  let html = layout
    .replaceAll('{{title}}', () => meta.title)
    .replaceAll('{{description}}', () => meta.description)
    .replace('{{canonical}}', () => canonical)
    .replace('{{robots}}', () => robots)
    .replace('{{content}}', () => body);
  if (meta.nav) html = html.replaceAll(`data-nav="${meta.nav}"`, `data-nav="${meta.nav}" aria-current="page"`);
  // Pages that can be served at any URL depth (like 404) need links that start from the site root.
  if (meta.rootRelative) html = html.replace(/\b(href|src)="(?![a-z]+:|#|\/)/g, `$1="${BASE_PATH}/`);
  writeFileSync(join(out, file), html);
  if (!meta.noindex) indexable.push(file);
}

if (SITE_URL) {
  const urls = indexable.map((f) => `  <url><loc>${pageUrl(f)}</loc></url>`).join('\n');
  writeFileSync(
    join(out, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );
  writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
}

console.log(`Built ${pages.length} pages into site/`);
