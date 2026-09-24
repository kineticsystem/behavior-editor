import { useMemo } from 'react';
import type { BehaviorTreeDef, BTNode, Issue } from '../shared/types';
import { findTreeByUid, locate } from '../shared/treeOps';
import { validateWorkspace } from '../shared/validate';
import { buildWorkspace, type Workspace } from '../shared/workspace';
import { type FileState, useStore } from './store';

export interface Analysis {
  ws: Workspace;
  issues: Issue[];
  byNode: Map<string, Issue[]>;
  byFile: Map<string, Issue[]>;
}

function group(issues: Issue[], key: (i: Issue) => string | undefined): Map<string, Issue[]> {
  const out = new Map<string, Issue[]>();
  for (const i of issues) {
    const k = key(i);
    if (k === undefined) continue;
    const list = out.get(k) ?? [];
    list.push(i);
    out.set(k, list);
  }
  return out;
}

/** The workspace index and the editor's checks, recomputed on every edit. */
export function useAnalysis(): Analysis {
  const files = useStore((s) => s.files);
  const builtins = useStore((s) => s.builtins);
  return useMemo(() => {
    const ws = buildWorkspace(Object.values(files).map((f) => ({ path: f.path, doc: f.doc, error: f.error })), builtins);
    const issues = validateWorkspace(ws);
    return { ws, issues, byNode: group(issues, (i) => i.nodeUid), byFile: group(issues, (i) => i.file) };
  }, [files, builtins]);
}

export interface Current {
  file?: FileState;
  tree?: BehaviorTreeDef;
  node?: BTNode;
}

export function useCurrent(): Current {
  const selection = useStore((s) => s.selection);
  const file = useStore((s) => (selection.file ? s.files[selection.file] : undefined));
  const tree = file?.doc && selection.tree ? findTreeByUid(file.doc, selection.tree) : undefined;
  const node = tree && selection.node ? locate(tree, selection.node)?.node : undefined;
  return { file, tree, node };
}

export function countBySeverity(issues: Issue[] | undefined) {
  let errors = 0;
  let warnings = 0;
  for (const i of issues ?? []) {
    if (i.severity === 'error') errors++;
    else if (i.severity === 'warning') warnings++;
  }
  return { errors, warnings };
}
