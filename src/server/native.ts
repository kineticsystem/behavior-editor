// Runs the native validator (validator/, built by bin/build.sh), which loads
// the behaviors with BehaviorTree.CPP itself.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_MODELS } from '../shared/builtins';
import type { Issue, NodeModel } from '../shared/types';
import { buildWorkspace } from '../shared/workspace';
import { parseDocument } from '../shared/xml';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function nativeValidatorPath(): string | undefined {
  const path = process.env.BTCPP_VALIDATOR ?? join(REPO, 'build/validator/btcpp_validate');
  return existsSync(path) ? path : undefined;
}

function run(binary: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((done) => {
    execFile(binary, args, { maxBuffer: 16 * 1024 * 1024, timeout: 60_000 }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : 2) : 0;
      done({ code, stdout, stderr });
    });
  });
}

/**
 * The built-in node models as reported by the installed BehaviorTree.CPP, with
 * the descriptions and port order of the fallback list where they match.
 */
export async function nativeBuiltins(): Promise<NodeModel[] | undefined> {
  const binary = nativeValidatorPath();
  if (!binary) return undefined;
  const { code, stdout } = await run(binary, ['--builtins']);
  if (code !== 0) return undefined;
  const reported = JSON.parse(stdout) as NodeModel[];
  const known = new Map(BUILTIN_MODELS.map((m) => [m.id, m]));
  return reported.map((m) => {
    const fallback = known.get(m.id);
    const order = fallback?.ports.map((p) => p.name) ?? [];
    const rank = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length);
    const ports = m.ports
      .map((p) => ({ ...p, description: p.description ?? fallback?.ports.find((f) => f.name === p.name)?.description }))
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, 'en', { numeric: true }));
    return { ...m, ports, description: fallback?.description, builtin: true };
  });
}

export interface NativeResult {
  available: boolean;
  issues: Issue[];
  /** Anything the validator printed that is not a finding, e.g. a crash. */
  output?: string;
}

/**
 * Validates the given file contents, which may differ from what is on disk,
 * by mirroring them into a temporary folder.
 */
export async function validateNative(files: { path: string; content: string }[]): Promise<NativeResult> {
  const binary = nativeValidatorPath();
  if (!binary) return { available: false, issues: [] };

  const dir = await mkdtemp(join(tmpdir(), 'btcpp-validate-'));
  try {
    const paths = new Map<string, string>();
    for (const f of files) {
      const target = join(dir, 'files', f.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, f.content);
      paths.set(target, f.path);
    }
    // The models come from the editor's parser: the library has no API to
    // read a TreeNodesModel.
    const parsed = files.map((f) => ({ path: f.path, ...parseDocument(f.content) }));
    const models = [...buildWorkspace(parsed).models.values()].map((m) => ({
      id: m.id, category: m.category, ports: m.ports,
    }));
    const manifest = join(dir, 'manifest.json');
    await writeFile(manifest, JSON.stringify({ files: [...paths.keys()], models }));

    const { code, stdout, stderr } = await run(binary, [manifest]);
    const issues: Issue[] = [];
    const other: string[] = [];
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as { level: string; file: string; tree?: string; message: string };
        issues.push({
          severity: r.level === 'error' ? 'error' : 'warning',
          file: paths.get(r.file) ?? r.file,
          tree: r.tree,
          message: r.message.replaceAll(dir + '/files/', ''),
          source: 'btcpp',
        });
      } catch {
        other.push(line);
      }
    }
    if (stderr.trim()) other.push(stderr.trim());
    if (code > 1) other.push(`The validator exited with code ${code}`);
    return { available: true, issues, output: other.length ? other.join('\n') : undefined };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
