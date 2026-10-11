// SPDX-License-Identifier: MIT
// Tests for gs start: the inventory, the prompt file and the hand-off to the person's assistant. No model, no network, no assistant (a fake one
// on a fake PATH records what it is given). Every project is built in the temp folder.
// Run: node --test tools/gs-start/test/start.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CORE_CLIS, CLIS, inventory, buildPrompt, renderInventoryMd, writeHandoff, detectClis, handCommand, verifySpec, specState, CLI_START, INTRO, GENERIC, DOCUMENTS_NOTE, PROMPT_FILE } from '../gs-start.mjs';
import { SPEC_MD } from '../../gs-init/gs-init.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const GS = path.join(ROOT, 'bin', 'gs.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-start-test-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

const ENV = { ...process.env }; for (const k of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'GS_DECIDE_AGENT', 'CURSOR_AGENT', 'CODEX_SANDBOX', 'AIDER_MODEL', 'GEMINI_CLI', 'GS_FORCE_PROMPT', 'NODE_TEST_CONTEXT']) delete ENV[k];
for (const k of Object.keys(ENV)) if (k.startsWith('GIT_') && k !== 'GIT_EDITOR') delete ENV[k];
const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8', env: ENV });
let n = 0;
function project(files = {}, { repo = true } = {}) {
  const dir = path.join(TMP, 'p' + (++n)); fs.mkdirSync(dir, { recursive: true });
  for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), c); }
  if (repo) { git(dir, 'init', '-q'); git(dir, 'config', 'user.name', 'Pat Person'); git(dir, 'config', 'user.email', 'pat@example.com'); git(dir, 'config', 'core.autocrlf', 'false'); }
  return dir;
}
const commit = (dir, msg = 'feat: first') => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', msg); };
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const has = (dir, rel) => fs.existsSync(path.join(dir, rel));
function tree(dir) {
  const out = {};
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.name === '.git') continue; if (e.isDirectory()) walk(p); else out[path.relative(dir, p).split(path.sep).join('/')] = fs.readFileSync(p, 'utf8'); } };
  walk(dir); return out;
}
// the PATH of a child: the fake folder first, then only the folders that node, git and the shell need (so the assistants really installed here are not seen)
function pathWith(...dirs) {
  const need = [path.dirname(process.execPath), path.dirname(spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0])];
  if (process.platform === 'win32') need.push(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'), process.env.SystemRoot || 'C:\\Windows'); else need.push('/usr/bin', '/bin');
  return [...dirs, ...new Set(need)].join(path.delimiter);
}
function gs(cwd, args, extraEnv = {}) {
  const env = { ...ENV, ...extraEnv }; if ('PATH' in extraEnv) for (const k of Object.keys(env)) if (k !== 'PATH' && k.toLowerCase() === 'path') delete env[k];
  return spawnSync(process.execPath, [GS, ...args], { cwd, encoding: 'utf8', env, timeout: 120000 });
}
function fakeCli(dir, names, log) {
  fs.mkdirSync(dir, { recursive: true });
  for (const c of names) {
    if (process.platform === 'win32') fs.writeFileSync(path.join(dir, c + '.cmd'), `@echo off\r\necho %* > "${log}"\r\n`);
    else fs.writeFileSync(path.join(dir, c), `#!/bin/sh\nprintf '%s\\n' "$@" > "${log}"\n`, { mode: 0o755 });
  }
}

