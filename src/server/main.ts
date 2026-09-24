// The production server: the API plus the editor built by `vite build`.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { behaviorsRoot, createApi } from './api';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

if (!existsSync(join(DIST, 'index.html'))) {
  console.error(`The editor is not built: ${DIST}/index.html is missing. Run build.sh first.`);
  process.exit(1);
}

const root = behaviorsRoot();
const api = createApi(root);

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    void api(req, res);
    return;
  }
  let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST + sep) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(DIST, 'index.html');
  }
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
}).listen(PORT, HOST, () => {
  // In the container, the port published on the host may differ.
  console.log(`Behavior editor on http://localhost:${process.env.EDITOR_PORT ?? PORT}`);
  console.log(`Behaviors folder: ${root}`);
});
