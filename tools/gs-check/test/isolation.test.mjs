// SPDX-License-Identifier: MIT
// Tests of the isolation of gs-check: by default the project's own install steps, hooks and tests run in a throwaway container, never silently on the host.
//   F-008.1 refusal without Docker and without the host flags, F-008.2 both flags and a typed name, F-008.3 the fast path inside a container,
//   F-008.4 same verdicts in the container, F-008.5 a malicious project is contained, F-008.6 network off by default and a read-only copy.
// The tests that need Docker are skipped when it is not running (the Windows CI job has no Linux containers); the refusal tests always run.
// Run: node --test tools/gs-check/test/isolation.test.mjs
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildVariant, cleanup } from './build-fixtures.mjs';
import variants from './variants.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'gs-check.mjs');
const baseEnv = () => { const e = { ...process.env, GS_CHECK_PRETEND_HOST: '1' }; for (const k of ['NODE_TEST_CONTEXT', 'NODE_OPTIONS', 'GS_CHECK_IN_CONTAINER', 'CI', 'SECRET_TOKEN']) delete e[k]; return e; };
const cli = (args, { env = {}, input = '', timeout = 900000 } = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...baseEnv(), ...env }, input, timeout, maxBuffer: 1 << 26 });
const dockerUp = (() => { const r = spawnSync('docker', ['info', '--format', '{{.OSType}}'], { encoding: 'utf8', timeout: 20000 }); return r.status === 0 && /linux/.test(r.stdout); })();
const statuses = out => Object.fromEntries([...out.matchAll(/^(E\d\d) (PASS|PARTIAL|ABSENT|UNDETERMINABLE)\b/gm)].map(m => [m[1], m[2]]));

// the malicious project: its README install step and its test try to write outside the clone, in the home folder, and to read the environment
const SECRET = 'hunter2-secret-token';
function evilProject(canaryDir) {
  const abs = path.join(canaryDir, 'canary-absolute.txt'), rel = path.join(canaryDir, 'canary-relative.txt');
  const v = {
    id: 'EVIL', kind: 'good', target: null, desc: 'malicious: install step and test try to escape', expect: {},
    mutate(dir, h) {
      h.write(dir, 'scripts/evil.js', [
        "const fs = require('fs'), os = require('os'), path = require('path');",
        `const tries = [${JSON.stringify(abs)}, path.join(__dirname, '..', '..', '..', '..', 'canary-relative.txt'), ${JSON.stringify(rel)}, path.join(os.homedir(), 'gs-home-canary.txt')];`,
        "for (const t of tries) { try { fs.writeFileSync(t, 'owned'); } catch (e) { /* contained */ } }",
        "console.log('LEAK[' + (process.env.SECRET_TOKEN || '') + '] HOME[' + os.homedir() + ']');",
        ''].join('\n'));
      h.write(dir, 'tests/evil.test.js', "const test = require('node:test'); test('evil', () => { require('../scripts/evil.js'); });\n");
      h.replace(dir, 'README.md', 'npm install\n', 'npm install\nnode scripts/evil.js\n');
    }
  };
  return { v, abs, rel };
}

// F-008.1
test('without Docker and without the host flags, gs-check refuses in plain words and runs nothing', () => {
  const canary = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-canary-')); const { v, abs } = evilProject(canary); const dir = buildVariant(v);
  try {
    const r = cli(['--repo', dir, '--strict'], { env: { GS_CHECK_PRETEND_NO_DOCKER: '1' } });
    assert.strictEqual(r.status, 2, r.stdout + r.stderr);
    const text = r.stdout + r.stderr;
    assert.match(text, /Install Docker/); assert.match(text, /--run-on-host --i-trust-this-repo/); assert.match(text, /will not run this on your machine/);
    assert.ok(!/^E01 /m.test(text), 'no item was judged');
    assert.ok(!fs.existsSync(abs), 'the project code did not run');
  } finally { cleanup(dir); fs.rmSync(canary, { recursive: true, force: true }); }
});

// F-008.2
test('host mode needs both flags, and a typed repository name unless CI=true', () => {
  const canary = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-canary-')); const { v, abs } = evilProject(canary); const dir = buildVariant(v);
  try {
    for (const only of [['--run-on-host'], ['--i-trust-this-repo']]) {
      const r = cli(['--repo', dir, '--strict', ...only]); assert.strictEqual(r.status, 2); assert.match(r.stderr, /needs BOTH flags/);
    }
    const wrong = cli(['--repo', dir, '--strict', '--run-on-host', '--i-trust-this-repo'], { input: 'yes\n' });
    assert.strictEqual(wrong.status, 2, wrong.stdout + wrong.stderr); assert.match(wrong.stderr, /WARNING: RUNNING ON THIS MACHINE/); assert.match(wrong.stderr, /did not match/);
    const none = cli(['--repo', dir, '--strict', '--run-on-host', '--i-trust-this-repo'], { input: '' });
    assert.strictEqual(none.status, 2);
    assert.ok(!fs.existsSync(abs), 'nothing ran on the host');
  } finally { cleanup(dir); fs.rmSync(canary, { recursive: true, force: true }); }
});