const NODE = {
  'package.json': JSON.stringify({ name: 'orders-api', main: 'src/index.js', bin: { orders: 'src/cli.js' }, scripts: { test: 'node --test', start: 'node src/index.js' }, dependencies: { express: '^4.0.0', pg: '^8.0.0' }, devDependencies: { jest: '^29' } }),
  'package-lock.json': '{}', 'README.md': '# orders\n',
  'src/index.js': "const app = require('express')();\napp.get('/orders', (q, r) => r.json([]));\napp.post('/orders', (q, r) => r.end());\n",
  'src/cli.js': "program.command('list').action(() => {});\n",
  'test/orders.test.js': "test('lists', () => {});\ntest('creates', () => {});\n",
};
const PY = {
  'pyproject.toml': '[project]\nname = "ledger"\ndependencies = ["fastapi>=0.100", "pydantic"]\n[project.scripts]\nledger = "ledger.cli:main"\n[tool.pytest.ini_options]\n',
  'uv.lock': '', 'app.py': 'from fastapi import FastAPI\napp = FastAPI()\n@app.get("/health")\ndef health(): return 1\n', 'ledger/__main__.py': 'print(1)\n',
  'tests/test_health.py': 'def test_health():\n    assert 1\n',
};
const GO = {
  'go.mod': 'module example.com/svc\n\ngo 1.22\n\nrequire (\n\tgithub.com/go-chi/chi/v5 v5.0.0\n\tgolang.org/x/text v0.1.0 // indirect\n)\n',
  'main.go': 'package main\nfunc main() { http.HandleFunc("/ping", nil) }\n', 'cmd/tool/main.go': 'package main\nfunc main() {}\n', 'svc_test.go': 'package main\nfunc TestPing(t *testing.T) {}\n',
};
const DOTNET = {
  'Shop.sln': '', 'src/Shop.Web/Shop.Web.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="Serilog" Version="3" /></ItemGroup></Project>',
  'src/Shop.Web/Program.cs': 'var app = builder.Build();\napp.MapGet("/ping", () => 1);\n',
  'src/Shop.Web/OrdersController.cs': '[HttpGet("orders")]\npublic class X {}\n',
  'tests/Shop.Tests/Shop.Tests.csproj': '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17" /><PackageReference Include="xunit" Version="2" /></ItemGroup></Project>',
  'tests/Shop.Tests/OrdersTests.cs': '[Fact]\npublic void A() {}\n',
};
const DOCS = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`chapters/c${i}.md`, `# Chapter ${i}\n\nSome prose.\n`]));
const COMPLETE_SPEC = '# x: specification\n\n## F-001 Orders\n\nThe API lists orders.\n\n### Acceptance criteria\n\n- F-001.1 The API MUST list orders. verified by: test/orders.test.js\n- F-001.2 The API MUST refuse bad input. verified by: test/orders.test.js\n- F-001.3 The API SHOULD answer fast. verified by: test/orders.test.js\n';

// F-009.1
test('S1 the inventory reads the stack, package manager, test command, entry points, routes and dependencies of node, python, go and dotnet projects without a model', () => {
  const nd = inventory(project(NODE));
  const ns = nd.stacks.find(s => s.stack === 'node');
  assert.equal(ns.packageManager, 'npm'); assert.deepEqual(ns.frameworks, ['express']); assert.deepEqual(ns.testTools, ['jest']);
  assert.equal(ns.dependencies.runtime, 2);
  assert.ok(nd.testCommands.some(t => t.command === 'npm test'));
  assert.ok(nd.entryPoints.some(e => e.file === 'src/index.js') && nd.entryPoints.some(e => e.file === 'src/cli.js'));
  assert.deepEqual(nd.routes.map(r => r.route).sort(), ['GET /orders', 'POST /orders']);
  assert.ok(nd.cliCommands.some(c => c.command === 'list'));
  assert.equal(nd.files.tests, 1); assert.equal(nd.files.testCases, 2);
  assert.equal(nd.languages[0].name, 'JavaScript'); assert.equal(nd.mode, 'brownfield');
  const py = inventory(project(PY)), ps = py.stacks.find(s => s.stack === 'python');
  assert.equal(ps.packageManager, 'uv'); assert.ok(ps.frameworks.includes('fastapi'));
  assert.ok(py.testCommands.some(t => t.command === 'python -m pytest'));
  assert.ok(py.entryPoints.some(e => e.file === 'app.py') && py.entryPoints.some(e => e.command === 'ledger'));
  assert.ok(py.routes.some(r => r.route === 'GET /health'));
  const go = inventory(project(GO)), gs_ = go.stacks.find(s => s.stack === 'go');
  assert.equal(gs_.goVersion, '1.22'); assert.deepEqual(gs_.dependencies.top, ['github.com/go-chi/chi/v5']); assert.deepEqual(gs_.frameworks, ['go-chi/chi']);
  assert.ok(go.testCommands.some(t => t.command === 'go test ./...'));
  assert.ok(go.entryPoints.some(e => e.file === 'main.go') && go.entryPoints.some(e => e.file === 'cmd/tool/main.go'));
  assert.ok(go.routes.some(r => r.route === 'ROUTE /ping'));
  const dn = inventory(project(DOTNET)), ds = dn.stacks.filter(s => s.stack === 'dotnet');
  assert.equal(ds.length, 1); assert.deepEqual(ds[0].frameworks, ['ASP.NET Core']); assert.deepEqual(ds[0].targetFrameworks, ['net8.0']); assert.deepEqual(ds[0].testTools, ['xunit']);
  assert.ok(dn.testCommands.some(t => t.command === 'dotnet test')); assert.ok(dn.entryPoints.some(e => e.file === 'src/Shop.Web/Program.cs'));
  assert.ok(dn.routes.some(r => r.route === 'GET /ping') && dn.routes.some(r => r.route === 'GET orders'));
  // the same project twice gives the same bytes, and the readable file names what it found
  const dir = project(NODE); commit(dir);
  assert.equal(JSON.stringify(inventory(dir)), JSON.stringify(inventory(dir)));
  const md = renderInventoryMd(inventory(dir));
  for (const w of ['## Stack: node', 'npm test', 'GET /orders', 'src/index.js', '## Folder layout', '## Git history', 'Nothing was run']) assert.ok(md.includes(w), w);
  assert.equal(inventory(dir).git.commits, 1);
});

