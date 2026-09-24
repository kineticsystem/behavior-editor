// Validates a folder of behaviors from the command line, for scripts and CI.
//
//   validate.sh [folder] [--json] [--editor-only]
//
// Runs the editor's checks, then BehaviorTree.CPP's own (the native validator)
// when it is built. Exits with 1 when any error is found.

import { resolve } from 'node:path';
import { behaviorsRoot, listXmlFiles, readBehaviorFiles } from '../server/api';
import { nativeBuiltins, validateNative } from '../server/native';
import type { Issue } from '../shared/types';
import { validateFiles } from '../shared/validate';
import { parseDocument } from '../shared/xml';

const args = process.argv.slice(2);
const json = args.includes('--json');
const editorOnly = args.includes('--editor-only');
const folder = args.find((a) => !a.startsWith('--'));
const root = folder ? resolve(folder) : behaviorsRoot();

const files = await readBehaviorFiles(root, await listXmlFiles(root));
const paths = files.map((f) => f.path);
const parsed = files.map((f) => ({ path: f.path, ...parseDocument(f.content) }));

const issues: Issue[] = validateFiles(parsed, (editorOnly ? undefined : await nativeBuiltins()) ?? undefined);
let nativeRan = false;
if (!editorOnly) {
  const native = await validateNative(files);
  nativeRan = native.available;
  issues.push(...native.issues);
  if (native.output) console.error(native.output);
}

const errors = issues.filter((i) => i.severity === 'error').length;
const warnings = issues.filter((i) => i.severity === 'warning').length;

if (json) {
  console.log(JSON.stringify({ root, files: paths, issues }, null, 2));
} else {
  const color = process.stdout.isTTY;
  const paint = (code: number, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const sorted = [...issues].sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
  for (const i of sorted) {
    const where = `${i.file}${i.line ? `:${i.line}` : ''}`;
    const level = i.severity === 'error' ? paint(31, 'error') : paint(33, i.severity);
    const tree = i.tree ? ` [${i.tree}]` : '';
    const source = i.source === 'btcpp' ? paint(2, ' (BehaviorTree.CPP)') : '';
    console.log(`${where}: ${level}${tree} ${i.message}${source}`);
  }
  console.log(`\n${paths.length} files in ${root}: ${errors} errors, ${warnings} warnings.`);
  if (!editorOnly && !nativeRan) console.log('The BehaviorTree.CPP validator is not built (run build.sh): only the editor checks ran.');
}

process.exit(errors ? 1 : 0);
