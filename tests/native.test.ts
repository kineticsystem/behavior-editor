import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { nativeBuiltins, validateNative } from '../src/server/native';

const FAKE = join(__dirname, 'fixtures/fake-validator/btcpp_validate');

describe('the native validator', () => {
  afterEach(() => {
    delete process.env.BTCPP_VALIDATOR;
  });

  it('is unavailable when not built', async () => {
    process.env.BTCPP_VALIDATOR = '/nonexistent';
    expect(await validateNative([{ path: 'a.xml', content: '' }])).toEqual({ available: false, issues: [] });
    expect(await nativeBuiltins()).toBeUndefined();
  });

  it('reports its findings on the files as the editor names them', async () => {
    process.env.BTCPP_VALIDATOR = FAKE;
    const result = await validateNative([{
      path: 'sub/a.xml',
      content: '<root BTCPP_format="4"><TreeNodesModel><Action ID="MoveTo"/></TreeNodesModel></root>',
    }]);
    expect(result.available).toBe(true);
    expect(result.issues).toEqual([{
      severity: 'error', file: 'sub/a.xml', tree: 'T', message: 'Cannot load sub/a.xml; models: MoveTo', source: 'btcpp',
    }]);
    // Anything else it prints is kept, for a crash to be seen.
    expect(result.output).toBe('not json');
  });

  it('reports the built-in nodes, with the descriptions of the fallback list', async () => {
    process.env.BTCPP_VALIDATOR = FAKE;
    const builtins = await nativeBuiltins();
    expect(builtins?.map((m) => m.id)).toEqual(['Sequence', 'Repeat']);
    expect(builtins?.[0]).toMatchObject({ builtin: true, description: expect.stringContaining('Ticks children in order') });
    expect(builtins?.[1].ports[0].description).toMatch(/Repeat a successful child/);
  });
});
