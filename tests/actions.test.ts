import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flatten } from '../src/shared/treeOps';
import type { BTNode } from '../src/shared/types';
import { buildWorkspace } from '../src/shared/workspace';
import { trees } from '../src/shared/xml';
import { disk, resetServer } from './fakeServer';

vi.mock('../src/client/api', async (original) => {
  const actual = await original<typeof import('../src/client/api')>();
  const { makeFakeApi } = await import('./fakeServer');
  return { ...actual, api: makeFakeApi(actual.ApiError) };
});
const choose = vi.fn();
vi.mock('../src/client/dialogs', () => ({ choose }));

const actions = await import('../src/client/actions');
const { isDirty, useStore } = await import('../src/client/store');

const A = `<root BTCPP_format="4" main_tree_to_execute="A">
  <BehaviorTree ID="A"><Sequence><MoveTo/><Inverter><AlwaysSuccess/></Inverter><SubTree ID="B"/></Sequence></BehaviorTree>
  <TreeNodesModel><Action ID="MoveTo"/></TreeNodesModel>
</root>`;
const B = `<root BTCPP_format="4" main_tree_to_execute="B"><BehaviorTree ID="B"><AlwaysSuccess/></BehaviorTree></root>`;

const s = () => useStore.getState();
const docOf = (path: string) => s().files[path].doc!;
const treeA = () => trees(docOf('a.xml'))[0];
const nodes = () => flatten(treeA().children);
const find = (id: string) => nodes().find((n) => n.id === id)!;
const ids = (list: BTNode[]): unknown[] => list.map((n) => (n.children.length ? [n.id, ids(n.children)] : n.id));
const ws = () => buildWorkspace(Object.values(s().files));
const selectNode = (id?: string) => s().select({ file: 'a.xml', tree: treeA().uid, node: id && find(id).uid });

beforeEach(async () => {
  resetServer({ 'a.xml': A, 'b.xml': B });
  useStore.setState({ root: '', files: {}, selection: {}, back: [], forward: [], toasts: [], clipboard: undefined });
  await s().load();
  choose.mockReset();
});

describe('node commands', () => {
  it('insert inside a node that takes children, after one that does not', () => {
    selectNode('Sequence');
    actions.addNode(ws(), { id: 'AlwaysFailure', category: 'Action' });
    selectNode('MoveTo');
    actions.addNode(ws(), { id: 'Sleep', category: 'Action' });
    expect(ids(treeA().children)).toEqual([
      ['Sequence', ['MoveTo', 'Sleep', ['Inverter', ['AlwaysSuccess']], 'SubTree', 'AlwaysFailure']],
    ]);
    // The new node is selected.
    expect(s().selection.node).toBe(find('Sleep').uid);
  });

  it('select the next sibling after a delete, or the parent', () => {
    selectNode('MoveTo');
    actions.deleteSelected();
    expect(s().selection.node).toBe(find('Inverter').uid);
    selectNode('AlwaysSuccess');
    actions.deleteSelected();
    expect(s().selection.node).toBe(find('Inverter').uid);
  });

  it('wrap, duplicate, cut and paste', () => {
    selectNode('MoveTo');
    actions.wrapSelected({ id: 'ForceSuccess', category: 'Decorator' });
    selectNode('SubTree');
    actions.duplicateSelected();
    actions.cutSelected();
    selectNode('Sequence');
    actions.paste(ws());
    expect(ids(treeA().children)).toEqual([
      ['Sequence', [['ForceSuccess', ['MoveTo']], ['Inverter', ['AlwaysSuccess']], 'SubTree', 'SubTree']],
    ]);
  });

  it('disable and enable the selection, as one undo step each', () => {
    selectNode('MoveTo');
    actions.toggleDisabledSelected();
    expect(find('MoveTo').attrs._skipIf).toBe('true');
    actions.undo();
    expect(find('MoveTo').attrs._skipIf).toBeUndefined();
  });
});

describe('tree commands', () => {
  it('rename a tree everywhere it is used', () => {
    const b = trees(docOf('b.xml'))[0];
    expect(actions.renameTree('b.xml', b.uid, 'B', 'Bee')).toBe(1);
    expect(trees(docOf('b.xml'))[0].id).toBe('Bee');
    expect(docOf('b.xml').rootAttrs.main_tree_to_execute).toBe('Bee');
    expect(find('SubTree').attrs.ID).toBe('Bee');
    // One undo step in each file changed.
    expect(s().files['a.xml'].past).toHaveLength(1);
  });

  it('add and delete trees', () => {
    actions.addNewTree('b.xml', 'C');
    expect(trees(docOf('b.xml')).map((t) => t.id)).toEqual(['B', 'C']);
    expect(s().selection.tree).toBe(trees(docOf('b.xml'))[1].uid);
    actions.deleteTree('b.xml', trees(docOf('b.xml'))[0].uid);
    expect(trees(docOf('b.xml')).map((t) => t.id)).toEqual(['C']);
    expect(docOf('b.xml').rootAttrs.main_tree_to_execute).toBeUndefined();
  });

  it('declare a node type from an undeclared node', () => {
    const node: BTNode = { uid: 'x', id: 'Grip', tag: 'Grip', attrs: { force: '3', _skipIf: 'x' }, children: [] };
    actions.declareFromNode('b.xml', node, 'Action');
    expect(ws().models.get('Grip')).toMatchObject({ category: 'Action', ports: [{ direction: 'input', name: 'force' }] });
  });
});

describe('saving', () => {
  const edit = () => {
    selectNode('MoveTo');
    actions.toggleDisabledSelected();
  };

  it('saves without asking when nobody changed the file', async () => {
    edit();
    expect(await actions.saveFile('a.xml')).toBe(true);
    expect(choose).not.toHaveBeenCalled();
  });

  it('asks on a conflict, and overwrites when told to', async () => {
    edit();
    disk.set('a.xml', 'by hand');
    choose.mockResolvedValueOnce('overwrite');
    expect(await actions.saveFile('a.xml')).toBe(true);
    expect(choose).toHaveBeenCalledOnce();
    expect(disk.get('a.xml')).toContain('_skipIf="true"');
  });

  it('asks on a conflict, and takes the version on disk when told to', async () => {
    edit();
    disk.set('a.xml', B);
    choose.mockResolvedValueOnce('reload');
    expect(await actions.saveFile('a.xml')).toBe(false);
    expect(disk.get('a.xml')).toBe(B);
    expect(isDirty(s().files['a.xml'])).toBe(false);
    expect(trees(docOf('a.xml'))[0].id).toBe('B');
  });

  it('keeps the edits when the conflict is cancelled', async () => {
    edit();
    disk.set('a.xml', 'by hand');
    choose.mockResolvedValueOnce(undefined);
    expect(await actions.saveAll()).toBe(false);
    expect(disk.get('a.xml')).toBe('by hand');
    expect(isDirty(s().files['a.xml'])).toBe(true);
  });
});
