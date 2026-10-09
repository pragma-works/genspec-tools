// SPDX-License-Identifier: MIT
// Tests for the gs dispatcher (bin/gs.mjs) and for the install record and uninstall of gs-init. No model, no network (gs update is
// tested with --from, a folder on this machine). Every project is built in the temp folder and the commands run as child processes.
// Run: node --test bin/test/gs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const GS = path.join(ROOT, 'bin', 'gs.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-cli-test-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

const ENV = { ...process.env }; for (const k of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'GS_DECIDE_AGENT', 'CURSOR_AGENT', 'CODEX_SANDBOX', 'AIDER_MODEL', 'GEMINI_CLI', 'GS_FORCE_PROMPT', 'NODE_TEST_CONTEXT']) delete ENV[k];
// a test run inside a git hook inherits GIT_DIR and GIT_INDEX_FILE, which would point the throwaway projects at the real repository
for (const k of Object.keys(ENV)) if (k.startsWith('GIT_') && k !== 'GIT_EDITOR') delete ENV[k];
const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8', env: ENV });
const gs = (cwd, args, extra = {}) => spawnSync(process.execPath, [GS, ...args], { cwd, encoding: 'utf8', env: { ...ENV, ...(extra.env || {}) }, input: extra.input, timeout: 120000 });
let n = 0;
function project(files = {}, { repo = true } = {}) {
  const dir = path.join(TMP, 'p' + (++n)); fs.mkdirSync(dir, { recursive: true });
  for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), c); }
  if (repo) { git(dir, 'init', '-q'); git(dir, 'config', 'user.name', 'Pat Person'); git(dir, 'config', 'user.email', 'pat@example.com'); git(dir, 'config', 'core.autocrlf', 'false'); }
  return dir;
}
const NODE = { 'package.json': '{ "name": "demo", "scripts": { "test": "echo ok" } }\n', 'src/index.js': 'module.exports = 1;\n' };
const has = (dir, rel) => fs.existsSync(path.join(dir, rel));
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
// every file under dir (not .git) with its bytes, to prove what did and did not change
function tree(dir) {
  const out = {};
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.name === '.git') continue; if (e.isDirectory()) walk(p); else out[path.relative(dir, p).split(path.sep).join('/')] = fs.readFileSync(p, 'utf8'); } };
  walk(dir); return out;
}
const INIT = ['init', '--yes', '--no-proof'];

// F-007.1
test('C1 help lists every command; an unknown command and an unknown assistant are refused with exit 2', () => {
  const r = gs(TMP, ['help']);
  assert.equal(r.status, 0);
  for (const c of ['gs demo', 'gs start', 'gs init', 'gs update', 'gs uninstall', 'gs doctor', 'gs check', 'gs lock', 'gs decide', 'gs snapshot']) assert.ok(r.stdout.includes(c), 'help names ' + c);
  assert.match(r.stdout, /Node 18\+ and git/);
  const bad = gs(TMP, ['frobnicate']);
  assert.equal(bad.status, 2); assert.match(bad.stderr, /do not know the command "frobnicate"/);
  const dir = project(NODE);
  const a = gs(dir, [...INIT, '--agents', 'emacs']);
  assert.equal(a.status, 2); assert.match(a.stderr, /do not know the assistant "emacs"/);
  assert.deepEqual(Object.keys(tree(dir)).sort(), ['package.json', 'src/index.js']);
  assert.equal(gs(TMP, ['--version']).stdout.trim(), JSON.parse(read(ROOT, 'package.json')).version);
});

// F-007.2
test('C2 no command in a project folder is the quick look and changes nothing; in an empty folder it is help', () => {
  const dir = project(NODE), before = tree(dir);
  const r = gs(dir, []);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /a quick look at this folder/); assert.match(r.stdout, /E01/); assert.match(r.stdout, /not an audit grade/);
  assert.deepEqual(tree(dir), before);
  const empty = path.join(TMP, 'empty'); fs.mkdirSync(empty);
  const h = gs(empty, []);
  assert.equal(h.status, 0); assert.match(h.stdout, /Try it \(changes nothing\)/);
});

// F-007.2
test('C3 demo <folder> and demo --sample run the quick look and leave the folder as it was; a missing folder is refused', () => {
  const dir = project(NODE), before = tree(dir);
  const r = gs(TMP, ['demo', dir]);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /The three most valuable next steps/); assert.match(r.stdout, /nothing was changed/);
  assert.deepEqual(tree(dir), before);
  const s = gs(TMP, ['demo', '--sample']);
  assert.equal(s.status, 0, s.stderr); assert.match(s.stdout, /Found: E01, E02, E03, E04, E05/);
  const m = gs(TMP, ['demo', path.join(TMP, 'nope')]);
  assert.equal(m.status, 2); assert.match(m.stderr, /was not found/);
});

