import { useMemo } from 'react';
import type { Issue } from '../shared/types';
import { validateWorkspace } from '../shared/validate';
import { buildWorkspace, type Workspace } from '../shared/workspace';
import { useStore } from './store';

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

/**
 * The workspace index and the editor's checks, recomputed on every edit. The
 * App calls it once and passes the result down: each call memoizes on its own.
 */
export function useAnalysis(): Analysis {
  const files = useStore((s) => s.files);
  const builtins = useStore((s) => s.builtins);
  return useMemo(() => {
    const ws = buildWorkspace(Object.values(files).map((f) => ({ path: f.path, doc: f.doc, error: f.error })), builtins);
    const issues = validateWorkspace(ws);
    return { ws, issues, byNode: group(issues, (i) => i.nodeUid), byFile: group(issues, (i) => i.file) };
  }, [files, builtins]);
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
