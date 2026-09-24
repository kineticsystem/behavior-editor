import { useEffect } from 'react';
import { redo, save, undo } from './actions';
import { Browser } from './components/Browser';
import { Inspector } from './components/Inspector';
import { Splitter, useStoredSize } from './components/Splitter';
import { TreeEditor } from './components/TreeEditor';
import { DialogHost, useDialog } from './dialogs';
import { useAnalysis } from './hooks';
import { isDirty, useStore } from './store';

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.message}</div>)}
    </div>
  );
}

export function App() {
  const loading = useStore((s) => s.loading);
  const loadError = useStore((s) => s.loadError);
  const analysis = useAnalysis();
  const [left, setLeft] = useStoredSize('be.left', 270);
  const [right, setRight] = useStoredSize('be.right', 360);

  useEffect(() => {
    void useStore.getState().load();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useDialog.getState().content) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const inField = (e.target as HTMLElement).closest?.('input, textarea, select');
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        if (e.shiftKey) void useStore.getState().saveAll();
        else save();
      } else if (!inField && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (!inField && key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (Object.values(useStore.getState().files).some(isDirty)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  if (loadError) {
    return (
      <div className="fatal">
        <h1>Cannot load the behaviors</h1>
        <p>{loadError}</p>
        <button onClick={() => void useStore.getState().load()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="app" style={{ gridTemplateColumns: `${left}px 4px minmax(360px, 1fr) 4px ${right}px` }}>
      <Browser />
      <Splitter direction="columns" label="Resize the workspace panel" value={left} onChange={setLeft} grow={1} min={200} max={640} />
      {loading && !Object.keys(useStore.getState().files).length
        ? <main className="panel placeholder">Loading…</main>
        : <TreeEditor analysis={analysis} />}
      <Splitter direction="columns" label="Resize the details panel" value={right} onChange={setRight} grow={-1} min={240} max={720} />
      <Inspector analysis={analysis} />
      <DialogHost />
      <Toasts />
    </div>
  );
}