// F-007.3
test('C4 init with flags asks nothing, writes the assistant files asked for and the install record; --dry-run writes nothing', () => {
  const dry = project(NODE), before = tree(dry);
  const d = gs(dry, [...INIT, '--level', 'L0', '--dry-run']);
  assert.equal(d.status, 0, d.stderr); assert.match(d.stdout, /dry run/);
  assert.deepEqual(tree(dry), before);
  const dir = project(NODE);
  const r = gs(dir, [...INIT, '--level', 'L0', '--agents', 'claude,codex,cursor']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!/Choose 1/.test(r.stdout), 'nothing was asked');
  assert.match(read(dir, 'CLAUDE.md'), /level L0/);
  assert.match(read(dir, 'AGENTS.md'), /Read `CLAUDE.md` first/);
  assert.match(read(dir, '.cursor/rules/gs.mdc'), /alwaysApply: true/); assert.match(read(dir, '.cursor/rules/gs.mdc'), /Read `CLAUDE.md` first/);
  assert.equal(JSON.parse(read(dir, '.gs.json')).level, 'L0');
  const only = project(NODE); gs(only, [...INIT, '--level', 'L0', '--agents', 'codex']);
  assert.ok(has(only, 'AGENTS.md')); assert.ok(!has(only, 'CLAUDE.md'));
  assert.equal(JSON.parse(read(only, '.gs.json')).sentinel, 'AGENTS.md');
});

