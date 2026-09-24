// Edits of a tree in place. The editor applies them to a copy of the
// document, so that the previous version stays available for undo.

import type { BehaviorTreeDef, BTDocument, BTNode, NodeModel } from './types';
import { newUid, trees } from './xml';

/** A node, or a tree whose children are its root nodes. */
export type Container = BTNode | BehaviorTreeDef;

export interface Located {
  node: BTNode;
  parent: Container;
  index: number;
}

export function findTreeByUid(doc: BTDocument, uid: string): BehaviorTreeDef | undefined {
  return trees(doc).find((t) => t.uid === uid);
}

export function locate(container: Container, uid: string): Located | undefined {
  for (let i = 0; i < container.children.length; i++) {
    const node = container.children[i];
    if (node.uid === uid) return { node, parent: container, index: i };
    const found = locate(node, uid);
    if (found) return found;
  }
  return undefined;
}

/** The nodes of the tree in display order, e.g. for keyboard navigation. */
export function flatten(nodes: BTNode[], skip: (n: BTNode) => boolean = () => false, out: BTNode[] = []): BTNode[] {
  for (const n of nodes) {
    out.push(n);
    if (!skip(n)) flatten(n.children, skip, out);
  }
  return out;
}

export function contains(node: BTNode, uid: string): boolean {
  return node.uid === uid || node.children.some((c) => contains(c, uid));
}

export function remove(tree: BehaviorTreeDef, uid: string): BTNode | undefined {
  const at = locate(tree, uid);
  if (!at) return undefined;
  at.parent.children.splice(at.index, 1);
  return at.node;
}

export type Placement = 'before' | 'after' | 'inside';

/** Inserts `node` relative to the node `targetUid`, or as a root of the tree. */
export function insert(tree: BehaviorTreeDef, node: BTNode, targetUid: string | undefined, placement: Placement): boolean {
  if (!targetUid || targetUid === tree.uid) {
    tree.children.push(node);
    return true;
  }
  const at = locate(tree, targetUid);
  if (!at) return false;
  if (placement === 'inside') at.node.children.push(node);
  else at.parent.children.splice(placement === 'before' ? at.index : at.index + 1, 0, node);
  return true;
}

/** Moves a node; refuses to move a node inside itself. */
export function move(tree: BehaviorTreeDef, uid: string, targetUid: string, placement: Placement): boolean {
  const at = locate(tree, uid);
  if (!at || uid === targetUid || contains(at.node, targetUid)) return false;
  remove(tree, uid);
  return insert(tree, at.node, targetUid, placement);
}

/** Moves a node one step up or down among its siblings. */
export function shift(tree: BehaviorTreeDef, uid: string, delta: -1 | 1): boolean {
  const at = locate(tree, uid);
  if (!at) return false;
  const to = at.index + delta;
  if (to < 0 || to >= at.parent.children.length) return false;
  const siblings = at.parent.children;
  [siblings[at.index], siblings[to]] = [siblings[to], siblings[at.index]];
  return true;
}

/** A deep copy with fresh uids, for paste and duplicate. */
export function cloneNode(node: BTNode): BTNode {
  return { ...structuredClone(node), uid: newUid(), children: node.children.map(cloneNode) };
}

export function createNode(model: Pick<NodeModel, 'id' | 'category'>, subtreeId?: string): BTNode {
  if (model.category === 'SubTree') {
    return { uid: newUid(), id: 'SubTree', tag: 'SubTree', attrs: { ID: subtreeId ?? '' }, children: [] };
  }
  return { uid: newUid(), id: model.id, tag: model.id, attrs: {}, children: [] };
}

export function setAttr(node: { attrs: Record<string, string> }, name: string, value: string | undefined) {
  if (value === undefined) delete node.attrs[name];
  else node.attrs[name] = value;
}

/** Renames attributes while keeping their order. */
export function renameAttr(node: { attrs: Record<string, string> }, from: string, to: string) {
  node.attrs = Object.fromEntries(Object.entries(node.attrs).map(([k, v]) => [k === from ? to : k, v]));
}

/** Points every SubTree node of the document at `to` instead of `from`. */
export function renameSubtreeRefs(doc: BTDocument, from: string, to: string): number {
  let count = 0;
  for (const t of trees(doc)) {
    for (const n of flatten(t.children)) {
      if (n.id === 'SubTree' && n.attrs.ID === from) {
        n.attrs.ID = to;
        count++;
      }
    }
  }
  if (doc.rootAttrs.main_tree_to_execute === from) {
    doc.rootAttrs.main_tree_to_execute = to;
    count++;
  }
  return count;
}

/** The TreeNodesModel of the document, created at the end if missing. */
export function modelsOf(doc: BTDocument): NodeModel[] {
  let item = doc.items.find((i) => i.kind === 'models');
  if (!item) {
    item = { kind: 'models', models: [] };
    doc.items.push(item);
  }
  return (item as { models: NodeModel[] }).models;
}

/** Removes a model from the document, dropping an emptied TreeNodesModel. */
export function removeModel(doc: BTDocument, id: string, category?: string) {
  for (const item of doc.items) {
    if (item.kind !== 'models') continue;
    item.models = item.models.filter((m) => !(m.id === id && (!category || m.category === category)));
  }
  doc.items = doc.items.filter((i) => i.kind !== 'models' || i.models.length > 0);
}