// F-009.2
test('S2 a documents-only folder prints the not-code note, writes no code spec, no prompt and nothing at all through gs start', () => {
  const dir = project(DOCS), before = tree(dir);
  const inv = inventory(dir);
  assert.equal(inv.mode, 'documents'); assert.equal(inv.files.source, 0);
  const r = gs(dir, ['start', '--yes', '--no-proof']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('this is mostly not code, it needs a different profile'), 'the note is printed');
  assert.ok(DOCUMENTS_NOTE.startsWith('this is mostly not code'));
  assert.deepEqual(tree(dir), before, 'the folder is byte for byte as it was');
  assert.ok(!has(dir, 'docs/spec/SPEC.md') && !has(dir, PROMPT_FILE) && !has(dir, '.gs'));
  // the standalone tool in such a folder writes the facts but never a prompt
  const ops = writeHandoff(dir, inv);
  assert.ok(ops.every(o => o.rel !== PROMPT_FILE)); assert.ok(!has(dir, PROMPT_FILE));
});

// F-009.3
test('S3 the prompt contains every section of the spec template that gs-init writes, the order of work, the tags and the question protocol', () => {
  const inv = inventory(project(NODE)), p = buildPrompt(inv);
  // the headings come from the template itself, so a heading added to the template and missed by the prompt fails here
  const headings = [...SPEC_MD('x', 'docs/decisions/0001.md').matchAll(/^#{2,3} (.+)$/gm)].map(m => m[1]);
  assert.ok(headings.length >= 3);
  for (const h of headings) assert.ok(p.includes(h.replace(/^(F-001) .*/, '$1')), 'the prompt names the template heading: ' + h);
  for (const s of ['overview', 'Scope', 'Non-goals', 'The AI must never', 'Acceptance criteria', 'Decisions', 'verified by:', 'MUST, SHOULD or MAY', 'F-001.1']) assert.ok(p.includes(s), s);
  for (const s of ['FOUND IN CODE', 'ASSUMED', 'docs/open-questions.md', 'OPEN:', '**Recommended:**', 'Reply `ok`', 'one at a time', 'gs check', '.gs/inventory.md']) assert.ok(p.includes(s), s);
  const titles = ['Read', 'Explore', 'Draft the spec', 'Write what you could not decide', 'Create the sentinel', 'Mark the technical debt', 'Ask the questions', 'Ask what the person WANTS', 'Configure the substrate', 'Update the spec', 'Stop and hand over', 'Check the sync'];
  const order = titles.map(t => p.search(new RegExp('^## Step \\d+\\. ' + t, 'm')));
  assert.ok(order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), 'steps in order: ' + order);
  assert.ok(order[10] < p.indexOf('gs check\n```'), 'gs check comes after the stop');
});

// F-009.4
test('S4 no prompt tells the assistant to ratify, accept or sign anything; every mention of the commands that do is a prohibition or addressed to the person', () => {
  const dirs = { brownfield: project(NODE), greenfield: project({}), sync: project({ ...NODE, 'docs/spec/SPEC.md': COMPLETE_SPEC }), continue: project({ ...NODE, 'docs/spec/SPEC.md': COMPLETE_SPEC + '\nOPEN: who pays? F-001\n' }) };
  for (const [mode, dir] of Object.entries(dirs)) {
    const inv = inventory(dir); assert.equal(inv.mode, mode);
    const p = buildPrompt(inv);
    assert.match(p, /Never record a ratification, an acceptance or a decision on the person's behalf/);
    assert.match(p, /I have not ratified anything and I will not/);
    for (const line of p.split('\n').filter(l => /gs decide|Signed-off-by|Status to Accepted|docs\/decisions\.log/.test(l))) assert.match(line, /\bnot\b|\bNever\b|person|yourself|your own name/i, mode + ': ' + line);
    assert.ok(!/\b(you|assistant) (must|should|may) ratify/i.test(p));
    assert.ok(p.indexOf('Stop and hand over') > 0 && p.indexOf('Stop and hand over') < p.lastIndexOf('gs start --verify-spec'));
  }
});

// F-009.5
test('S5 the mode follows the folder: empty asks the intent first, a complete spec is verify-and-sync, a draft continues, placeholder spec alone does not count as a spec', () => {
  const g = inventory(project({ 'README.md': '# new\n' }));
  assert.equal(g.mode, 'greenfield');
  const gp = buildPrompt(g); assert.match(gp, /Ask for the intent first/); assert.match(gp, /what they want to build/); assert.ok(gp.indexOf('Ask for the intent first') < gp.indexOf('Draft the spec proposal'));
  const s = inventory(project({ ...NODE, 'docs/spec/SPEC.md': COMPLETE_SPEC }));
  assert.equal(s.mode, 'sync'); const sp = buildPrompt(s);
  assert.match(sp, /Verify and sync the spec with the code/); assert.match(sp, /orphans/); assert.match(sp, /in sync/); assert.ok(!/Draft the spec proposal/.test(sp));
  const c = inventory(project({ ...NODE, 'docs/spec/SPEC.md': COMPLETE_SPEC.replace('verified by: test/orders.test.js', 'verified by: manual step [ASSUMED: guess]') }));
  assert.equal(c.mode, 'continue'); assert.match(buildPrompt(c), /never renumber an id/);
  const ph = project(NODE); fs.mkdirSync(path.join(ph, 'docs/spec'), { recursive: true }); fs.writeFileSync(path.join(ph, 'docs/spec/SPEC.md'), SPEC_MD('x', 'adr'));
  assert.equal(specState(ph, ['docs/spec/SPEC.md']).state, 'placeholder'); assert.equal(inventory(ph).mode, 'brownfield');
});

// F-009.6
test('S6 running it again changes nothing and makes no backup; a change of the project rewrites the files; an edited file is backed up first; uninstall removes them', () => {
  const dir = project(NODE); commit(dir);
  const a = gs(dir, ['start', '--yes', '--no-proof', '--assistant', 'claude']);
  assert.equal(a.status, 0, a.stderr + a.stdout);
  for (const f of ['.gs/inventory.json', '.gs/inventory.md', PROMPT_FILE, 'CLAUDE.md']) assert.ok(has(dir, f), f);
  const man = JSON.parse(read(dir, '.gs-manifest.json')); assert.ok(man.files[PROMPT_FILE] && man.files['.gs/inventory.json']);
  const before = tree(dir);
  const b = gs(dir, ['start', '--yes', '--no-proof', '--assistant', 'claude']);
  assert.equal(b.status, 0, b.stderr);
  assert.deepEqual(tree(dir), before); assert.ok(!has(dir, '.gs-init-backup'));
  assert.ok(!/^\s+(create|update) /m.test(b.stdout.split('what was read without a model')[1] || ''), 'nothing is re-written');
  // dry run writes nothing
  const dry = project(NODE), dryBefore = tree(dry);
  const d = gs(dry, ['start', '--yes', '--no-proof', '--dry-run']); assert.equal(d.status, 0, d.stderr);
  assert.deepEqual(tree(dry), dryBefore); assert.ok(!has(dry, '.gs-manifest.json') && !has(dry, '.gs'));
  // the person edited the prompt: the next run copies it to the backup folder before replacing it
  fs.appendFileSync(path.join(dir, PROMPT_FILE), '\nmy note\n');
  fs.writeFileSync(path.join(dir, 'src/extra.js'), "app.get('/extra', () => {});\n");
  assert.equal(gs(dir, ['start', '--yes', '--no-proof', '--assistant', 'claude']).status, 0);
  const bk = fs.readdirSync(path.join(dir, '.gs-init-backup'));
  assert.equal(bk.length, 1); assert.match(read(dir, '.gs-init-backup/' + bk[0] + '/' + PROMPT_FILE), /my note/);
  assert.match(read(dir, '.gs/inventory.md'), /GET \/extra/); assert.ok(!/my note/.test(read(dir, PROMPT_FILE)));
  // uninstall takes out the gs files; the project's own files stay
  const u = gs(dir, ['uninstall', '--yes']); assert.equal(u.status, 0, u.stderr);
  assert.ok(!has(dir, '.gs') && !has(dir, 'CLAUDE.md')); assert.ok(has(dir, 'src/extra.js') && has(dir, 'package.json'));
});

// F-009.7
test('S7 only the assistants found on the PATH are offered, with the flags read from their own --help; none found gives the generic instruction; nothing is started without --launch', () => {
  const fake = path.join(TMP, 'fakebin'), log = path.join(TMP, 'fake.log');
  fakeCli(fake, ['claude', 'gemini'], log);
  const found = detectClis(pathWith(fake)); assert.deepEqual(found.map(c => c.cli), ['claude', 'gemini']);
  assert.deepEqual(detectClis(path.join(TMP, 'nothing-here')), []);
  assert.equal(handCommand('claude'), `claude "${INTRO}"`); assert.equal(handCommand('copilot'), `copilot -i "${INTRO}"`);
  assert.equal(handCommand('codex'), `codex "${INTRO}"`); assert.equal(handCommand('gemini'), `gemini -i "${INTRO}"`);
  for (const c of Object.keys(CLI_START)) assert.match(CLI_START[c].note, /"/, 'each flag cites the words of its own --help');
  const dir = project(NODE);
  const r = gs(dir, ['start', '--yes', '--no-proof'], { PATH: pathWith(fake), Path: undefined });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Next, in three lines:/); assert.match(r.stdout, /Open your assistant in this folder and say: follow \.gs\/start-prompt\.md/);
  assert.ok(r.stdout.includes(`claude   ${handCommand('claude')}`)); assert.ok(r.stdout.includes(handCommand('gemini')));
  assert.ok(!r.stdout.includes(handCommand('codex')) && !r.stdout.includes(handCommand('copilot')), 'only the assistants that exist are offered');
  assert.ok(!has(TMP, 'fake.log'), 'the assistant was not started');
  const none = project(NODE);
  const r0 = gs(none, ['start', '--yes', '--no-proof'], { PATH: pathWith(), Path: undefined });
  assert.equal(r0.status, 0, r0.stderr);
  if (!detectClis(pathWith()).length) { assert.ok(r0.stdout.includes('No assistant CLI'), r0.stdout); assert.ok(r0.stdout.includes(GENERIC)); }
});

// F-009.7
test('S8 --launch starts only the assistant named, with the prompt as its first message; an unknown or missing one is refused before anything is written', () => {
  const fake = path.join(TMP, 'fakebin2'), log = path.join(TMP, 'launch.log');
  fakeCli(fake, ['claude', 'codex'], log);
  const dir = project(NODE);
  const r = gs(dir, ['start', '--yes', '--no-proof', '--launch', 'codex'], { PATH: pathWith(fake), Path: undefined });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(fs.existsSync(log), 'the named assistant was started');
  assert.ok(fs.readFileSync(log, 'utf8').includes('Read .gs/start-prompt.md and follow it step by step.'));
  assert.match(r.stdout, /starting codex now, as you asked/);
  const bad = project(NODE), before = tree(bad);
  const m = gs(bad, ['start', '--yes', '--no-proof', '--launch', 'gemini'], { PATH: pathWith(fake), Path: undefined });
  assert.equal(m.status, 2); assert.match(m.stderr, /gemini was not found on your PATH/); assert.deepEqual(tree(bad), before);
  const u = gs(bad, ['start', '--yes', '--no-proof', '--launch', 'emacs']);
  assert.equal(u.status, 2); assert.match(u.stderr, /--launch takes claude, codex, copilot, gemini/); assert.deepEqual(tree(bad), before);
});

// F-009.9
test('S10 --verify-spec finds a FOUND IN CODE tag whose file or line does not exist, reports lines without a tag, and says what it does not check', () => {
  const spec = '# x\n\n## F-001 Orders\n\nThe API lists orders. [FOUND IN CODE: src/index.js:1]\n\n## F-002 Untagged sentence\n\nNo tag here.\n\n- F-001.1 The API MUST list orders. verified by: test/orders.test.js [FOUND IN CODE: src/index.js:2-3] [observed]\n- F-001.2 It MUST not leak. verified by: manual step [FOUND IN CODE: src/gone.js:4]\n- F-001.3 It SHOULD be fast. verified by: manual step [FOUND IN CODE: src/index.js:99]\n- F-001.4 It MAY cache. verified by: manual step [ASSUMED: seems likely]\n- F-001.5 It MUST log. verified by: manual step\n';
  const dir = project({ ...NODE, 'docs/spec/SPEC.md': spec });
  const v = verifySpec(dir);
  assert.equal(v.tagged, 4); assert.equal(v.ok, 2); assert.deepEqual(v.broken.map(b => b.tag).sort(), ['src/gone.js:4', 'src/index.js:99']);
  assert.equal(v.assumed, 1); assert.deepEqual(v.untagged.map(u => u.text.split(' ').slice(0, 2).join(' ')), ['## F-002', '- F-001.5'], 'a heading is tagged by the sentence under it; the untagged ones are named');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/gs-start/gs-start.mjs'), '--verify-spec', '--root', dir], { encoding: 'utf8', env: ENV });
  assert.equal(r.status, 1); assert.match(r.stdout, /broken +docs\/spec\/SPEC\.md:\d+ +src\/gone\.js:4 +\(file not found\)/); assert.match(r.stdout, /does not check that the code does what the sentence says/);
  fs.writeFileSync(path.join(dir, 'docs/spec/SPEC.md'), spec.split('\n').filter(l => !/gone|99|F-001\.5/.test(l)).join('\n'));
  assert.equal(spawnSync(process.execPath, [path.join(ROOT, 'tools/gs-start/gs-start.mjs'), '--verify-spec', '--root', dir], { encoding: 'utf8', env: ENV }).status, 0);
});

// F-009.10
test('S11 reading a project starts nothing of its own: a package script and a git setting that name a program do not run', () => {
  const canary = path.join(TMP, 'canary-' + (++n));
  const dir = project({ ...NODE, 'package.json': JSON.stringify({ name: 'x', scripts: { test: `node -e "require('fs').writeFileSync(${JSON.stringify(canary)}, 'x')"`, postinstall: `node -e "require('fs').writeFileSync(${JSON.stringify(canary)}, 'x')"` } }) });
  commit(dir);
  const hook = path.join(dir, 'fsmon.mjs'); fs.writeFileSync(hook, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(canary)}, 'fsmonitor');\n`);
  git(dir, 'config', 'core.fsmonitor', `node ${hook.replace(/\\/g, '/')}`);
  const r = gs(dir, ['start', '--yes', '--no-proof']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(canary), 'nothing of the project ran');
  assert.ok(inventory(dir).git.commits >= 1);
});

// F-009.11
const DOC_LINES = Array.from({ length: 14 }, (_, i) => `Line ${i + 1} of the manual: the orders service lists orders.`).join('\n');
const WITHDOCS = { ...NODE, 'README.md': '# orders\n\n' + DOC_LINES + '\n', 'docs/adr/0001-use-express.md': '# Use Express\n', 'TODO.md': '- fix paging\n', 'ROADMAP.md': '- v2\n', 'src/util.js': '// TODO: remove\n// FIXME: leaks\nmodule.exports = 1;\n' };
test('S12 the inventory detects existing documentation, decision records, backlog files and the TODO and FIXME markers; a bare README is not documentation', () => {
  const inv = inventory(project(WITHDOCS));
  assert.equal(inv.docs.existing, true);
  assert.ok(inv.docs.decisionRecords.includes('docs/adr/0001-use-express.md'));
  assert.deepEqual(inv.docs.trackerFiles.sort(), ['ROADMAP.md', 'TODO.md']);
  assert.equal(inv.debt.markers, 2); assert.equal(inv.debt.files[0].file, 'src/util.js');
  const md = renderInventoryMd(inv);
  assert.match(md, /Existing documentation: YES/); assert.match(md, /Debt markers in source .*: 2/);
  const bare = inventory(project(NODE));
  assert.equal(bare.docs.existing, false); assert.equal(bare.debt.markers, 0);
  const d2 = project(WITHDOCS); assert.equal(JSON.stringify(inventory(d2)), JSON.stringify(inventory(d2)), 'same state, same bytes');
});

// F-009.11
test('S13 with existing docs the prompt makes the assistant compare, write the sentinel from findings, mark debt, ask for the roadmap and configure the substrate as-is, in four separate artifacts, and never ratify', () => {
  const p = buildPrompt(inventory(project(WITHDOCS)));
  for (const s of ['docs/discrepancies.md', 'DISCREPANCY', 'doc says', 'code does', 'path:line', 'docs/tech-debt.md', 'severity guess', 'ASK the person whether a tech-debt list already exists', 'TODO.md', 'docs/roadmap.md', 'WISHED-FOR', 'separate', 'the sentinel from what you FOUND', 'not from a template', 'reflect what exists today', 'Status: Proposed', 'normalizing or changing it later is allowed and expected', 'proposal for the person to ratify', 'Keep the four artifacts apart']) assert.ok(p.includes(s), s);
  assert.match(p, /never add them to `docs\/decisions\.log\.md`/); assert.match(p, /You never ratify these records/);
  assert.match(p, /Recommended/);
  for (const line of p.split('\n').filter(l => /gs decide|Signed-off-by|Status to Accepted|docs\/decisions\.log|ratif/i.test(l))) assert.match(line, /\bnot\b|\bNever\b|never|person|yourself|your own name/i, line.slice(0, 120));
  assert.ok(!/(^|\. )(Run|Use|Record|Add) [^.]*gs decide add/m.test(p.replace(/(do not|never|the person)[^.]*gs decide add/gi, '')), 'no instruction to run gs decide add');
  const plain = buildPrompt(inventory(project(NODE)));
  assert.ok(!/## Step d+. Compare the existing documentation/.test(plain), 'no docs, nothing to compare');
  assert.ok(plain.includes('docs/tech-debt.md') && plain.includes('docs/roadmap.md'), 'debt and roadmap steps apply to any existing code');
  assert.ok(!/## Step d+. (Ask what the person WANTS|Mark the technical debt)/.test(buildPrompt(inventory(project({})))), 'greenfield asks the intent, no adoption steps');
});

// F-009.12
test('S14 the three most used assistant CLIs are core, in order, with launch commands; a fourth is a marked second tier', () => {
  assert.deepEqual(CORE_CLIS, ['claude', 'codex', 'copilot']);
  assert.deepEqual(CLIS.slice(0, 3), CORE_CLIS); assert.equal(CLIS.length, 4);
  for (const c of CLIS) assert.ok(CLI_START[c] && /--help|:/.test(CLI_START[c].note), c);
  assert.deepEqual(CLI_START.codex.args('x'), ['x']); assert.deepEqual(CLI_START.copilot.args('x'), ['-i', 'x']);
});
