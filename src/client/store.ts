import { create } from 'zustand';
import type { NativeResult } from '../server/native';
import { BUILTIN_MODELS } from '../shared/builtins';
import type { BTDocument, BTNode, NodeModel, ParseError } from '../shared/types';
import { locate } from '../shared/treeOps';
import { newDocument, parseDocument, serializeDocument, trees } from '../shared/xml';
import { api } from './api';

export interface FileState {
  path: string;
  doc?: BTDocument;
  error?: ParseError;
  /** The content on disk. */
  raw: string;
  /** The document as the editor would write it when it was loaded or saved. */
  baseline: string;
  past: BTDocument[];
  future: BTDocument[];
  /** Created in the editor and not saved yet. */
  isNew?: boolean;
  /** Consecutive edits with the same key, e.g. typing in a field, make one undo step. */
  lastEditKey?: string;
}

export interface Selection {
  file?: string;
  /** The uid of the tree shown in the editor. */
  tree?: string;
  /** The uid of the selected node; none selects the tree itself. */
  node?: string;
}

/**
 * A tree opened earlier, for Back and Forward. The tree ID is kept besides the
 * uid because reloading the folder parses the files again, with new uids.
 */
export interface HistoryEntry extends Selection {
  treeId?: string;
}

/** A node of an included tree, clicked inside an expanded SubTree: shown read-only. */
export interface Peek {
  file: string;
  tree: string;
  node: string;
  /** The key of the row that was clicked, to highlight it. */
  key: string;
}

interface Toast {
  id: number;
  kind: 'info' | 'error';
  message: string;
}

interface NativeState {
  running: boolean;
  result?: NativeResult;
  error?: string;
  /** The serialized files that were checked, to tell when the result is stale. */
  checked?: string;
}

interface State {
  root: string;
  loading: boolean;
  loadError?: string;
  files: Record<string, FileState>;
  builtins: NodeModel[];
  nativeAvailable: boolean;
  selection: Selection;
  /** The trees opened before the current one, most recent last. */
  back: HistoryEntry[];
  /** The trees left with Back, most recent last. */
  forward: HistoryEntry[];
  peek?: Peek;
  /** A node type clicked in the Behaviors list, shown in the right panel. */
  focusModel?: string;
  collapsed: Record<string, true>;
  /** SubTree rows whose referenced tree is shown inline, by row key. */
  openSubtrees: Record<string, true>;
  clipboard?: BTNode;
  native: NativeState;
  toasts: Toast[];

  load(): Promise<void>;
  /** Opens another folder, dropping everything of the current one, unsaved edits included. */
  openFolder(path: string): Promise<void>;
  select(selection: Selection): void;
  setPeek(peek: Peek): void;
  setFocusModel(id: string): void;
  selectFile(path: string): void;
  /** Opens the tree shown before the current one, or the one left with Back. */
  goBack(): void;
  goForward(): void;
  edit(path: string, change: (doc: BTDocument) => void | false, coalesceKey?: string): void;
  undo(path: string): void;
  redo(path: string): void;
  save(path: string): Promise<void>;
  saveAll(): Promise<void>;
  createFile(path: string, treeId: string): void;
  deleteFile(path: string): Promise<void>;
  setCollapsed(uids: string[], collapsed: boolean): void;
  toggleSubtree(key: string): void;
  setClipboard(node?: BTNode): void;
  runNative(): Promise<void>;
  toast(message: string, kind?: Toast['kind']): void;
}

const serializedCache = new WeakMap<BTDocument, string>();

/** The document as it would be written; cached, since documents are never mutated once stored. */
export function serialized(doc: BTDocument): string {
  let text = serializedCache.get(doc);
  if (text === undefined) {
    text = serializeDocument(doc);
    serializedCache.set(doc, text);
  }
  return text;
}

export function isDirty(f: FileState): boolean {
  return !!f.isNew || (!!f.doc && serialized(f.doc) !== f.baseline);
}

/** The content to write or validate: the edited document, or the raw text of a broken file. */
export function contentOf(f: FileState): string {
  return f.doc ? serialized(f.doc) : f.raw;
}

function fileState(path: string, raw: string): FileState {
  const { doc, error } = parseDocument(raw);
  return { path, doc, error, raw, baseline: doc ? serialized(doc) : raw, past: [], future: [] };
}

