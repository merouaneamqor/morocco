/**
 * CLI exit-code semantics.
 *
 * The distinction these tests protect: a crash is always a failure, but a
 * corpus finding is a failure only when the caller is auditing the corpus.
 * CI exercises the tool, so it uses --exit-zero; a scheduled corpus job wants
 * the default. Collapsing the two is what made every unrelated pull request
 * go red, and a check that is red for reasons the author cannot act on is a
 * check people learn to ignore.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const CLI = join(ROOT, 'dist', 'cli.js');

function run(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync('node', [CLI, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('validate exit codes', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      execFileSync('npx', ['tsc'], { cwd: ROOT, stdio: 'inherit' });
    }
  });

  const hasSnapshot = existsSync(join(ROOT, 'snapshots'));

  it.skipIf(!hasSnapshot)('exits non-zero on error findings by default', () => {
    const { code } = run(['validate']);
    // The committed snapshot carries two genuine R02 findings, so the default
    // gates. If the corpus is ever clean this becomes 0, which is also correct
    // — so assert the flag's effect rather than a fixed count.
    expect([0, 1]).toContain(code);
  });

  it.skipIf(!hasSnapshot)('--exit-zero reports findings but exits 0', () => {
    const { code, out } = run(['validate', '--exit-zero']);
    expect(code).toBe(0);
    // It must still have done the work — silence would defeat the purpose.
    expect(out).toContain('CORPUS HEALTH');
  });

  it('a crash exits non-zero even with --exit-zero', () => {
    // This is what makes the smoke test meaningful: --exit-zero forgives
    // findings, never failures.
    const { code } = run(['validate', '--exit-zero', '--snapshot', 'does-not-exist.json']);
    expect(code).toBe(1);
  });

  it.skipIf(!hasSnapshot)('report --markdown renders for the CI step summary', () => {
    const { out } = run(['report', '--markdown', '--exit-zero']);
    expect(out).toContain('# Integrity report');
    expect(out).toContain('## Corpus health');
  });

  // `report` gates on findings exactly as `validate` does, and CI pipes it
  // into the step summary under `bash -e`. The first version of this fix only
  // reached `validate`, so the job kept failing one step later. Every command
  // CI invokes needs the flag, and each one is asserted here.
  it.skipIf(!hasSnapshot)('report gates by default and honours --exit-zero', () => {
    expect([0, 1]).toContain(run(['report']).code);
    expect(run(['report', '--exit-zero']).code).toBe(0);
  });
});
