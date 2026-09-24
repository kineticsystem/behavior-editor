// The HTTP API over the folder of behaviors. It is a connect-style middleware
// so that the Vite development server and the production server share it.
//
//   GET    /api/workspace         The folder, its XML files and their contents
//   PUT    /api/file?path=a.xml   Create or overwrite a file (body: the XML)
//   DELETE /api/file?path=a.xml   Delete a file
//   POST   /api/validate          Validate with BehaviorTree.CPP
//                                 (body: {files: [{path, content}]})

import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NodeModel } from '../shared/types';
import { isBehaviorFile } from '../shared/xml';
import { nativeBuiltins, nativeValidatorPath, validateNative } from './native';

export interface WorkspaceFile {
  path: string;
  content: string;
}

export interface WorkspaceResponse {
  root: string;
  files: WorkspaceFile[];
  /** Built-in models from the installed BehaviorTree.CPP, when available. */
  builtins?: NodeModel[];
  nativeValidator: boolean;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Resolves a path relative to the root, refusing anything outside it. */
export function safePath(root: string, path: string | null): string {
  if (!path) throw new HttpError(400, 'Missing path');
  if (isAbsolute(path) || path.includes('\0')) throw new HttpError(400, 'The path must be relative');
  if (!path.toLowerCase().endsWith('.xml')) throw new HttpError(400, 'Only .xml files can be written');
  const full = resolve(root, path);
  if (!full.startsWith(resolve(root) + sep)) throw new HttpError(400, 'The path is outside the behaviors folder');
  return full;
}

export async function listXmlFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.xml')) out.push(relative(root, full).split(sep).join('/'));
    }
  }
  await walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}

/** Reads the files, leaving out the XML files that are not behaviors. */
export async function readBehaviorFiles(root: string, paths: string[]): Promise<WorkspaceFile[]> {
  const files = await Promise.all(paths.map(async (path) => ({ path, content: await readFile(join(root, path), 'utf8') })));
  return files.filter((f) => isBehaviorFile(f.content));
}

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export function createApi(root: string) {
  let builtins: Promise<NodeModel[] | undefined> | undefined;

  return async function api(req: IncomingMessage, res: ServerResponse, next?: () => void) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      if (next) next();
      else send(res, 404, { error: 'Not found' });
      return;
    }
    try {
      const route = `${req.method} ${url.pathname}`;
      if (route === 'GET /api/workspace') {
        builtins ??= nativeBuiltins().catch(() => undefined);
        const paths = await listXmlFiles(root);
        const files = await readBehaviorFiles(root, paths);
        const response: WorkspaceResponse = {
          root, files, builtins: await builtins, nativeValidator: !!nativeValidatorPath(),
        };
        send(res, 200, response);
      } else if (route === 'PUT /api/file') {
        const full = safePath(root, url.searchParams.get('path'));
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, await body(req));
        send(res, 200, { ok: true });
      } else if (route === 'DELETE /api/file') {
        await rm(safePath(root, url.searchParams.get('path')));
        send(res, 200, { ok: true });
      } else if (route === 'POST /api/validate') {
        const { files } = JSON.parse(await body(req)) as { files: WorkspaceFile[] };
        for (const f of files) safePath(root, f.path);
        send(res, 200, await validateNative(files));
      } else {
        send(res, 404, { error: `No route ${route}` });
      }
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      send(res, status, { error: e instanceof Error ? e.message : String(e) });
    }
  };
}

export function behaviorsRoot(): string {
  return resolve(process.env.BEHAVIORS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '../../behaviors'));
}