/** The tree to show when a file is opened: its main tree, or the first one. */
export function defaultTree(doc: BTDocument | undefined): string | undefined {
  if (!doc) return undefined;
  const all = trees(doc);
  return (all.find((t) => t.id === doc.rootAttrs.main_tree_to_execute) ?? all[0])?.uid;
}

let toastId = 0;

const HISTORY_LIMIT = 50;

function entry(s: State, selection: Selection): HistoryEntry {
  const doc = selection.file ? s.files[selection.file]?.doc : undefined;
  const tree = doc && trees(doc).find((t) => t.uid === selection.tree);
  return { ...selection, treeId: tree?.id };
}

/** The history once `next` is selected: opening another tree records the current one. */
function leaving(s: State, next: Selection): Partial<State> {
  const current = s.selection;
  if (!current.file || (current.file === next.file && current.tree === next.tree)) return {};
  return { back: [...s.back, entry(s, current)].slice(-HISTORY_LIMIT), forward: [] };
}

/** The most recent entry of a history that still exists, skipping deleted files and trees. */
function lastValid(s: State, history: HistoryEntry[]): { selection: Selection; index: number } | undefined {
  for (let index = history.length - 1; index >= 0; index--) {
    const h = history[index];
    const doc = h.file ? s.files[h.file]?.doc : undefined;
    if (!doc) continue;
    const all = trees(doc);
    const byUid = all.find((t) => t.uid === h.tree);
    const tree = byUid ?? all.find((t) => t.id === h.treeId);
    if (!tree) continue;
    // A node deleted since, or renumbered by a reload, leaves the tree itself selected.
    const node = h.node && locate(tree, h.node) ? h.node : undefined;
    return { selection: { file: h.file, tree: tree.uid, node }, index };
  }
  return undefined;
}

