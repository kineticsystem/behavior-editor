// The folder of behaviors on disk: finding, reading and fingerprinting its
// files. Shared by the HTTP API and the command line validator.

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBehaviorFile } from '../shared/xml';

export interface WorkspaceFile {
  path: string;
  content: string;
}

/** A file as the server read it, with the ETag of its content. */
export interface StoredFile extends WorkspaceFile {
  etag: string;
}

/** Folders never searched for behaviors. */
export function isIgnoredFolder(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules';
}

export function isXmlFile(name: string): boolean {
  return name.toLowerCase().endsWith('.xml');
}

/**
 * The ETag of a file's content: a strong validator that changes whenever the
 * content does, sent back in If-Match to save only over the version we read.
 */
export function etagOf(content: string | Buffer): string {
  return `"${createHash('sha256').update(content).digest('base64url')}"`;
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
      if (isIgnoredFolder(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && isXmlFile(e.name)) out.push(relative(root, full).split(sep).join('/'));
    }
  }
  await walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}

/** Reads the files, leaving out the XML files that are not behaviors. */
export async function readBehaviorFiles(root: string, paths: string[]): Promise<StoredFile[]> {
  const files = await Promise.all(paths.map(async (path) => {
    const content = await readFile(join(root, path), 'utf8');
    return { path, content, etag: etagOf(content) };
  }));
  return files.filter((f) => isBehaviorFile(f.content));
}

/** The folder of behaviors to open first: BEHAVIORS_DIR, or the examples of the repo. */
export function behaviorsRoot(): string {
  return resolve(process.env.BEHAVIORS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '../../behaviors'));
}
