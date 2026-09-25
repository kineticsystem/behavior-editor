// Edits of a tree, or of a whole document, in place. The editor applies them
// to a copy of the document, so that the previous version stays available for
// undo. The functions that may find nothing to do return false then, which
// tells the editor not to record an undo step.

import type { BehaviorTreeDef, BTDocument, BTNode, NodeModel, NodeTypeCategory, PortModel } from './types';
import { models, newUid, trees } from './xml';

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

/** Replaces the node `uid` with `parent`, which gets the node as its only child. */
export function wrap(tree: BehaviorTreeDef, uid: string, parent: BTNode): boolean {
  const at = locate(tree, uid);
  if (!at) return false;
  parent.children = [at.node];
  at.parent.children[at.index] = parent;
  return true;
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

/**
 * Whether the node is disabled: BehaviorTree.CPP never runs it, because its
 * _skipIf is `true`, or `true || (…)` around the condition it had before.
 */
export function isDisabled(node: BTNode): boolean {
  const skipIf = node.attrs._skipIf?.trim();
  return skipIf === 'true' || !!skipIf?.startsWith('true || (');
}

/** Disables or enables the node through _skipIf, keeping the condition it had, if any. */
export function setDisabled(node: BTNode, disabled: boolean) {
  const skipIf = node.attrs._skipIf?.trim();
  if (disabled === isDisabled(node)) return;
  if (disabled) setAttr(node, '_skipIf', skipIf ? `true || (${skipIf})` : 'true');
  else setAttr(node, '_skipIf', skipIf === 'true' ? undefined : skipIf!.slice('true || ('.length, -1));
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

/** Adds a tree after the last one, so that a TreeNodesModel at the end stays there. */
export function addTree(doc: BTDocument, tree: BehaviorTreeDef) {
  const last = doc.items.map((i) => i.kind).lastIndexOf('tree');
  doc.items.splice(last + 1, 0, { kind: 'tree', tree });
}

/** Removes a tree, and main_tree_to_execute if it named it. */
export function deleteTree(doc: BTDocument, treeUid: string): boolean {
  const tree = findTreeByUid(doc, treeUid);
  if (!tree) return false;
  doc.items = doc.items.filter((i) => !(i.kind === 'tree' && i.tree.uid === treeUid));
  if (doc.rootAttrs.main_tree_to_execute === tree.id) delete doc.rootAttrs.main_tree_to_execute;
  return true;
}

/**
 * Renames the tree `from` to `to` as far as this document is concerned: the
 * tree itself if it is here (`treeUid`), the SubTree nodes and the
 * main_tree_to_execute that refer to it, and its SubTree model. Applied to
 * every file, it renames the tree in the whole workspace.
 */
export function renameTree(doc: BTDocument, from: string, to: string, treeUid?: string): boolean {
  let changed = false;
  const tree = treeUid ? findTreeByUid(doc, treeUid) : undefined;
  if (tree) {
    tree.id = to;
    changed = true;
  }
  if (renameSubtreeRefs(doc, from, to)) changed = true;
  for (const m of models(doc)) {
    if (m.category === 'SubTree' && m.id === from) {
      m.id = to;
      changed = true;
    }
  }
  return changed;
}

/** Declares a node type in the document's TreeNodesModel. */
export function declareModel(doc: BTDocument, id: string, category: NodeTypeCategory, ports: PortModel[] = []) {
  modelsOf(doc).push({ id, category, ports });
}

/** Input ports for the attributes of an undeclared node, to declare its type from it. */
export function portsFromAttributes(node: BTNode): PortModel[] {
  return Object.keys(node.attrs)
    .filter((k) => k !== 'name' && !k.startsWith('_'))
    .map((name) => ({ direction: 'input', name }));
}
