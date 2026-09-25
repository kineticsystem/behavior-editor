// The left panel: the behavior files of the folder and the trees in each.

import { useState } from 'react';
import { fileNameFor, filePathError, idError } from '../../shared/ids';
import { CATEGORIES, isNodeTypeCategory, type NodeModel } from '../../shared/types';
import { customModels, usageCount } from '../../shared/workspace';
import { models, trees } from '../../shared/xml';
import { treeIds } from '../actions';
import { confirm, prompt } from '../dialogs';
import { MODEL_MIME, setDraggedModel } from '../dnd';
import { type Analysis, countBySeverity } from '../hooks';
import { type FileState, isDirty, useStore } from '../store';
import { openFolderDialog } from './FolderDialog';
import { CategoryBadge, Counts, Icon } from './icons';
import { SettingsMenu } from './SettingsMenu';
import { Splitter, useStoredSize } from './Splitter';

export async function newBehaviorFile() {
  const { files, createFile } = useStore.getState();
  const existing = treeIds();
  const values = await prompt('New objective', [
    {
      name: 'tree', label: 'Tree ID', placeholder: 'PickObject',
      hint: 'The ID other behaviors use to include it as a SubTree',
      validate: (v) => idError(v, existing),
    },
    {
      name: 'file', label: 'File', placeholder: 'defaults to the tree ID, e.g. pick_object.xml',
      hint: 'Relative to the behaviors folder; may include sub-folders',
      validate: (v, all) => filePathError(fileNameFor(v, all.tree), Object.keys(files)),
    },
  ], 'Create');
  if (values) createFile(fileNameFor(values.file, values.tree), values.tree);
}

type SectionId = 'objectives' | 'behaviors' | 'builtins';
const SECTIONS: SectionId[] = ['objectives', 'behaviors', 'builtins'];

/** Files shown under Objectives: all but those that only declare node types. */
function isObjectiveFile(f: FileState): boolean {
  return !f.doc || trees(f.doc).length > 0 || models(f.doc).length === 0;
}

function SearchBox({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="search">
      <Icon name="search" size={14} />
      <input placeholder={placeholder} aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')} />
      {value && (
        <button className="icon-button" title="Clear the filter" onClick={() => onChange('')}><Icon name="close" size={12} /></button>
      )}
    </div>
  );
}

/** A node type that can be clicked to see it, or dragged onto the tree to add it. */
function NodeTypeRow({ model, uses, active }: { model: NodeModel; uses: number; active: boolean }) {
  return (
    <li className={`behavior-row ${active ? 'active' : ''}`}
      title={`${model.description ? `${model.description}\n` : ''}Drag it onto the tree to add it`}
      onClick={() => useStore.getState().setFocusModel(model.id)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData(MODEL_MIME, model.id);
        e.dataTransfer.setData('text/plain', model.id);
        setDraggedModel(model.id);
      }}
      onDragEnd={() => setDraggedModel(undefined)}>
      <CategoryBadge category={model.category} />
      <span className="file-name">{model.id}</span>
      {uses > 0 && <span className="uses">{uses}×</span>}
      {uses === 0 && !model.builtin && <span className="uses unused">unused</span>}
    </li>
  );
}

function SectionHeader({ title, count, open, onToggle, children }: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-header">
      <button className="section-toggle" onClick={onToggle} aria-expanded={open}>
        <Icon name="chevron" size={12} className={open ? 'rotate' : ''} />
        <span>{title}</span>
        <span className="section-count">{count}</span>
      </button>
      {children}
    </div>
  );
}

