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

const server = createServer((req, res) => {
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
  // In the container, EDITOR_PORT is the host port that docker publishes as the
  // container's port 8080: any other port is unreachable from the host.
  const published = process.env.EDITOR_PORT;
  if (!published) {
    console.log(`Behavior editor on http://localhost:${PORT}`);
  } else if (PORT === 8080) {
    console.log(`Behavior editor on http://localhost:${published}`);
  } else {
    console.warn(`Listening on port ${PORT} of the container, which docker does not publish.`);
    console.warn('To change the port, start the container with EDITOR_PORT=<port> ./docker/dock.sh ...');
  }
  console.log(`Behaviors folder: ${root}`);
});

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`Port ${PORT} is already in use. Choose another one with PORT=<port>.`);
  process.exit(1);
});
