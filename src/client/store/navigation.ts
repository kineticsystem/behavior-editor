// What is selected, and the Back and Forward history between trees.

import { locate } from '../../shared/treeOps';
import { trees } from '../../shared/xml';
import { defaultTree } from './documents';
import type { HistoryEntry, NavigationSlice, Selection, Slice, State } from './types';

/** The number of trees kept in the Back and Forward history. */
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
    const tree = all.find((t) => t.uid === h.tree) ?? all.find((t) => t.id === h.treeId);
    if (!tree) continue;
    // A node deleted since, or renumbered by a reload, leaves the tree itself selected.
    const node = h.node && locate(tree, h.node) ? h.node : undefined;
    return { selection: { file: h.file, tree: tree.uid, node }, index };
  }
  return undefined;
}

export const navigationSlice: Slice<NavigationSlice> = (set, get) => ({
  selection: {},
  back: [],
  forward: [],

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
    get().select({ file: path, tree: defaultTree(get().files[path]?.doc) });
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

  resetNavigation() {
    set({ selection: {}, back: [], forward: [], peek: undefined, focusModel: undefined });
  },
});
