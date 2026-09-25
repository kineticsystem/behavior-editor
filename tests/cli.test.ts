import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(__dirname, '..');

function validate(...args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((done) => {
    execFile(join(REPO, 'node_modules/.bin/tsx'), ['src/cli/validate.ts', ...args, '--editor-only'], { cwd: REPO },
      (error, stdout) => done({ code: error ? Number(error.code) : 0, stdout }));
  });
}

describe('the command line validator', () => {
  it('succeeds on valid behaviors', async () => {
    const { code, stdout } = await validate('behaviors');
    expect(code).toBe(0);
    expect(stdout).toMatch(/0 errors, 0 warnings/);
  }, 20_000);

  it('fails on errors, and reports them as JSON when asked', async () => {
    const { code, stdout } = await validate('tests/fixtures/broken', '--json');
    expect(code).toBe(1);
    const report = JSON.parse(stdout) as { files: string[]; issues: { file: string; severity: string }[] };
    expect(report.files).toEqual(['bad.xml', 'syntax.xml']);
    expect(report.issues.filter((i) => i.severity === 'error').length).toBeGreaterThan(0);
  }, 20_000);
});
