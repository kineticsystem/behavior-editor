// The list of issues found by the editor's checks and, on demand, by
// BehaviorTree.CPP itself. Click an issue to select the offending node.

import { useState } from 'react';
import type { Issue } from '../../shared/types';
import { trees } from '../../shared/xml';
import { type Analysis, countBySeverity } from '../hooks';
import { useStore, workspaceFingerprint } from '../store';
import { Icon, SeverityIcon } from './icons';

export function Problems({ analysis, open, height, onToggle }: {
  analysis: Analysis;
  open: boolean;
  /** The height when open, set by the handle above it. */
  height: number;
  onToggle: () => void;
}) {
  const selection = useStore((s) => s.selection);
  const files = useStore((s) => s.files);
  const native = useStore((s) => s.native);
  const nativeAvailable = useStore((s) => s.nativeAvailable);
  const [scope, setScope] = useState<'file' | 'all'>('all');

  const stale = native.result && native.checked !== workspaceFingerprint(files);
  const all: Issue[] = [...analysis.issues, ...(native.result?.issues ?? [])];
  const shown = (scope === 'file' ? all.filter((i) => i.file === selection.file) : all)
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
  const { errors, warnings } = countBySeverity(all);

  const reveal = (i: Issue) => {
    const s = useStore.getState();
    const doc = s.files[i.file]?.doc;
    if (!doc) {
      s.select({ file: i.file });
      return;
    }
    const tree = trees(doc).find((t) => t.id === i.tree) ?? trees(doc)[0];
    s.select({ file: i.file, tree: tree?.uid, node: i.nodeUid });
  };

  return (
    <section className={`problems ${open ? 'open' : ''}`} style={open ? { height } : undefined}>
      <header className="problems-header">
        <button className="problems-toggle" onClick={onToggle} aria-expanded={open}>
          <Icon name="chevron" size={12} className={open ? 'rotate' : ''} />
          <b>Problems</b>
          {errors === 0 && warnings === 0
            ? <span className="ok"><Icon name="check" size={14} /> No problems</span>
            : <span className="muted">{errors} {errors === 1 ? 'error' : 'errors'}, {warnings} {warnings === 1 ? 'warning' : 'warnings'}</span>}
        </button>
        <span className="row-spacer" />
        {open && (
          <div className="segmented">
            <button className={scope === 'file' ? 'active' : ''} onClick={() => setScope('file')}>This file</button>
            <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>All files</button>
          </div>
        )}
        <button
          className="native-button"
          disabled={!nativeAvailable || native.running}
          title={nativeAvailable
            ? 'Load every behavior with BehaviorTree.CPP, including unsaved edits, and report what it refuses'
            : 'The BehaviorTree.CPP validator is not built: run build.sh in the container'}
          onClick={() => void useStore.getState().runNative()}
        >
          <Icon name="play" size={12} /> {native.running ? 'Checking…' : 'Check with BehaviorTree.CPP'}
        </button>
      </header>
      {open && (
        <div className="problems-body">
          {native.error && <div className="issue issue-error">The BehaviorTree.CPP check failed: {native.error}</div>}
          {native.result && (
            <div className={`native-status ${native.result.issues.length ? 'bad' : 'good'}`}>
              {native.result.issues.length
                ? `BehaviorTree.CPP refused ${native.result.issues.length} ${native.result.issues.length === 1 ? 'tree' : 'trees'}`
                : 'BehaviorTree.CPP loaded and instantiated every tree.'}
              {stale && <span className="muted"> — the files changed since this check.</span>}
              {native.result.output && <pre>{native.result.output}</pre>}
            </div>
          )}
          <ul className="issue-table">
            {shown.map((i, n) => (
              <li key={n} className={`issue issue-${i.severity}`} onClick={() => reveal(i)}>
                <SeverityIcon severity={i.severity} />
                <span className="issue-message">
                  {i.message}
                  {i.source === 'btcpp' && <span className="source-tag">BehaviorTree.CPP</span>}
                </span>
                <span className="issue-where">{i.tree && <>{i.tree} · </>}{i.file}{i.line ? `:${i.line}` : ''}</span>
              </li>
            ))}
            {!shown.length && <li className="muted empty">Nothing to report{scope === 'file' ? ' in this file' : ''}.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
