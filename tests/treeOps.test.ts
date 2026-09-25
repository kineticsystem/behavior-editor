import { describe, expect, it } from 'vitest';
import {
  addTree, cloneNode, createNode, declareModel, deleteTree, flatten, insert, isDisabled, locate, move, portsFromAttributes,
  remove, removeModel, renameTree, setDisabled, shift, wrap,
} from '../src/shared/treeOps';
import type { BTNode } from '../src/shared/types';
import { models, newTree, parseDocument, serializeDocument, trees } from '../src/shared/xml';

const node = (attrs: Record<string, string> = {}): BTNode => ({ uid: 'n', id: 'MoveTo', tag: 'MoveTo', attrs, children: [] });

describe('setDisabled', () => {
  it('skips a node that has no _skipIf, and removes it again', () => {
    const n = node({ goal: '{pose}' });
    setDisabled(n, true);
    expect(n.attrs).toEqual({ goal: '{pose}', _skipIf: 'true' });
    expect(isDisabled(n)).toBe(true);
    setDisabled(n, false);
    expect(n.attrs).toEqual({ goal: '{pose}' });
    expect(isDisabled(n)).toBe(false);
  });

  it('keeps the condition a node already had, and restores it', () => {
    const n = node({ _skipIf: '@speed > 1' });
    expect(isDisabled(n)).toBe(false);
    setDisabled(n, true);
    expect(n.attrs._skipIf).toBe('true || (@speed > 1)');
    expect(isDisabled(n)).toBe(true);
    setDisabled(n, false);
    expect(n.attrs._skipIf).toBe('@speed > 1');
  });

  it('leaves a node alone when it is already in the requested state', () => {
    const n = node({ _skipIf: 'true' });
    setDisabled(n, true);
    expect(n.attrs._skipIf).toBe('true');
  });
});

describe('tree edits', () => {
  const tree = () => {
    const [t] = trees(parseDocument(`<root BTCPP_format="4"><BehaviorTree ID="T">
      <Sequence><A/><Fallback><B/></Fallback><C/></Sequence>
    </BehaviorTree></root>`).doc!);
    return t;
  };
  const ids = (nodes: BTNode[]): unknown[] => nodes.map((n) => (n.children.length ? [n.id, ids(n.children)] : n.id));
  const uid = (t: ReturnType<typeof tree>, id: string) => flatten(t.children).find((n) => n.id === id)!.uid;

  it('inserts before, after and inside a node', () => {
    const t = tree();
    insert(t, createNode({ id: 'X', category: 'Action' }), uid(t, 'A'), 'before');
    insert(t, createNode({ id: 'Y', category: 'Action' }), uid(t, 'A'), 'after');
    insert(t, createNode({ id: 'Z', category: 'Action' }), uid(t, 'Fallback'), 'inside');
    expect(ids(t.children)).toEqual([['Sequence', ['X', 'A', 'Y', ['Fallback', ['B', 'Z']], 'C']]]);
  });

  it('moves a node, but never inside itself', () => {
    const t = tree();
    expect(move(t, uid(t, 'C'), uid(t, 'Fallback'), 'inside')).toBe(true);
    expect(ids(t.children)).toEqual([['Sequence', ['A', ['Fallback', ['B', 'C']]]]]);
    expect(move(t, uid(t, 'Fallback'), uid(t, 'B'), 'after')).toBe(false);
    expect(move(t, uid(t, 'A'), uid(t, 'A'), 'after')).toBe(false);
  });

  it('shifts a node among its siblings, within bounds', () => {
    const t = tree();
    expect(shift(t, uid(t, 'C'), -1)).toBe(true);
    expect(ids(t.children)).toEqual([['Sequence', ['A', 'C', ['Fallback', ['B']]]]]);
    expect(shift(t, uid(t, 'A'), -1)).toBe(false);
  });

  it('removes and wraps nodes', () => {
    const t = tree();
    expect(remove(t, uid(t, 'B'))?.id).toBe('B');
    expect(remove(t, 'nope')).toBeUndefined();
    expect(wrap(t, uid(t, 'A'), createNode({ id: 'Inverter', category: 'Decorator' }))).toBe(true);
    expect(ids(t.children)).toEqual([['Sequence', [['Inverter', ['A']], 'Fallback', 'C']]]);
  });

  it('clones with fresh uids everywhere', () => {
    const t = tree();
    const fallback = locate(t, uid(t, 'Fallback'))!.node;
    const copy = cloneNode(fallback);
    expect(ids([copy])).toEqual(ids([fallback]));
    expect(copy.uid).not.toBe(fallback.uid);
    expect(copy.children[0].uid).not.toBe(fallback.children[0].uid);
  });

  it('creates SubTree nodes with their target', () => {
    expect(createNode({ id: 'SubTree', category: 'SubTree' }, 'Pick')).toMatchObject({ id: 'SubTree', tag: 'SubTree', attrs: { ID: 'Pick' } });
  });
});

describe('document edits', () => {
  const doc = () => parseDocument(`<root BTCPP_format="4" main_tree_to_execute="A">
    <BehaviorTree ID="A"><SubTree ID="B"/></BehaviorTree>
    <BehaviorTree ID="B"><AlwaysSuccess/></BehaviorTree>
    <TreeNodesModel><SubTree ID="B"><input_port name="x"/></SubTree></TreeNodesModel>
  </root>`).doc!;

  it('adds a tree after the last tree, before the models', () => {
    const d = doc();
    addTree(d, newTree('C'));
    expect(d.items.map((i) => (i.kind === 'tree' ? i.tree.id : i.kind))).toEqual(['A', 'B', 'C', 'models']);
  });

  it('deletes a tree and the main_tree_to_execute that named it', () => {
    const d = doc();
    expect(deleteTree(d, trees(d)[0].uid)).toBe(true);
    expect(trees(d).map((t) => t.id)).toEqual(['B']);
    expect(d.rootAttrs.main_tree_to_execute).toBeUndefined();
    expect(deleteTree(d, 'nope')).toBe(false);
  });

  it('renames a tree, its references and its SubTree model', () => {
    const d = doc();
    expect(renameTree(d, 'B', 'Bee', trees(d)[1].uid)).toBe(true);
    expect(serializeDocument(d)).toContain('<SubTree ID="Bee"/>');
    expect(trees(d)[1].id).toBe('Bee');
    expect(models(d)[0].id).toBe('Bee');
    // Another file refers to it as the main tree.
    expect(renameTree(d, 'A', 'Ay')).toBe(true);
    expect(d.rootAttrs.main_tree_to_execute).toBe('Ay');
    expect(renameTree(d, 'Nope', 'X')).toBe(false);
  });

  it('declares models, and drops a TreeNodesModel emptied by removing one', () => {
    const d = doc();
    declareModel(d, 'MoveTo', 'Action', [{ direction: 'input', name: 'goal' }]);
    expect(models(d).map((m) => m.id)).toEqual(['B', 'MoveTo']);
    removeModel(d, 'B', 'SubTree');
    removeModel(d, 'MoveTo');
    expect(d.items.some((i) => i.kind === 'models')).toBe(false);
  });

  it('turns the attributes of a node into input ports', () => {
    expect(portsFromAttributes(node({ name: 'n', goal: '{g}', _skipIf: 'x', speed: '1' }))).toEqual([
      { direction: 'input', name: 'goal' }, { direction: 'input', name: 'speed' },
    ]);
  });
});
