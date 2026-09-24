// The palette to add a node: every built-in and declared node type, the trees
// that can be included as a SubTree, and new node types to declare.

import { useEffect, useMemo, useRef, useState } from 'react';
import { canHaveChildren } from '../../shared/builtins';
import { findTreeByUid, locate } from '../../shared/treeOps';
import { CATEGORIES, type NodeCategory, type NodeModel } from '../../shared/types';
import { allModels, type Workspace } from '../../shared/workspace';
import { models as docModels } from '../../shared/xml';
import { addNode, declareModel, insertionPoint, wrapSelected } from '../actions';
import { ID_PATTERN, openDialog } from '../dialogs';
import { useStore } from '../store';
import { CategoryBadge } from './icons';

type Filter = 'all' | NodeCategory;

interface Item {
  key: string;
  category: NodeCategory;
  id: string;
  description?: string;
  source: string;
  subtree?: string;
}

/** The file where new node types are declared: the one that already declares the most. */
function defaultModelsFile(current: string): string {
  const { files } = useStore.getState();
  let best = current;
  let count = files[current]?.doc ? docModels(files[current].doc!).filter((m) => m.category !== 'SubTree').length : 0;
  for (const f of Object.values(files)) {
    const n = f.doc ? docModels(f.doc).filter((m) => m.category !== 'SubTree').length : 0;
    if (n > count) {
      best = f.path;
      count = n;
    }
  }
  return best;
}

function AddNode({ ws, initial, close }: { ws: Workspace; initial: Filter; close: () => void }) {
  const selection = useStore((s) => s.selection);
  const files = useStore((s) => s.files);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>(initial);
  const [active, setActive] = useState(0);
  const [wrap, setWrap] = useState(false);
  const [modelsFile, setModelsFile] = useState(() => defaultModelsFile(selection.file!));
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => input.current?.focus(), []);

  const doc = selection.file ? files[selection.file]?.doc : undefined;
  const tree = doc && selection.tree ? findTreeByUid(doc, selection.tree) : undefined;
  const selected = tree && selection.node ? locate(tree, selection.node)?.node : undefined;

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const m of allModels(ws)) {
      if (m.id === 'SubTree') continue;
      out.push({ key: `m:${m.id}`, category: m.category, id: m.id, description: m.description, source: m.builtin ? 'built-in' : m.file ?? '' });
    }
    for (const [id, refs] of ws.trees) {
      if (!id) continue;
      const description = refs[0].tree.attrs._description ?? ws.subtreeModels.get(id)?.description;
      out.push({ key: `t:${id}`, category: 'SubTree', id, description, source: refs[0].file, subtree: id });
    }
    return out;
  }, [ws]);

  const q = query.trim().toLowerCase();
  const shown = items
    .filter((i) => filter === 'all' || i.category === filter)
    .filter((i) => !q || i.id.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q))
    .sort((a, b) => {
      // Exact and prefix matches first, then by category and name.
      const rank = (i: Item) => (i.id.toLowerCase() === q ? 0 : i.id.toLowerCase().startsWith(q) ? 1 : 2);
      return rank(a) - rank(b) || CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.id.localeCompare(b.id);
    });
  const canWrap = !!selected;
  const wrapping = wrap && canWrap;
  const choices = wrapping ? shown.filter((i) => canHaveChildren(i.category)) : shown;

  useEffect(() => setActive(0), [query, filter, wrap]);
  useEffect(() => {
    list.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const where = (() => {
    if (!tree) return '';
    if (wrapping) return `Wraps ${selected!.id === 'SubTree' ? selected!.attrs.ID : selected!.id}`;
    const point = insertionPoint(ws, tree, selection.node);
    if (!point.target) return tree.children.length ? 'Added as a second root (the tree needs a single root)' : 'Added as the root of the tree';
    const target = locate(tree, point.target)?.node;
    const name = target?.id === 'SubTree' ? `SubTree ${target.attrs.ID}` : target?.id;
    return point.placement === 'inside' ? `Added as the last child of ${name}` : `Added after ${name}`;
  })();

  const choose = (item: Item) => {
    if (wrapping) wrapSelected({ id: item.id, category: item.category });
    else addNode(ws, { id: item.id, category: item.category }, item.subtree);
    close();
  };

  const create = (category: Exclude<NodeCategory, 'SubTree'>) => {
    const id = query.trim();
    declareModel(modelsFile, id, category);
    const model: Pick<NodeModel, 'id' | 'category'> = { id, category };
    if (wrapping && canHaveChildren(category)) wrapSelected(model);
    else addNode(ws, model);
    close();
  };

  const exact = items.some((i) => i.id === query.trim() && i.category !== 'SubTree');
  const canCreate = ID_PATTERN.test(query.trim()) && !exact;

  return (
    <div className="add-node" onKeyDown={(e) => {
      if (e.key === 'ArrowDown') { setActive(Math.min(active + 1, choices.length - 1)); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { setActive(Math.max(active - 1, 0)); e.preventDefault(); }
      else if (e.key === 'Enter' && choices[active]) { choose(choices[active]); e.preventDefault(); }
      else if (e.key === 'Escape') close();
    }}>
      <h2>{filter === 'SubTree' ? 'Add a SubTree' : 'Add a node'}</h2>
      <input ref={input} className="palette-search" placeholder="Search node types and trees…" value={query}
        onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
      <div className="filters" role="tablist">
        {(['all', ...CATEGORIES] as Filter[]).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'active' : ''}
            onClick={() => { setFilter(f); input.current?.focus(); }}>
            {f === 'all' ? 'All' : f}
          </button>
        ))}
      </div>
      <ul className="palette" ref={list} role="listbox">
        {choices.map((item, i) => (
          <li key={item.key} role="option" aria-selected={i === active} className={i === active ? 'active' : ''}
            onMouseEnter={() => setActive(i)} onClick={() => choose(item)}>
            <CategoryBadge category={item.category} />
            <span className="palette-id">{item.id}</span>
            <span className="palette-description">{item.description}</span>
            <span className="palette-source">{item.source}</span>
          </li>
        ))}
        {!choices.length && <li className="empty">Nothing matches “{query}”.</li>}
      </ul>
      {canCreate && filter !== 'SubTree' && (
        <div className="create-model">
          <div>
            New node type <b>{query.trim()}</b>, declared in the TreeNodesModel of{' '}
            <select value={modelsFile} onChange={(e) => setModelsFile(e.target.value)}>
              {Object.values(files).filter((f) => f.doc).map((f) => <option key={f.path} value={f.path}>{f.path}</option>)}
            </select>
          </div>
          <div className="create-buttons">
            {(['Action', 'Condition', 'Control', 'Decorator'] as const).map((c) => (
              <button key={c} onClick={() => create(c)} disabled={wrapping && !canHaveChildren(c)}>
                <CategoryBadge category={c} /> {c}
              </button>
            ))}
          </div>
        </div>
      )}
      <footer className="add-footer">
        <span className="muted">{where}</span>
        {canWrap && (
          <label className="checkbox" title="Put the selected node inside the new Control or Decorator">
            <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> Wrap the selection
          </label>
        )}
        <span className="muted small">↑↓ to choose, Enter to add</span>
      </footer>
    </div>
  );
}

export function openAddDialog(ws: Workspace, kind: 'node' | 'subtree') {
  const { selection } = useStore.getState();
  if (!selection.file || !selection.tree) return;
  openDialog((close) => <AddNode ws={ws} initial={kind === 'subtree' ? 'SubTree' : 'all'} close={close} />);
}

