// Builds the site, then serves site/ locally for previewing.
// Run with: node serve.mjs [port]   (default port 4321)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./build.mjs');

const dir = join(dirname(fileURLToPath(import.meta.url)), 'site');
const port = Number(process.argv[2]) || 4321;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  if (req.method === 'POST') {
    // Stand-in for Netlify Forms during local previews: print the submission, send it nowhere.
    let body = '';
    for await (const chunk of req) body += chunk;
    const fields = Object.fromEntries(new URLSearchParams(body));
    delete fields['bot-field'];
    console.log('Form submission (local preview only, not sent):', fields);
  }
  let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(dir, path));
  if (!file.startsWith(dir)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    try {
      const page = await readFile(join(dir, '404.html'));
      res.writeHead(404, { 'Content-Type': types['.html'] }).end(page);
    } catch {
      res.writeHead(404).end('Not found');
    }
  }
}).listen(port, () => console.log(`Previewing site/ at http://localhost:${port}`));
