// SPDX-License-Identifier: MIT
// The checker runs README and default install steps of the project under test. For a Python project those steps used to run `pip install` in the Python of
// the machine that runs the checker (a scan of 47 projects added about twenty packages to a virtual environment that belongs to another tool).
// Now every command the checker starts has PIP_REQUIRE_VIRTUALENV=true, and a Python project gets a virtual environment of its own in the throwaway folder.
// Run: node --test tools/gs-check/test/python-isolation.test.mjs
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { internals, defaultConfig as cfg } from '../gs-check.mjs';

const hasPython = ['python3', 'python'].some(p => spawnSync(p, ['-m', 'venv', '--help'], { encoding: 'utf8' }).status === 0);

// F-001.11
test('every command the checker starts carries PIP_REQUIRE_VIRTUALENV, so pip refuses to install outside a virtual environment', () => {
  assert.strictEqual(internals.util.cleanEnv().PIP_REQUIRE_VIRTUALENV, 'true');
});

// F-001.11
test('a Python project is run in a virtual environment inside the throwaway folder, not in the Python of this machine', { skip: !hasPython }, () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'gscheck-pyiso-src-'));
  fs.writeFileSync(path.join(src, 'requirements.txt'), '# nothing to install\n');
  fs.writeFileSync(path.join(src, 'README.md'), '# P\n');
  const clean = { ...process.env }; for (const k of Object.keys(clean)) if (/^GIT_(DIR|INDEX_FILE|WORK_TREE|PREFIX)$/.test(k)) delete clean[k];
  const g = (...a) => spawnSync('git', a, { cwd: src, encoding: 'utf8', env: clean });
  g('init', '-q', '-b', 'main'); g('add', '-A'); g('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'feat: p');
  const before = { VIRTUAL_ENV: process.env.VIRTUAL_ENV, PATH: process.env.PATH };
  const sbx = new internals.sandbox.Sandbox(src, cfg, 'pyiso');
  try {
    assert.ok(sbx.clone().ok);
    const r = sbx.run('python -c "import sys; print(sys.prefix)"', 60000);
    assert.strictEqual(r.code, 0, r.out);
    assert.ok(r.out.replace(/\\/g, '/').includes(path.basename(sbx.dir) + '/fx1venv'), r.out);
    assert.strictEqual(process.env.VIRTUAL_ENV, before.VIRTUAL_ENV); // the checker's own environment is not touched
    assert.strictEqual(process.env.PATH, before.PATH);
  } finally {
    fs.rmSync(sbx.dir, { recursive: true, force: true, maxRetries: 3 });
    fs.rmSync(src, { recursive: true, force: true, maxRetries: 3 });
  }
});