export function Browser({ analysis }: { analysis: Analysis }) {
  const files = useStore((s) => s.files);
  const root = useStore((s) => s.root);
  const selection = useStore((s) => s.selection);
  const focusModel = useStore((s) => s.focusModel);
  const { ws, byFile } = analysis;
  const [objectivesFilter, setObjectivesFilter] = useState('');
  const [behaviorsFilter, setBehaviorsFilter] = useState('');
  const [builtinsFilter, setBuiltinsFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sections, setSections] = useState<Record<SectionId, boolean>>({ objectives: true, behaviors: true, builtins: true });
  const [behaviorsHeight, setBehaviorsHeight] = useStoredSize('be.behaviors', 200);
  const [builtinsHeight, setBuiltinsHeight] = useStoredSize('be.builtins', 220);
  const toggle = (id: SectionId) => setSections({ ...sections, [id]: !sections[id] });

  // The first open section fills the panel; every other open section has its
  // own height, set by the handle above it.
  const filler = SECTIONS.find((id) => sections[id]);
  const fixed = (id: SectionId) => sections[id] && id !== filler;
  const heights: Record<'behaviors' | 'builtins', [number, (v: number) => void]> = {
    behaviors: [behaviorsHeight, setBehaviorsHeight],
    builtins: [builtinsHeight, setBuiltinsHeight],
  };
  const layout = (id: SectionId) => ({
    className: `browser-section ${id} ${sections[id] ? 'open' : ''} ${id === filler ? 'fill' : ''} ${fixed(id) ? 'fixed' : ''}`,
    style: fixed(id) && id !== 'objectives' ? { height: heights[id][0] } : undefined,
  });
  /** The handle above a section with its own height; it leaves room for the rest of the panel. */
  const handle = (id: 'behaviors' | 'builtins', label: string) => {
    if (!fixed(id)) return null;
    const other = id === 'behaviors' ? 'builtins' : 'behaviors';
    const reserve = 250 + (fixed(other) ? heights[other][0] : 36);
    return <Splitter direction="rows" label={label} value={heights[id][0]} onChange={heights[id][1]} grow={-1} min={70} reserve={reserve} />;
  };

  const query = objectivesFilter.trim().toLowerCase();
  const behaviorsQuery = behaviorsFilter.trim().toLowerCase();
  const paths = Object.keys(files).filter((p) => isObjectiveFile(files[p])).sort((a, b) => a.localeCompare(b));
  const behaviors = customModels(ws);
  const shownBehaviors = behaviorsQuery ? behaviors.filter((m) => m.id.toLowerCase().includes(behaviorsQuery)) : behaviors;
  const builtins = [...ws.builtins.values()].filter((m) => m.category !== 'SubTree');
  const builtinsQuery = builtinsFilter.trim().toLowerCase();
  const shownBuiltins = builtinsQuery ? builtins.filter((m) => m.id.toLowerCase().includes(builtinsQuery)) : builtins;
  const usage = new Map([...behaviors, ...builtins].map((m) => [m.id, usageCount(ws, m.id)]));

  return (
    <aside className="panel browser">
      <header className="panel-header">
        <h1 title={root}>Workspace</h1>
        <div className="panel-actions">
          <button className="icon-button" title="Reload the folder (keeps unsaved edits)"
            onClick={() => void useStore.getState().load()}>
            <Icon name="refresh" />
          </button>
          <SettingsMenu />
        </div>
      </header>
      <button className="root-path" title={`${root}\nClick to open another folder`} onClick={openFolderDialog}>
        <Icon name="folder" size={14} /> <span>{root}</span> <Icon name="open" size={12} />
      </button>

      <section {...layout('objectives')}>
        <SectionHeader title="Objectives" count={paths.length} open={sections.objectives} onToggle={() => toggle('objectives')}>
          <button className="icon-button" title="New objective" onClick={() => void newBehaviorFile()}>
            <Icon name="newFile" size={14} />
          </button>
        </SectionHeader>
        {sections.objectives && (
          <SearchBox placeholder="Filter objectives" value={objectivesFilter} onChange={setObjectivesFilter} />
        )}
        {sections.objectives && (
          <ul className="file-list" role="tree" aria-label="Objectives">
            {paths.map((path) => {
              const f = files[path];
              const fileTrees = f.doc ? trees(f.doc) : [];
              const matchingTrees = query ? fileTrees.filter((t) => t.id.toLowerCase().includes(query)) : fileTrees;
              if (query && !path.toLowerCase().includes(query) && !matchingTrees.length) return null;
              const open = query ? true : !collapsed[path];
              const slash = path.lastIndexOf('/');
              return (
                <li key={path} role="treeitem" aria-expanded={open}>
                  <div className={`file-row ${selection.file === path && !focusModel ? 'active' : ''}`}
                    onClick={() => useStore.getState().selectFile(path)}>
                    <button className={`chevron ${open ? 'open' : ''} ${fileTrees.length ? '' : 'hidden'}`}
                      onClick={(e) => { e.stopPropagation(); setCollapsed({ ...collapsed, [path]: open }); }}
                      aria-label={open ? 'Collapse' : 'Expand'}>
                      <Icon name="chevron" size={12} />
                    </button>
                    <Icon name="file" size={14} className="muted" />
                    <span className="file-name" title={path}>
                      {slash >= 0 && <span className="muted">{path.slice(0, slash + 1)}</span>}
                      {path.slice(slash + 1)}
                    </span>
                    {isDirty(f) && <span className="dirty" title="Unsaved changes">●</span>}
                    {f.error && <span className="count count-error" title={f.error.message}>XML</span>}
                    <Counts {...countBySeverity(byFile.get(path))} />
                    <button className="icon-button row-action" title="Delete file"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (await confirm('Delete file', <>Delete <b>{path}</b> from disk? This cannot be undone.</>)) {
                          await useStore.getState().deleteFile(path);
                        }
                      }}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                  {open && (
                    <ul role="group">
                      {matchingTrees.map((t) => (
                        <li key={t.uid} role="treeitem"
                          className={`tree-row ${selection.tree === t.uid && !focusModel ? 'active' : ''}`}
                          onClick={() => useStore.getState().select({ file: path, tree: t.uid })}>
                          <Icon name="tree" size={14} className="muted" />
                          <span>{t.id || <i className="muted">no ID</i>}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
            {!paths.length && (
              <li className="empty">
                No objectives in this folder.
                <button className="link" onClick={() => void newBehaviorFile()}>Create an objective</button>
              </li>
            )}
          </ul>
        )}
      </section>

      {handle('behaviors', 'Resize the behaviors list')}
      <section {...layout('behaviors')}>
        <SectionHeader title="Behaviors" count={behaviors.length} open={sections.behaviors} onToggle={() => toggle('behaviors')} />
        {sections.behaviors && (
          <SearchBox placeholder="Filter behaviors" value={behaviorsFilter} onChange={setBehaviorsFilter} />
        )}
        {sections.behaviors && (
          <ul className="file-list" aria-label="Behaviors">
            {shownBehaviors.map((m) => (
              <NodeTypeRow key={m.id} model={m} uses={usage.get(m.id) ?? 0} active={focusModel === m.id} />
            ))}
            {behaviors.length > 0 && !shownBehaviors.length && <li className="empty">No behavior matches “{behaviorsFilter}”.</li>}
            {!behaviors.length && (
              <li className="empty">
                No behaviors declared. Declare your C++ nodes in a TreeNodesModel, e.g. generated with
                BT::writeTreeNodesModelXML.
              </li>
            )}
          </ul>
        )}
      </section>

      {handle('builtins', 'Resize the built-in nodes list')}
      <section {...layout('builtins')}>
        <SectionHeader title="Built-in nodes" count={builtins.length} open={sections.builtins} onToggle={() => toggle('builtins')} />
        {sections.builtins && (
          <SearchBox placeholder="Filter built-in nodes" value={builtinsFilter} onChange={setBuiltinsFilter} />
        )}
        {sections.builtins && (
          <ul className="file-list" aria-label="Built-in nodes">
            {CATEGORIES.filter(isNodeTypeCategory).map((category) => {
              const group = shownBuiltins.filter((m) => m.category === category).sort((a, b) => a.id.localeCompare(b.id));
              if (!group.length) return null;
              return (
                <li key={category}>
                  <div className="group-label">{category}</div>
                  <ul>
                    {group.map((m) => (
                      <NodeTypeRow key={m.id} model={m} uses={usage.get(m.id) ?? 0} active={focusModel === m.id} />
                    ))}
                  </ul>
                </li>
              );
            })}
            {!shownBuiltins.length && <li className="empty">No built-in node matches “{builtinsFilter}”.</li>}
          </ul>
        )}
      </section>
    </aside>
  );
}
