// SPDX-License-Identifier: MIT
// A shallow clone (git clone --depth, most CI checkouts) cannot push to another repository: git says "shallow update not allowed".
// The push-stage probe used to read that as "a pre-push gate is red at baseline" (PARTIAL) on a project that has no hook at all (seen on express and
// six other projects scanned shallowly, 2026-10-09). It must say UNDETERMINABLE and why.
// Run: node --test tools/gs-check/test/shallow.test.mjs
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const CHECK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'gs-check.mjs');
const clean = { ...process.env }; for (const k of Object.keys(clean)) if (/^GIT_(DIR|INDEX_FILE|WORK_TREE|PREFIX)$/.test(k)) delete clean[k];

// F-001.10
test('a shallow clone: the push-stage probe says UNDETERMINABLE and names the shallow clone, not a red pre-push gate', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gscheck-shallow-'));
  const full = path.join(base, 'full'), shallow = path.join(base, 'shallow');
  const g = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8', env: clean });
  const w = (p, t) => { fs.mkdirSync(path.dirname(path.join(full, p)), { recursive: true }); fs.writeFileSync(path.join(full, p), t); };
  try {
    fs.mkdirSync(full);
    w('README.md', '# Tiny\n\nA tiny project.\n');
    w('package.json', JSON.stringify({ name: 'tiny', version: '1.0.0', scripts: { test: 'node --test test/' } }));
    w('test/a.test.mjs', "import test from 'node:test';\nimport assert from 'node:assert';\ntest('a', () => assert.ok(true));\ntest('b', () => assert.ok(true));\ntest('c', () => assert.ok(true));\n");
    g(full, 'init', '-q', '-b', 'main'); g(full, 'add', '-A');
    for (const m of ['feat: tiny project', 'docs: second', 'docs: third']) { fs.appendFileSync(path.join(full, 'README.md'), `\n${m}\n`); g(full, 'add', '-A'); g(full, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', m); }
    const c = g(base, 'clone', '-q', '--depth', '1', pathToFileURL(full).href, shallow);
    assert.strictEqual(c.status, 0, c.stderr);
    assert.match(g(shallow, 'rev-parse', '--is-shallow-repository').stdout, /true/);
    const r = spawnSync(process.execPath, [CHECK, '--repo', shallow, '--strict', '--only', 'E05', '--run-on-host', '--i-trust-this-repo'], { encoding: 'utf8', timeout: 240000, env: { ...clean, CI: 'true' } });
    const out = r.stdout + r.stderr;
    assert.match(out, /E05 UNDETERMINABLE/, out);
    assert.match(out, /shallow clone/);
    assert.ok(!/pre-push gate is red at baseline/.test(out), out);
  } finally { fs.rmSync(base, { recursive: true, force: true, maxRetries: 3 }); }
});
