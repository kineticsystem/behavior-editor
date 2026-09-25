import { beforeEach, describe, expect, it, vi } from 'vitest';
import { etagOf } from '../src/server/files';
import { setAttr } from '../src/shared/treeOps';
import { trees } from '../src/shared/xml';
import { disk, fakeApi, resetServer, server } from './fakeServer';

vi.mock('../src/client/api', async (original) => {
  const actual = await original<typeof import('../src/client/api')>();
  const { makeFakeApi } = await import('./fakeServer');
  return { ...actual, api: makeFakeApi(actual.ApiError) };
});

const { contentOf, isDirty, useStore } = await import('../src/client/store');

const A = '<?xml version="1.0" encoding="UTF-8"?>\n<root BTCPP_format="4" main_tree_to_execute="A">\n'
  + '  <BehaviorTree ID="A">\n    <AlwaysSuccess/>\n  </BehaviorTree>\n</root>\n';
const B = A.replaceAll('"A"', '"B"');

const s = () => useStore.getState();
const file = (path: string) => s().files[path];
/** Sets an attribute of the root node of the file's first tree. */
const setName = (path: string, name: string, key?: string) =>
  s().edit(path, (doc) => setAttr(trees(doc)[0].children[0], 'name', name), key);
const nameOf = (path: string) => trees(file(path).doc!)[0].children[0].attrs.name;

beforeEach(async () => {
  resetServer({ 'a.xml': A, 'b.xml': B });
  useStore.setState({ root: '', files: {}, selection: {}, back: [], forward: [], toasts: [] });
  await s().load();
});

describe('loading', () => {
  it('reads every file with its ETag, and opens the first tree', () => {
    expect(Object.keys(s().files)).toEqual(['a.xml', 'b.xml']);
    expect(file('a.xml').etag).toBe(etagOf(A));
    expect(isDirty(file('a.xml'))).toBe(false);
    expect(s().selection.file).toBe('a.xml');
  });

  it('keeps unsaved edits, and warns when their file changed on disk', async () => {
    setName('a.xml', 'mine');
    disk.set('a.xml', A.replace('AlwaysSuccess', 'AlwaysFailure'));
    disk.set('b.xml', B.replace('AlwaysSuccess', 'AlwaysFailure'));
    await s().load();
    expect(nameOf('a.xml')).toBe('mine');
    // Still based on the version it was loaded from, so that saving will ask.
    expect(file('a.xml').etag).toBe(etagOf(A));
    expect(contentOf(file('b.xml'))).toContain('AlwaysFailure');
    expect(s().toasts.at(-1)?.message).toMatch(/Changed on disk: a\.xml/);
  });

  it('keeps the unsaved edits of a file deleted on disk', async () => {
    setName('a.xml', 'mine');
    disk.delete('a.xml');
    await s().load();
    expect(nameOf('a.xml')).toBe('mine');
  });

  it('does not mix the files of a folder opened in another tab with unsaved edits', async () => {
    setName('a.xml', 'mine');
    server.root = '/elsewhere';
    disk.set('a.xml', 'other folder');
    await s().load();
    expect(s().root).toBe('/robot/behaviors');
    expect(nameOf('a.xml')).toBe('mine');
    expect(s().toasts.at(-1)?.message).toMatch(/open \/robot\/behaviors again/);
  });

  it('keeps unsaved edits when the folder already open is opened again', async () => {
    setName('a.xml', 'mine');
    await s().openFolder('/robot/behaviors');
    expect(nameOf('a.xml')).toBe('mine');
    await s().openFolder('/elsewhere');
    expect(s().root).toBe('/elsewhere');
    expect(isDirty(file('a.xml'))).toBe(false);
  });
});

describe('editing', () => {
  it('undoes and redoes whole edits', () => {
    setName('a.xml', 'one');
    setName('a.xml', 'two');
    s().undo('a.xml');
    expect(nameOf('a.xml')).toBe('one');
    s().undo('a.xml');
    expect(nameOf('a.xml')).toBeUndefined();
    expect(isDirty(file('a.xml'))).toBe(false);
    s().redo('a.xml');
    expect(nameOf('a.xml')).toBe('one');
  });

  it('makes one undo step of consecutive edits with the same key', () => {
    setName('a.xml', 'o', 'name');
    setName('a.xml', 'on', 'name');
    setName('a.xml', 'one', 'name');
    expect(file('a.xml').past).toHaveLength(1);
    s().undo('a.xml');
    expect(nameOf('a.xml')).toBeUndefined();
  });

  it('records nothing when the change finds nothing to do', () => {
    s().edit('a.xml', () => false);
    expect(file('a.xml').past).toHaveLength(0);
  });

  it('never changes a stored document in place', () => {
    const before = file('a.xml').doc;
    setName('a.xml', 'one');
    expect(file('a.xml').doc).not.toBe(before);
    expect(trees(before!)[0].children[0].attrs.name).toBeUndefined();
  });
});

describe('saving', () => {
  it('saves over the version loaded, and takes the new ETag', async () => {
    setName('a.xml', 'mine');
    expect(await s().save('a.xml')).toEqual({ status: 'saved' });
    expect(disk.get('a.xml')).toContain('name="mine"');
    expect(file('a.xml').etag).toBe(etagOf(disk.get('a.xml')!));
    expect(isDirty(file('a.xml'))).toBe(false);
  });

  it('reports a conflict when the file changed on disk, and overwrites it only when asked', async () => {
    setName('a.xml', 'mine');
    disk.set('a.xml', 'by hand');
    const result = await s().save('a.xml');
    expect(result).toEqual({ status: 'conflict', message: 'a.xml was changed on disk', etag: etagOf('by hand') });
    expect(disk.get('a.xml')).toBe('by hand');
    expect(isDirty(file('a.xml'))).toBe(true);

    expect(await s().save('a.xml', etagOf('by hand'))).toEqual({ status: 'saved' });
    expect(disk.get('a.xml')).toContain('name="mine"');
  });

  it('creates a new file only if nobody created it meanwhile', async () => {
    s().createFile('new.xml', 'New');
    disk.set('new.xml', 'someone else');
    expect((await s().save('new.xml')).status).toBe('conflict');
    disk.delete('new.xml');
    expect((await s().save('new.xml')).status).toBe('saved');
    expect(file('new.xml').isNew).toBe(false);
  });

  it('reverts a file to its content on disk', async () => {
    setName('a.xml', 'mine');
    disk.set('a.xml', A.replace('AlwaysSuccess', 'AlwaysFailure'));
    await s().revert('a.xml');
    expect(isDirty(file('a.xml'))).toBe(false);
    expect(contentOf(file('a.xml'))).toContain('AlwaysFailure');
  });

  it('deletes a file only if it did not change on disk', async () => {
    disk.set('b.xml', 'by hand');
    await s().deleteFile('b.xml');
    expect(file('b.xml')).toBeDefined();
    expect(fakeApi.remove).toHaveBeenCalledWith('b.xml', etagOf(B));
    await s().load();
    await s().deleteFile('b.xml');
    expect(file('b.xml')).toBeUndefined();
    expect(disk.has('b.xml')).toBe(false);
  });
});

describe('navigation', () => {
  it('goes back and forward between the trees opened', () => {
    const a = s().selection;
    s().selectFile('b.xml');
    s().goBack();
    expect(s().selection).toEqual(a);
    s().goForward();
    expect(s().selection.file).toBe('b.xml');
  });
});
