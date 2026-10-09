// SPDX-License-Identifier: MIT
// A project whose readme is named Readme.md (not README.md): the clean-commit probe must edit the real file and stage it.
// On a case-insensitive file system (Windows, macOS) the checker used to name README.md, `git add` did not stage the edit, and the baseline commit
// was reported "blocked" on a project that has no hook at all (seen on express, 2026-10-09). On Linux this test passes with or without the fix.
// Run: node --test tools/gs-check/test/readme-case.test.mjs
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const CHECK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'gs-check.mjs');

// F-001.7, F-001.9
test('a Readme.md project with tests and no hook: the baseline commit is not reported as blocked', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gscheck-readmecase-'));
  const w = (p, t) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), t); };
  w('Readme.md', '# Tiny\n\nA tiny project.\n');
  w('package.json', JSON.stringify({ name: 'tiny', version: '1.0.0', scripts: { test: 'node --test test/' } }));
  w('test/a.test.mjs', "import test from 'node:test';\nimport assert from 'node:assert';\ntest('a', () => assert.ok(true));\ntest('b', () => assert.ok(true));\ntest('c', () => assert.ok(true));\n");
  const g = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_DIR: undefined, GIT_INDEX_FILE: undefined, GIT_WORK_TREE: undefined } });
  try {
    g('init', '-q', '-b', 'main'); g('add', '-A');
    g('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'feat: tiny project');
    const r = spawnSync(process.execPath, [CHECK, '--repo', dir, '--strict', '--only', 'E05'], { encoding: 'utf8', timeout: 240000 });
    const out = r.stdout + r.stderr;
    assert.ok(!/baseline block|clean docs-only commit is blocked/.test(out), out);
    assert.match(out, /E05 /);
    assert.match(out, /the summary counts elements by status; it is not a grade of the project/);
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); }
});
