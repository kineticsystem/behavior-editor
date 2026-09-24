// Chooses another folder of behaviors. The browser cannot give the path of a
// folder on disk, so the server lists the folders instead.

import { useEffect, useState } from 'react';
import type { FoldersResponse } from '../../server/api';
import { api } from '../api';
import { confirm, openDialog } from '../dialogs';
import { isDirty, useStore } from '../store';
import { Icon } from './icons';

function FolderDialog(props: { start: string; close: () => void }) {
  const [listing, setListing] = useState<FoldersResponse>();
  const [typed, setTyped] = useState(props.start);
  const [error, setError] = useState<string>();

  const go = async (path: string) => {
    try {
      const next = await api.folders(path);
      setListing(next);
      setTyped(next.path);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => void go(props.start), [props.start]);

  const join = (name: string) => (listing!.path.endsWith('/') ? listing!.path : listing!.path + '/') + name;
  const open = async () => {
    if (!listing) return;
    const dirty = Object.values(useStore.getState().files).filter(isDirty).map((f) => f.path);
    if (dirty.length && !await confirm('Discard unsaved changes?',
      <>These files have unsaved changes, which will be lost: {dirty.join(', ')}.</>, 'Discard and open')) return;
    props.close();
    await useStore.getState().openFolder(listing.path);
  };

  return (
    <form className="folder-dialog" onSubmit={(e) => { e.preventDefault(); void go(typed); }}
      onKeyDown={(e) => e.key === 'Escape' && props.close()}>
      <h2>Open a folder of behaviors</h2>
      <label className="field">
        <input value={typed} onChange={(e) => setTyped(e.target.value)} spellCheck={false} autoFocus
          placeholder="/home/me/robot/behaviors" />
        {error ? <small className="field-error">{error}</small>
          : <small>Type a path and press Enter, or click the folders below. Sub-folders are included.</small>}
      </label>
      <ul className="palette folder-list">
        {listing?.parent && (
          <li onClick={() => void go(listing.parent!)}><Icon name="up" size={14} /> <span>..</span></li>
        )}
        {listing?.folders.map((name) => (
          <li key={name} onClick={() => void go(join(name))}><Icon name="folder" size={14} /> <span>{name}</span></li>
        ))}
        {listing && !listing.folders.length && <li className="empty">No sub-folders</li>}
      </ul>
      <div className="modal-actions">
        <span className="muted folder-count">
          {listing && `${listing.xmlFiles} XML file${listing.xmlFiles === 1 ? '' : 's'} in this folder`}
        </span>
        <button type="button" onClick={props.close}>Cancel</button>
        <button type="button" className="primary" disabled={!listing} onClick={() => void open()}>Open</button>
      </div>
    </form>
  );
}

export function openFolderDialog() {
  const start = useStore.getState().root;
  openDialog((close) => <FolderDialog start={start} close={close} />);
}
