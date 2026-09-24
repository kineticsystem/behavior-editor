// Runs the open tree on a BehaviorTree.ROS2 server, through rosbridge: a form
// for the payload the tree reads, then the messages of the server and the end.

import { useEffect, useRef, useState } from 'react';
import { payloadKeys, payloadText } from '../../shared/payload';
import type { Workspace } from '../../shared/workspace';
import { openDialog } from '../dialogs';
import { defaultRosbridgeUrl, type Run, type RunResult, runTree } from '../ros';
import { useSettings } from '../settings';
import { isDirty, useStore } from '../store';
import { Icon } from './icons';

type Phase = { kind: 'form' } | { kind: 'running' } | { kind: 'done'; result: RunResult };

function RunForm({ treeId, keys, close }: { treeId: string; keys: string[]; close: () => void }) {
  const settings = useSettings();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(keys.map((k) => [k, settings.payloads[treeId]?.[k] ?? ''])));
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const [feedback, setFeedback] = useState<string[]>([]);
  const run = useRef<Run>(undefined);
  const mounted = useRef(true);
  const url = settings.rosbridgeUrl.trim() || defaultRosbridgeUrl();

  // Closing the dialog leaves the tree running; its end is then shown as a toast.
  useEffect(() => () => { mounted.current = false; }, []);

  const start = async () => {
    settings.update({ payloads: { ...settings.payloads, [treeId]: values } });
    // The server runs the files on disk.
    const store = useStore.getState();
    if (Object.values(store.files).some(isDirty)) await store.saveAll();
    if (Object.values(useStore.getState().files).some(isDirty)) {
      setPhase({ kind: 'done', result: { ok: false, outcome: 'failed', message: 'Some files could not be saved, so the tree was not run.' } });
      return;
    }
    setFeedback([]);
    setPhase({ kind: 'running' });
    run.current = runTree({
      url, action: settings.runAction.trim(), tree: treeId, payload: payloadText(values),
      onFeedback: (message) => mounted.current && setFeedback((f) => [...f, message]),
    });
    const result = await run.current.result;
    run.current = undefined;
    if (mounted.current) setPhase({ kind: 'done', result });
    else useStore.getState().toast(`${treeId}: ${summary(result)}`, result.ok ? undefined : 'error');
  };

  const running = phase.kind === 'running';
  return (
    <form className="run-dialog" onSubmit={(e) => { e.preventDefault(); if (!running) void start(); }}
      onKeyDown={(e) => e.key === 'Escape' && close()}>
      <h2><Icon name="play" size={15} /> Run {treeId}</h2>
      <p className="muted small">
        Unsaved changes are saved first. The server may still run the trees it loaded when it
        started: make it reload them to run what you saved.
      </p>

      <fieldset className="bare run-payload" disabled={running}>
        {keys.length ? keys.map((key, i) => (
          <label key={key} className="field">
            <span className="field-label"><span className="port-name">@{key}</span></span>
            <input className="mono" autoFocus={i === 0} value={values[key]} spellCheck={false}
              placeholder="YAML, e.g. 3.0 or [a, b]"
              onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
          </label>
        )) : <p className="muted">This tree reads no payload.</p>}
      </fieldset>

      <details className="run-connection">
        <summary>Connection: {url} · {settings.runAction}</summary>
        <fieldset className="bare" disabled={running}>
          <label className="field">
            <span>rosbridge URL</span>
            <input className="mono" value={settings.rosbridgeUrl} placeholder={defaultRosbridgeUrl()} spellCheck={false}
              onChange={(e) => settings.update({ rosbridgeUrl: e.target.value })} />
          </label>
          <label className="field">
            <span>Action</span>
            <input className="mono" value={settings.runAction} spellCheck={false}
              onChange={(e) => settings.update({ runAction: e.target.value })} />
            <small>The ExecuteTree action of the server; BehaviorTree.ROS2's default is bt_execution.</small>
          </label>
        </fieldset>
      </details>

      {phase.kind !== 'form' && (
        <div className="run-output" role="status">
          {running && <div className="run-state">Running…</div>}
          {phase.kind === 'done' && (
            <div className={`run-state ${phase.result.ok ? 'ok' : 'failed'}`}>{summary(phase.result)}</div>
          )}
          {!!feedback.length && <ul className="run-feedback mono">{feedback.map((f, i) => <li key={i}>{f}</li>)}</ul>}
          {phase.kind === 'done' && phase.result.message && <pre className="run-message">{phase.result.message}</pre>}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" onClick={close}>{running ? 'Hide' : 'Close'}</button>
        {running
          ? <button type="button" className="danger" onClick={() => run.current?.cancel()}>Stop</button>
          : <button type="submit" className="primary"><Icon name="play" size={14} /> {phase.kind === 'done' ? 'Run again' : 'Run'}</button>}
      </div>
    </form>
  );
}

function summary(r: RunResult): string {
  if (r.outcome === 'failed') return 'Could not run the tree';
  if (r.outcome === 'canceled') return 'Stopped';
  if (r.ok) return 'Succeeded';
  if (r.outcome === 'aborted') return r.treeStatus === 'FAILURE' ? 'The tree failed' : 'Aborted';
  return `The tree returned ${r.treeStatus ?? 'no status'}`;
}

export function openRunDialog(ws: Workspace, treeId: string) {
  const keys = payloadKeys(ws, treeId);
  openDialog((close) => <RunForm treeId={treeId} keys={keys} close={close} />);
}