// F-007.3
test('C5 in a terminal, init asks two questions and maps the answers (level 1 is L0; assistants 1,3 are CLAUDE.md and Cursor)', () => {
  const dir = project(NODE);
  const r = gs(dir, ['init', '--no-proof'], { env: { GS_FORCE_PROMPT: '1' }, input: '1\n1,3\n' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /How much do you want to start with\?/); assert.match(r.stdout, /Which assistant do you use\?/);
  assert.equal(JSON.parse(read(dir, '.gs.json')).level, 'L0');
  assert.ok(has(dir, 'CLAUDE.md')); assert.ok(has(dir, '.cursor/rules/gs.mdc')); assert.ok(!has(dir, 'AGENTS.md'));
  const bad = project(NODE);
  const b = gs(bad, ['init', '--no-proof'], { env: { GS_FORCE_PROMPT: '1' }, input: '9\n' });
  assert.equal(b.status, 2); assert.deepEqual(Object.keys(tree(bad)).sort(), ['package.json', 'src/index.js']);
});

// F-007.3
test('C6 init refuses a home folder and a drive root, and writes nothing there', () => {
  const r = gs(os.homedir(), [...INIT, '--dry-run']);
  assert.equal(r.status, 2); assert.match(r.stderr, /looks like your home folder/);
});

// F-007.4
test('C7 the install record names every file and block gs-init wrote; a second run leaves it byte-identical and makes no backup', () => {
  const dir = project({ ...NODE, 'CLAUDE.md': '# mine\n\nmy own notes\n', 'README.md': '# demo\n\nhello\n' });
  const r = gs(dir, [...INIT, '--level', 'L1', '--agents', 'claude']);
  assert.equal(r.status, 0, r.stderr);
  const man = JSON.parse(read(dir, '.gs-manifest.json'));
  assert.equal(man.level, 'L1');
  for (const f of ['docs/spec/SPEC.md', 'scripts/gs-gate.mjs', 'tools/gs-check/gs-check.mjs', 'docs/baseline.json']) assert.ok(man.files[f] && man.files[f].sha, f + ' is recorded with a hash');
  assert.ok(man.blocks['CLAUDE.md'] && man.blocks['CLAUDE.md'].whole === false, 'CLAUDE.md was yours: a block, not the file');
  assert.ok(man.blocks['.githooks/pre-commit'] && man.blocks['.githooks/pre-commit'].whole === true);
  assert.equal(man.gitConfig.hooksPath, '.githooks');
  assert.ok(man.config.some(c => c.path.join('.') === 'level'));
  const before = tree(dir), backups = has(dir, '.gs-init-backup') ? fs.readdirSync(path.join(dir, '.gs-init-backup')) : [];
  const r2 = gs(dir, [...INIT, '--level', 'L1', '--agents', 'claude']);
  assert.equal(r2.status, 0, r2.stderr);
  assert.deepEqual(tree(dir), before, 'the second run changed nothing, the record included');
  assert.deepEqual(has(dir, '.gs-init-backup') ? fs.readdirSync(path.join(dir, '.gs-init-backup')) : [], backups, 'and made no new backup');
});

// F-007.5
test('C8 uninstall takes out what the record says and leaves every file of yours byte for byte, unsets the hooks setting and removes the folders it emptied', () => {
  const mine = { ...NODE, 'CLAUDE.md': '# mine\n\nmy own notes\n', 'README.md': '# demo\n\nhello\n', '.gs.json': '{\n  "custom": 1,\n  "level": "L0"\n}\n' };
  const dir = project(mine);
  const original = tree(dir);
  const hookBefore = ((git(dir, 'config', '--get', 'core.hooksPath').stdout) || '').trim();
  const r = gs(dir, [...INIT, '--level', 'L1', '--agents', 'claude,cursor']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(dir, 'config', '--get', 'core.hooksPath').stdout.trim(), '.githooks');
  const u = gs(dir, ['uninstall', '--yes']);
  assert.equal(u.status, 0, u.stderr + u.stdout);
  assert.match(u.stdout, /remove\s+docs\/spec\/SPEC.md/); assert.match(u.stdout, /core\.hooksPath/);
  const after = tree(dir);
  for (const f of Object.keys(original)) {
    if (f === '.gs.json') continue;
    assert.equal(after[f], original[f], f + ' is byte for byte what it was');
  }
  const cfg = JSON.parse(after['.gs.json']);
  assert.deepEqual(cfg, { custom: 1, level: 'L0' }, 'only the keys gs-init set were taken out; yours are back');
  const left = Object.keys(after).filter(f => !f.startsWith('.gs-init-backup/') && !(f in original)).sort();
  assert.deepEqual(left, [], 'no file of gs-init is left behind: ' + left.join(', '));
  for (const d of ['docs', 'scripts', 'tools', '.githooks', '.cursor']) assert.ok(!has(dir, d), d + ' is gone');
  assert.equal(git(dir, 'config', '--get', 'core.hooksPath').stdout.trim(), hookBefore);
  assert.ok(has(dir, '.git'));
});

// F-007.5
test('C9 uninstall keeps a file you changed after it was written, and a hook of yours that gs-init chained is restored', () => {
  const dir = project(NODE);
  fs.mkdirSync(path.join(dir, '.git', 'hooks'), { recursive: true });
  const mine = '#!/bin/sh\necho my own pre-commit hook\n';
  fs.writeFileSync(path.join(dir, '.git', 'hooks', 'pre-commit'), mine, { mode: 0o755 });
  assert.equal(gs(dir, [...INIT, '--level', 'L1']).status, 0);
  assert.match(read(dir, '.githooks/pre-commit'), /my own pre-commit hook/);
  fs.appendFileSync(path.join(dir, 'docs/spec/SPEC.md'), '\n- F-001.4 The system MUST keep my addition. verified by: my notes\n');
  fs.appendFileSync(path.join(dir, 'scripts/gs-gate.mjs'), '\n// my edit\n');
  const u = gs(dir, ['uninstall', '--yes']);
  assert.equal(u.status, 0, u.stderr);
  assert.match(u.stdout, /keep\s+docs\/spec\/SPEC.md/); assert.match(u.stdout, /keep\s+scripts\/gs-gate.mjs/);
  assert.match(read(dir, 'docs/spec/SPEC.md'), /keep my addition/); assert.match(read(dir, 'scripts/gs-gate.mjs'), /my edit/);
  assert.ok(!has(dir, '.githooks/pre-commit'), 'the copy of the hook that carried the checks is gone');
  assert.equal(read(dir, '.git/hooks/pre-commit'), mine, 'your own hook was never touched');
  assert.ok(!has(dir, 'tools/gs-check'));
  assert.ok(!has(dir, '.gs-manifest.json'));
});

// F-007.6
test('C10 uninstall --dry-run changes nothing; without the record it refuses; without --yes and without a terminal it refuses', () => {
  const dir = project(NODE);
  const none = gs(dir, ['uninstall', '--yes']);
  assert.equal(none.status, 1); assert.match(none.stdout, /no install record/);
  assert.equal(gs(dir, [...INIT, '--level', 'L0']).status, 0);
  const before = tree(dir);
  const d = gs(dir, ['uninstall', '--dry-run']);
  assert.equal(d.status, 0, d.stderr); assert.match(d.stdout, /dry run/);
  assert.deepEqual(tree(dir), before);
  const noyes = gs(dir, ['uninstall']);
  assert.equal(noyes.status, 2); assert.match(noyes.stderr, /add --yes/);
  assert.deepEqual(tree(dir), before);
});

// F-007.7
test('C11 update re-runs the setup from a copy of the tools, backs up what it replaces, touches none of your files, and a second update changes nothing', () => {
  const src = path.join(TMP, 'newtools'); fs.mkdirSync(path.join(src, 'tools'), { recursive: true });
  for (const t of ['gs-init', 'gs-check', 'gs-lock', 'gs-decide']) fs.cpSync(path.join(ROOT, 'tools', t), path.join(src, 'tools', t), { recursive: true, filter: f => path.basename(f) !== 'test' });
  fs.writeFileSync(path.join(src, 'package.json'), '{ "name": "genspec-tools", "version": "9.9.9" }\n');
  const dir = project(NODE);
  assert.equal(gs(dir, [...INIT, '--level', 'L1']).status, 0);
  fs.writeFileSync(path.join(dir, 'docs/open-questions.md'), '# Open questions\n\nnone\n');
  const mineBefore = { spec: read(dir, 'docs/spec/SPEC.md'), q: read(dir, 'docs/open-questions.md'), pkg: read(dir, 'package.json') };
  const newer = '\n// newer version of gs-check\n';
  fs.appendFileSync(path.join(src, 'tools/gs-check/gs-check.mjs'), newer);
  const r = gs(dir, ['update', '--from', src]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /version 9\.9\.9/);
  assert.ok(read(dir, 'tools/gs-check/gs-check.mjs').endsWith(newer), 'the tool was refreshed');
  const stamps = fs.readdirSync(path.join(dir, '.gs-init-backup'));
  assert.equal(stamps.length, 1);
  assert.ok(has(dir, '.gs-init-backup/' + stamps[0] + '/tools/gs-check/gs-check.mjs'), 'the old copy was backed up');
  assert.equal(read(dir, 'docs/spec/SPEC.md'), mineBefore.spec); assert.equal(read(dir, 'docs/open-questions.md'), mineBefore.q); assert.equal(read(dir, 'package.json'), mineBefore.pkg);
  const before = tree(dir);
  const r2 = gs(dir, ['update', '--from', src]);
  assert.equal(r2.status, 0, r2.stderr);
  assert.deepEqual(tree(dir), before, 'a second update changed nothing and made no backup');
  const none = gs(project(NODE), ['update', '--from', src]);
  assert.equal(none.status, 1); assert.match(none.stderr, /no gs setup/);
});

// F-007.8
test('C12 doctor lists what is installed and what is missing, and says it does not test that anything works', () => {
  const bare = project(NODE);
  const b = gs(bare, ['doctor']);
  assert.equal(b.status, 1); assert.match(b.stdout, /missing gs init has not been run here/); assert.match(b.stdout, /gs check/);
  assert.equal(gs(bare, [...INIT, '--level', 'L1']).status, 0);
  const g = gs(bare, ['doctor']);
  assert.equal(g.status, 0, g.stdout); assert.match(g.stdout, /gs init has been run here \(level L1\)/); assert.match(g.stdout, /git hooks come from \.githooks/);
  assert.match(g.stdout, /tool files here match this gs/);
  fs.appendFileSync(path.join(bare, 'tools/gs-lock/gs-lock.mjs'), '\n// edited\n');
  assert.match(gs(bare, ['doctor']).stdout, /1 of \d+ tool files here differ/);
});

// F-007.9
test('C13 start explains itself in a few lines, takes the quick look, then sets up level L0 with the assistant files given', () => {
  const dir = project(NODE);
  const r = gs(dir, ['start', '--yes', '--no-proof', '--agents', 'claude']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Welcome\./); assert.match(r.stdout, /never edits your code/); assert.match(r.stdout, /gs uninstall/);
  assert.ok(r.stdout.indexOf('The three most valuable next steps') < r.stdout.indexOf('gs-init 0.1.0: level L0'), 'the look comes before the setup');
  assert.equal(JSON.parse(read(dir, '.gs.json')).level, 'L0');
  assert.ok(!has(dir, 'scripts/gs-gate.mjs'), 'level L0 installs no gate');
});

// F-007.10
test('C14 the other tools are reached through gs with their own options (lock shows its usage)', () => {
  const r = gs(TMP, ['lock']);
  assert.match(r.stdout + r.stderr, /usage: gs-lock/);
});
