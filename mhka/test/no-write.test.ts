/**
 * The hard constraint, asserted mechanically.
 *
 *   The tool NEVER writes to Notion. Not once. Not "safe fixes". Not with a
 *   --force flag.
 *
 * This test greps the compiled bundle for the Notion write methods. If any
 * appears, the build fails. It is stated in the brief twice — once at the top
 * and once in "what not to build" — because a write path is the thing most
 * likely to get added later "just for convenience".
 *
 * If this test is failing for you: the fix is to remove the write call, not to
 * relax the test. The whole value of the corpus is that nobody changed it
 * quietly, and an automated corrector is exactly the thing that would.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const SRC = join(ROOT, 'src');

/** Notion client methods that mutate. */
const WRITE_METHODS = [
  'pages.update',
  'pages.create',
  'blocks.children.append',
  'blocks.update',
  'blocks.delete',
  'databases.update',
  'databases.create',
  'comments.create',
];

function walk(dir: string, ext: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (name.endsWith(ext)) out.push(p);
  }
  return out;
}

describe('no write path exists', () => {
  beforeAll(() => {
    // Build if there is no dist yet, so the assertion is against compiled
    // output rather than only the sources.
    if (!existsSync(DIST)) {
      execSync('npx tsc', { cwd: ROOT, stdio: 'inherit' });
    }
  });

  it('the compiled bundle contains no Notion write method', () => {
    const files = walk(DIST, '.js');
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const method of WRITE_METHODS) {
        // The literal appears in this test's own vocabulary and in the
        // read-client's explanatory comment; comments are stripped from the
        // emitted JS, so a hit in dist is a real call.
        if (text.includes(method)) {
          offenders.push(`${file}: ${method}`);
        }
      }
    }

    expect(offenders, `Notion write methods found in the build:\n${offenders.join('\n')}`).toEqual(
      []
    );
  });

  it('the sources contain no Notion write method outside comments', () => {
    const files = walk(SRC, '.ts');
    const offenders: string[] = [];

    for (const file of files) {
      const raw = readFileSync(file, 'utf8');
      // Strip block and line comments before searching, so the read-client's
      // documentation of what it refuses to do does not trip its own test.
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const method of WRITE_METHODS) {
        if (code.includes(method)) offenders.push(`${file}: ${method}`);
      }
    }

    expect(offenders, `Notion write methods in source:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no --fix or --force flag is offered anywhere', () => {
    const files = walk(SRC, '.ts');
    const offenders: string[] = [];
    for (const file of files) {
      const raw = readFileSync(file, 'utf8');
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      if (/\.option\(\s*['"`]--(fix|force|write|apply|repair)/.test(code)) {
        offenders.push(file);
      }
    }
    expect(offenders, `A mutating CLI flag was added in:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('only .cache, snapshots and reports are ever written to', () => {
    const files = walk(SRC, '.ts');
    const allowed = /\.cache|snapshots|reports|config\.paths\./;
    const offenders: string[] = [];

    for (const file of files) {
      const raw = readFileSync(file, 'utf8');
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      // Every writeFileSync call should have a path derived from a config path
      // or one of the three permitted directories.
      for (const m of code.matchAll(/writeFileSync\(([^)]*)\)/g)) {
        const args = m[1] ?? '';
        if (!allowed.test(args) && !/path|dir|out/i.test(args)) {
          offenders.push(`${file}: writeFileSync(${args.slice(0, 60)})`);
        }
      }
    }
    expect(offenders, `Unexpected write target:\n${offenders.join('\n')}`).toEqual([]);
  });
});
