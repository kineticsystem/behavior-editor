import { describe, expect, it } from 'vitest';
import { isDisabled, setDisabled } from '../src/shared/treeOps';
import type { BTNode } from '../src/shared/types';

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
