import { describe, expect, it } from 'vitest';
import { safePath } from '../src/server/api';

describe('safePath', () => {
  it('resolves files inside the root', () => {
    expect(safePath('/data', 'a/b.xml')).toBe('/data/a/b.xml');
  });

  it.each([['../x.xml'], ['/etc/x.xml'], ['a/../../x.xml'], ['a.txt'], ['']])('refuses %j', (path) => {
    expect(() => safePath('/data', path)).toThrow();
  });
});
