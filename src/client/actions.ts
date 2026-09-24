// Editing commands on the current selection, shared by the toolbar, the
// keyboard shortcuts and the row buttons.

import { canHaveChildren } from '../shared/builtins';
import {
  cloneNode, createNode, findTreeByUid, insert, locate, modelsOf, move, type Placement, remove, shift,
} from '../shared/treeOps';
import type { BehaviorTreeDef, BTNode, NodeCategory, NodeModel } from '../shared/types';
import { categoryOf, type Workspace } from '../shared/workspace';
import { useStore } from './store';

function current() {
  const s = useStore.getState();
  const { file, tree, node } = s.selection;
  return { s, file, tree, node };
}

/** Where a new node goes: inside the selection if it can have children, else after it. */
export function insertionPoint(ws: Workspace, tree: BehaviorTreeDef, nodeUid?: string): { target?: string; placement: Placement } {
  if (!nodeUid) {
    const root = tree.children[0];
    if (root && canHaveChildren(categoryOf(ws, root))) return { target: root.uid, placement: 'inside' };
    return { target: undefined, placement: 'inside' };
  }
  const at = locate(tree, nodeUid);
  if (at && canHaveChildren(categoryOf(ws, at.node))) return { target: nodeUid, placement: 'inside' };
  return { target: nodeUid, placement: 'after' };
}

type Point = { target?: string; placement: Placement };

/** Inserts at `point`, or by default at the insertion point of the selection. */
function insertNode(node: BTNode, point: Point | ((tree: BehaviorTreeDef, selected?: string) => Point)) {
  const { s, file, tree, node: selected } = current();
  if (!file || !tree) return;
  let at: Point | undefined;
  s.edit(file, (doc) => {
    const t = findTreeByUid(doc, tree);
    if (!t) return false;
    at = typeof point === 'function' ? point(t, selected) : point;
    if (!insert(t, node, at.target, at.placement)) return false;
  });
  if (at?.target && at.placement === 'inside') s.setCollapsed([at.target], false);
  s.select({ file, tree, node: node.uid });
}

export function addNode(ws: Workspace, model: Pick<NodeModel, 'id' | 'category'>, subtreeId?: string, point?: Point) {
  insertNode(createNode(model, subtreeId), point ?? ((t, selected) => insertionPoint(ws, t, selected)));
}

/** Declares a new custom node type in a file's TreeNodesModel. */
export function declareModel(path: string, id: string, category: Exclude<NodeCategory, 'SubTree'>) {
  useStore.getState().edit(path, (doc) => {
    modelsOf(doc).push({ id, category, ports: [] });
  });
}

export function deleteSelected() {
  const { s, file, tree, node } = current();
  if (!file || !tree || !node) return;
  let nextSelection: string | undefined;
  s.edit(file, (doc) => {
    const t = findTreeByUid(doc, tree);
    const at = t && locate(t, node);
    if (!t || !at) return false;
    const siblings = at.parent.children;
    nextSelection = (siblings[at.index + 1] ?? siblings[at.index - 1])?.uid
      ?? (at.parent !== t ? (at.parent as BTNode).uid : undefined);
    remove(t, node);
  });
  s.select({ file, tree, node: nextSelection });
}

export function shiftSelected(delta: -1 | 1) {
  const { s, file, tree, node } = current();
  if (!file || !tree || !node) return;
  s.edit(file, (doc) => {
    const t = findTreeByUid(doc, tree);
    if (!t || !shift(t, node, delta)) return false;
  });
}

export function moveNode(uid: string, target: string, placement: Placement) {
  const { s, file, tree } = current();
  if (!file || !tree) return;
  s.edit(file, (doc) => {
    const t = findTreeByUid(doc, tree);
    if (!t) return false;
    // Dropping on the tree row makes the node the root.
    if (target === t.uid) {
      const at = locate(t, uid);
      if (!at) return false;
      remove(t, uid);
      t.children.unshift(at.node);
      return;
    }
    if (!move(t, uid, target, placement)) return false;
  });
  if (placement === 'inside') s.setCollapsed([target], false);
  s.select({ file, tree, node: uid });
}

function selectedNode(): BTNode | undefined {
  const { s, file, tree, node } = current();
  const doc = file ? s.files[file]?.doc : undefined;
  const t = doc && tree ? findTreeByUid(doc, tree) : undefined;
  return t && node ? locate(t, node)?.node : undefined;
}

export function copySelected() {
  const node = selectedNode();
  if (node) {
    useStore.getState().setClipboard(node);
    useStore.getState().toast(`Copied ${node.id === 'SubTree' ? `SubTree ${node.attrs.ID}` : node.id}`);
  }
}

export function cutSelected() {
  const node = selectedNode();
  if (!node) return;
  useStore.getState().setClipboard(node);
  deleteSelected();
}

export function paste(ws: Workspace) {
  const clip = useStore.getState().clipboard;
  if (clip) insertNode(cloneNode(clip), (t, selected) => insertionPoint(ws, t, selected));
}

export function duplicateSelected() {
  const node = selectedNode();
  const { node: uid } = current();
  if (node && uid) insertNode(cloneNode(node), { target: uid, placement: 'after' });
}

/** Wraps the selected node in a new parent, e.g. an Inverter or a Sequence. */
export function wrapSelected(model: Pick<NodeModel, 'id' | 'category'>) {
  const { s, file, tree, node } = current();
  if (!file || !tree || !node) return;
  const parent = createNode(model);
  s.edit(file, (doc) => {
    const t = findTreeByUid(doc, tree);
    const at = t && locate(t, node);
    if (!t || !at) return false;
    parent.children = [at.node];
    at.parent.children[at.index] = parent;
  });
  s.select({ file, tree, node: parent.uid });
}

export function undo() {
  const { s, file } = current();
  if (file) s.undo(file);
}

export function redo() {
  const { s, file } = current();
  if (file) s.redo(file);
}

export function save() {
  const { s, file } = current();
  if (file) void s.save(file);
}