test('host mode with the right name (stdin) or CI=true runs, prints the warning, and the report says it was on the host', () => {
  const dir = buildVariant(variants.find(x => x.id === 'R13')); // small and quick: no README
  try {
    const name = path.basename(dir);
    const a = cli(['--repo', dir, '--only', 'E01', '--run-on-host', '--i-trust-this-repo'], { input: name + '\n' });
    assert.match(a.stderr, /WARNING: RUNNING ON THIS MACHINE/); assert.ok(/^E01 /m.test(a.stdout), a.stdout + a.stderr);
    const out = path.join(dir, '..', path.basename(dir) + '-report.json');
    const b = cli(['--repo', dir, '--only', 'E01', '--run-on-host', '--i-trust-this-repo', '--out', out], { env: { CI: 'true' } });
    assert.match(b.stderr, /CI=true: continuing/); assert.strictEqual(JSON.parse(fs.readFileSync(out, 'utf8')).isolation, 'host-trusted'); fs.rmSync(out, { force: true });
  } finally { cleanup(dir); }
});

// F-008.3
test('already inside a container, the fast path runs directly (the tools\' own CI)', () => {
  const dir = buildVariant(variants.find(x => x.id === 'R13'));
  try {
    const e = baseEnv(); delete e.GS_CHECK_PRETEND_HOST;
    const r = spawnSync(process.execPath, [CLI, '--repo', dir, '--only', 'E01'], { encoding: 'utf8', env: { ...e, GS_CHECK_IN_CONTAINER: '1' } });
    assert.ok(/^E01 /m.test(r.stdout), r.stdout + r.stderr);
  } finally { cleanup(dir); }
});

// F-008.4
for (const id of ['G1', 'G3', 'GS1', 'B05', 'B14', 'R01']) {
  test(`container mode gives the same verdicts as host mode on ${id}`, { skip: !dockerUp && 'Docker with Linux containers is not running', timeout: 1500000 }, () => {
    const dir = buildVariant(variants.find(x => x.id === id));
    try {
      const c = cli(['--repo', dir, '--strict'], { env: { CI: 'true' } }); // CI=true must NOT matter for the container: it is not passed in
      assert.match(c.stderr, /isolation: container/); assert.match(c.stdout, /repo=\/tmp\/repo/);
      const host = cli(['--repo', dir, '--strict', '--run-on-host', '--i-trust-this-repo'], { env: { CI: 'true' } });
      assert.strictEqual(c.status, host.status, 'same exit code');
      assert.deepStrictEqual(statuses(c.stdout), statuses(host.stdout));
      assert.strictEqual(Object.keys(statuses(c.stdout)).length, 12);
    } finally { cleanup(dir); }
  });
}

// F-008.5
test('a malicious project is contained in the container: no canary on the host, no environment variable seen', { skip: !dockerUp && 'Docker with Linux containers is not running', timeout: 1500000 }, () => {
  const canary = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-canary-')); const { v, abs, rel } = evilProject(canary); const dir = buildVariant(v);
  const report = path.join(canary, 'report.json'); const home = path.join(os.homedir(), 'gs-home-canary.txt');
  fs.rmSync(home, { force: true });
  try {
    const c = cli(['--repo', dir, '--strict', '--verbose', '--out', report], { env: { SECRET_TOKEN: SECRET } });
    const seen = c.stdout + c.stderr + (fs.existsSync(report) ? fs.readFileSync(report, 'utf8') : '');
    assert.match(c.stderr, /isolation: container/); assert.ok(fs.existsSync(report), 'the report came out of the container');
    assert.ok(!fs.existsSync(abs), 'absolute canary not created on the host'); assert.ok(!fs.existsSync(rel), 'relative canary not created on the host');
    assert.ok(!fs.existsSync(home), 'nothing written in the home folder'); assert.ok(!fs.existsSync(path.join(dir, '..', 'canary-relative.txt')));
    assert.ok(!seen.includes(SECRET), 'the host environment variable was not visible to the project');
    assert.ok(!seen.includes(os.homedir()), 'the host home folder was not visible');
    // the control: the same project on the host DOES write the canaries and see the variable, so the probe above could have caught a leak
    const host = cli(['--repo', dir, '--strict', '--verbose', '--run-on-host', '--i-trust-this-repo'], { env: { SECRET_TOKEN: SECRET, CI: 'true' } });
    assert.ok(fs.existsSync(abs), 'positive control: the project does write outside its clone when it runs on the host');
    assert.ok((host.stdout + host.stderr).includes(SECRET) || fs.existsSync(home) || fs.existsSync(rel), 'positive control: it also reached the host environment or home');
  } finally { fs.rmSync(home, { force: true }); cleanup(dir); fs.rmSync(canary, { recursive: true, force: true }); }
});

// F-008.6
test('the network is off by default and the copy is read-only (a project cannot change the host copy)', { skip: !dockerUp && 'Docker with Linux containers is not running', timeout: 600000 }, () => {
  const dir = buildVariant(variants.find(x => x.id === 'R13'));
  try {
    const c = cli(['--repo', dir, '--only', 'E01'], {});
    assert.match(c.stderr, /network none/);
    const n = cli(['--repo', dir, '--only', 'E01', '--allow-network'], {});
    assert.match(n.stderr, /network ALLOWED/);
    assert.strictEqual(spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).stdout.trim(), '', 'the original is untouched');
  } finally { cleanup(dir); }
});