export const useStore = create<State>((set, get) => ({
  root: '',
  loading: true,
  files: {},
  builtins: BUILTIN_MODELS,
  nativeAvailable: false,
  selection: {},
  back: [],
  forward: [],
  collapsed: {},
  openSubtrees: {},
  native: { running: false },
  toasts: [],

  async load() {
    set({ loading: true, loadError: undefined });
    try {
      const ws = await api.workspace();
      const previous = get().files;
      const files: Record<string, FileState> = {};
      for (const f of ws.files) {
        const old = previous[f.path];
        // Keep unsaved edits; take everything else from disk.
        files[f.path] = old && isDirty(old) ? { ...old, raw: f.content, isNew: false } : fileState(f.path, f.content);
      }
      for (const [path, old] of Object.entries(previous)) {
        if (!files[path] && old.isNew) files[path] = old;
      }
      set({
        root: ws.root, files, loading: false,
        builtins: ws.builtins?.length ? ws.builtins : BUILTIN_MODELS,
        nativeAvailable: ws.nativeValidator,
      });
      const { selection } = get();
      if (!selection.file || !files[selection.file]) {
        // Open the first file with a tree, not e.g. a file of node models.
        const paths = Object.keys(files).sort();
        const first = paths.find((p) => defaultTree(files[p].doc)) ?? paths[0];
        if (first) get().selectFile(first);
        else set({ selection: {} });
      } else if (selection.tree && !trees(files[selection.file].doc ?? { rootAttrs: {}, items: [] }).some((t) => t.uid === selection.tree)) {
        get().selectFile(selection.file);
      }
    } catch (e) {
      set({ loading: false, loadError: e instanceof Error ? e.message : String(e) });
    }
  },

  async openFolder(path) {
    try {
      await api.openFolder(path);
    } catch (e) {
      get().toast(`Cannot open ${path}: ${e instanceof Error ? e.message : e}`, 'error');
      return;
    }
    // Everything refers to the files of the old folder; load() would otherwise
    // keep their unsaved edits and apply them to same-named files here.
    set({
      files: {}, selection: {}, back: [], forward: [], peek: undefined, focusModel: undefined,
      collapsed: {}, openSubtrees: {}, native: { running: false },
    });
    await get().load();
  },

  select(selection) {
    set({ selection, ...leaving(get(), selection), peek: undefined, focusModel: undefined });
  },

  setPeek(peek) {
    set({ peek, focusModel: undefined });
  },

  setFocusModel(id) {
    set({ focusModel: id, peek: undefined });
  },

  selectFile(path) {
    const selection = { file: path, tree: defaultTree(get().files[path]?.doc) };
    set({ selection, ...leaving(get(), selection), peek: undefined, focusModel: undefined });
  },

  goBack() {
    const { back, forward, selection } = get();
    const found = lastValid(get(), back);
    if (!found) {
      set({ back: [] });
      return;
    }
    set({
      selection: found.selection, back: back.slice(0, found.index),
      forward: [...forward, entry(get(), selection)], peek: undefined, focusModel: undefined,
    });
  },

  goForward() {
    const { back, forward, selection } = get();
    const found = lastValid(get(), forward);
    if (!found) {
      set({ forward: [] });
      return;
    }
    set({
      selection: found.selection, forward: forward.slice(0, found.index),
      back: [...back, entry(get(), selection)], peek: undefined, focusModel: undefined,
    });
  },

  edit(path, change, coalesceKey) {
    const f = get().files[path];
    if (!f?.doc) return;
    const next = structuredClone(f.doc);
    if (change(next) === false) return;
    const coalesce = coalesceKey !== undefined && coalesceKey === f.lastEditKey;
    const past = coalesce ? f.past : [...f.past.slice(-199), f.doc];
    set({ files: { ...get().files, [path]: { ...f, doc: next, past, future: [], lastEditKey: coalesceKey } } });
  },

  undo(path) {
    const f = get().files[path];
    if (!f?.doc || !f.past.length) return;
    const doc = f.past[f.past.length - 1];
    set({ files: { ...get().files, [path]: { ...f, doc, past: f.past.slice(0, -1), future: [f.doc, ...f.future], lastEditKey: undefined } } });
  },

  redo(path) {
    const f = get().files[path];
    if (!f?.doc || !f.future.length) return;
    const [doc, ...future] = f.future;
    set({ files: { ...get().files, [path]: { ...f, doc, past: [...f.past, f.doc], future, lastEditKey: undefined } } });
  },

  async save(path) {
    const f = get().files[path];
    if (!f?.doc) return;
    const content = serialized(f.doc);
    try {
      await api.save(path, content);
      const current = get().files[path];
      set({ files: { ...get().files, [path]: { ...current, raw: content, baseline: content, isNew: false } } });
      get().toast(`Saved ${path}`);
    } catch (e) {
      get().toast(`Cannot save ${path}: ${e instanceof Error ? e.message : e}`, 'error');
    }
  },

  async saveAll() {
    for (const f of Object.values(get().files)) {
      if (isDirty(f)) await get().save(f.path);
    }
  },

  createFile(path, treeId) {
    const doc = newDocument(treeId);
    const f: FileState = { path, doc, raw: '', baseline: '', past: [], future: [], isNew: true };
    set({ files: { ...get().files, [path]: f }, selection: { file: path, tree: defaultTree(doc) } });
  },

  async deleteFile(path) {
    const f = get().files[path];
    if (!f) return;
    try {
      if (!f.isNew) await api.remove(path);
      const files = { ...get().files };
      delete files[path];
      set({ files });
      if (get().selection.file === path) {
        const first = Object.keys(files).sort()[0];
        if (first) get().selectFile(first);
        else set({ selection: {} });
      }
      get().toast(`Deleted ${path}`);
    } catch (e) {
      get().toast(`Cannot delete ${path}: ${e instanceof Error ? e.message : e}`, 'error');
    }
  },

  setCollapsed(uids, collapsed) {
    const next = { ...get().collapsed };
    for (const uid of uids) {
      if (collapsed) next[uid] = true;
      else delete next[uid];
    }
    set({ collapsed: next });
  },

  toggleSubtree(key) {
    const next = { ...get().openSubtrees };
    if (next[key]) delete next[key];
    else next[key] = true;
    set({ openSubtrees: next });
  },

  setClipboard(node) {
    set({ clipboard: node ? structuredClone(node) : undefined });
  },

  async runNative() {
    const files = Object.values(get().files).map((f) => ({ path: f.path, content: contentOf(f) }));
    const checked = JSON.stringify(files);
    set({ native: { ...get().native, running: true, error: undefined } });
    try {
      const result = await api.validate(files);
      set({ native: { running: false, result, checked } });
    } catch (e) {
      set({ native: { running: false, error: e instanceof Error ? e.message : String(e) } });
    }
  },

  toast(message, kind = 'info') {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, kind, message }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), kind === 'error' ? 6000 : 2500);
  },
}));

/** The serialized state of all files, compared with NativeState.checked. */
export function workspaceFingerprint(files: Record<string, FileState>): string {
  return JSON.stringify(Object.values(files).map((f) => ({ path: f.path, content: contentOf(f) })));
}
