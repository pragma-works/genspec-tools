// SPDX-License-Identifier: MIT
// Tests for gs-demo, on hand-built projects built the way the gs-check controls are: a good one, a bare one, and one with a bad gate.
// Run:  node --test tools/gs-demo/test/demo.test.mjs
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { lookAt, render, measure, ELEMENTS } from '../gs-demo.mjs';
import { buildGood, buildVariant, cleanup } from '../../gs-check/test/build-fixtures.mjs';
import variants from '../../gs-check/test/variants.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO = path.join(HERE, '..', 'gs-demo.mjs');
const variant = id => buildVariant(variants.find(v => v.id === id));
const cli = (...args) => spawnSync(process.execPath, [DEMO, ...args], { encoding: 'utf8', timeout: 120000 });
const status = (look, id) => look.results[id].status;

// a hash of every file (path and content) and of the folder listing, to prove the original is untouched
function fingerprint(dir) {
  const h = crypto.createHash('sha256');
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      h.update(path.relative(dir, p) + '\n');
      if (e.isDirectory()) walk(p); else h.update(fs.readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}
function bare() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdemo-bare-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# A small tool\n\nIt does a thing.\n');
  fs.writeFileSync(path.join(dir, 'main.py'), 'print("hello")\n');
  const g = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  g('init', '-q', '-b', 'main'); g('add', '-A'); g('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'first');
  return dir;
}

test('D1 a good project: the checkable elements are found, E12 is not checked, nothing is missing', () => {
  const dir = buildGood();
  try {
    const look = lookAt(dir);
    assert.ok(!look.refused, look.refused);
    for (const [id] of ELEMENTS) if (id !== 'E12') assert.strictEqual(status(look, id), 'found', `${id}: ${JSON.stringify(look.results[id])}`);
    assert.strictEqual(status(look, 'E12'), 'not checked');
    assert.match(look.results.E10.note, /ran gs-lock/);
    const text = render(look);
    assert.match(text, /not checked in the quick look/);
    assert.match(text, /Nothing the quick look could see/);
  } finally { cleanup(dir); }
});

test('D2 a bare project: the document and gate elements are missing, the report names three steps', () => {
  const dir = bare();
  try {
    const look = lookAt(dir);
    for (const id of ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E10', 'E11']) assert.strictEqual(status(look, id), 'missing', `${id}: ${JSON.stringify(look.results[id])}`);
    assert.strictEqual(status(look, 'E09'), 'not checked'); // one commit: too few to judge
    assert.strictEqual(status(look, 'E12'), 'not checked');
    const text = render(look);
    const steps = text.split('The three most valuable next steps')[1].split('\n').filter(l => /^ {2}[123]\. /.test(l));
    assert.strictEqual(steps.length, 3);
    assert.match(steps[0], /^ {2}1\. E02:/); // the spec comes first: everything hangs from it
    assert.match(steps[1], /^ {2}2\. E05:/);
  } finally { cleanup(dir); }
});

for (const id of ['B05', 'X01']) {
  test(`D3 ${id} a bad gate (a hook that never blocks): E05 is weak and says why, and it comes first among the steps`, () => {
    const dir = variant(id);
    try {
      const look = lookAt(dir);
      assert.strictEqual(status(look, 'E05'), 'weak', JSON.stringify(look.results.E05));
      assert.match(look.results.E05.note, /never block/);
      assert.match(render(look), /1\. E05 is weak/);
      assert.strictEqual(status(look, 'E02'), 'found');
    } finally { cleanup(dir); }
  });
}

test('D4 removed and broken elements are named: no spec, a stale lock, sloppy history', () => {
  for (const [id, el, st] of [['R02', 'E02', 'missing'], ['R01', 'E01', 'missing'], ['B10', 'E10', 'weak'], ['R10', 'E09', 'weak'], ['B01', 'E01', 'weak']]) {
    const dir = variant(id);
    try { const look = lookAt(dir); assert.strictEqual(status(look, el), st, `${id} ${el}: ${JSON.stringify(look.results[el])}`); } finally { cleanup(dir); }
  }
});

// F-006.1
test('D5 the original is never modified (content, listing) and no temporary copy is left behind', () => {
  const dir = buildGood();
  try {
    const before = fingerprint(dir);
    const tmpBefore = fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('gs-demo-')).length;
    const r = cli(dir);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(fingerprint(dir), before);
    assert.strictEqual(fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('gs-demo-')).length, tmpBefore);
  } finally { cleanup(dir); }
});

// F-006.2
test('D6 the output never says "governed", never grades, and always ends with the quick-look line', () => {
  for (const make of [() => buildGood(), bare, () => variant('X01')]) {
    const dir = make();
    try {
      const r = cli(dir);
      assert.strictEqual(r.status, 0, r.stderr);
      assert.ok(!/governed/i.test(r.stdout), 'must never print "governed"');
      assert.ok(!/\b(score|grade[ds]?:|level L[0-9]|certified)\b/i.test(r.stdout.replace(/not an audit grade and not a certification/, '')), r.stdout);
      assert.match(r.stdout, /This is a quick look, not an audit grade and not a certification\./);
      assert.match(r.stdout, /The three most valuable next steps/);
    } finally { cleanup(dir); }
  }
});

// F-006.3
test('D7 a very large folder is refused with a clear message and nothing is copied', () => {
  const dir = buildGood();
  try {
    const small = lookAt(dir, { maxFiles: 5 });
    assert.match(small.refused, /large/);
    const r = cli(dir, '--max-mb', '0.0001');
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /This folder is large/);
    assert.strictEqual(r.stdout, '');
  } finally { cleanup(dir); }
});

test('D8 usage errors and bad paths exit 2 with a message', () => {
  assert.strictEqual(cli().status, 2);
  assert.strictEqual(cli('--nope', 'x').status, 2);
  const r = cli(path.join(os.tmpdir(), 'gs-demo-does-not-exist-' + Date.now()));
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /does not exist/);
  const f = path.join(os.tmpdir(), 'gs-demo-a-file-' + Date.now());
  fs.writeFileSync(f, 'x'); try { const r2 = cli(f); assert.strictEqual(r2.status, 2); assert.match(r2.stderr, /Not a folder/); } finally { fs.rmSync(f, { force: true }); }
});

test('D9 dependency folders and secret-looking files are left out of the look', () => {
  const dir = bare();
  try {
    fs.mkdirSync(path.join(dir, 'node_modules/x'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules/x/a.js'), 'x');
    fs.writeFileSync(path.join(dir, '.env'), 'TOKEN=not-a-real-secret\n');
    fs.writeFileSync(path.join(dir, 'server.pem'), 'not a real key\n');
    const m = measure(dir, { maxFiles: 1000, maxMb: 10 });
    assert.strictEqual(m.files, 2); // README.md and main.py only
    const r = cli(dir);
    assert.ok(!r.stdout.includes('not-a-real-secret'));
  } finally { cleanup(dir); }
});

test('D10 the time budget is respected: with no time left the checks say so instead of running', () => {
  const dir = buildGood();
  try {
    const look = lookAt(dir, { budgetSec: 0.000001 });
    for (const [id] of ELEMENTS) assert.strictEqual(status(look, id), 'not checked', id);
    assert.match(look.results.E01.note, /out of time/);
  } finally { cleanup(dir); }
});

test('D11 a normal look takes seconds, not minutes', () => {
  const dir = buildGood();
  try { const t0 = Date.now(); const r = cli(dir); assert.strictEqual(r.status, 0); assert.ok(Date.now() - t0 < 30000, `took ${Date.now() - t0} ms`); } finally { cleanup(dir); }
});

test('D12 --json prints the results object', () => {
  const dir = buildGood();
  try { const r = cli(dir, '--json'); assert.strictEqual(r.status, 0); const j = JSON.parse(r.stdout); assert.strictEqual(j.results.E02.status, 'found'); assert.ok(!/governed/i.test(r.stdout)); } finally { cleanup(dir); }
});

// (scan of many repositories, 2026-10-09) a sentinel that mentions code, package scopes or web addresses in backticks is not a sentinel with broken routes
function withFiles(files) {
  const dir = bare();
  for (const [p, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), t); }
  return dir;
}
const SENTINEL_BODY = 'line 1\nline 2\nline 3\nline 4\nline 5\n';
// F-006.4
test('D13 E01: code, package scopes and web addresses in the sentinel are not counted as broken routes', () => {
  const dir = withFiles({
    'CLAUDE.md': SENTINEL_BODY + 'Never use `DateTime.Now/UtcNow`. Built with @react-three/fiber and `@nx/react`. See `example.dev/try`. Template: `docs/diagrams/flow-[x].md`.\n[arch](docs/architecture.md) [conv](docs/conventions.md)\n',
    'docs/architecture.md': 'a\nb\nc\nd\ne\n', 'docs/conventions.md': 'a\nb\nc\nd\ne\n'
  });
  try {
    const look = lookAt(dir);
    assert.strictEqual(status(look, 'E01'), 'found', JSON.stringify(look.results.E01));
  } finally { cleanup(dir); }
});
// F-006.4
test('D14 E01: a real missing document is still named, with the note that it may be advice', () => {
  const dir = withFiles({ 'CLAUDE.md': SENTINEL_BODY + 'See [the spec](docs/spec/SPEC.md) and `docs/missing.md`.\n', 'docs/other.md': 'x\n' });
  try {
    const look = lookAt(dir);
    assert.strictEqual(status(look, 'E01'), 'weak');
    assert.match(look.results.E01.note, /docs\/spec\/SPEC\.md|docs\/missing\.md/);
    assert.match(look.results.E01.note, /advice/);
  } finally { cleanup(dir); }
});

// F-006.5
test('D15 E02: the same id in two feature folders (spec-kit layout) is not a duplicate', () => {
  const spec = n => `# Feature ${n}\n\n## Requirements\n\n- **FR-001**: the system MUST do the thing\n- **FR-002**: the system MUST do the other thing\n\n## Acceptance criteria\n\n- AC-001 the thing happens\n`;
  const dir = withFiles({ 'specs/001-first/spec.md': spec(1), 'specs/002-second/spec.md': spec(2) });
  try {
    const look = lookAt(dir);
    assert.strictEqual(status(look, 'E02'), 'found', JSON.stringify(look.results.E02));
    assert.match(look.results.E02.note, /per feature folder/);
  } finally { cleanup(dir); }
  const dir2 = withFiles({ 'docs/spec/SPEC.md': '# S\n\n- FR-001 a\n- FR-001 b\n\n## Acceptance criteria\n\n- AC-001 c\n' });
  try { assert.strictEqual(status(lookAt(dir2), 'E02'), 'weak'); } finally { cleanup(dir2); } // a real duplicate inside one file is still caught
});
// F-006.6
test('D17 E05: a CI step that runs the tests through make ci, tox or just is recognised; a CI file that runs nothing is not', () => {
  for (const [cmd, expected] of [['make ci', 'found'], ['tox -e py312', 'found'], ['just test', 'found'], ['echo hello', 'weak']]) {
    const dir = withFiles({ 'tests/test_a.py': 'def test_a():\n    assert True\n', '.github/workflows/ci.yml': `name: ci\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Run tests\n        run: ${cmd}\n` });
    try { const look = lookAt(dir); assert.strictEqual(status(look, 'E05'), expected, cmd); if (expected === 'found') assert.match(look.results.E05.note, /credits only a hook/); } finally { cleanup(dir); }
  }
});
// F-006.8
test('D20 E02/E08: ids listed under any heading are checked against the tests; a decision-record id is not a requirement; one id is not a spec', () => {
  const dir = withFiles({ 'docs/spec/SPEC.md': '# Spec\n\n## Requirements\n\n- REQ-001 a\n- REQ-002 b\n- REQ-003 c\n', 'tests/a.test.js': "test('REQ-001 REQ-002 REQ-003', () => {});\n" });
  try { const look = lookAt(dir); assert.strictEqual(status(look, 'E02'), 'found'); assert.strictEqual(status(look, 'E08'), 'found', JSON.stringify(look.results.E08)); } finally { cleanup(dir); }
  const dir2 = withFiles({ 'docs/specs/notes.md': '# Notes\n\n- ADR-0001 use a database\n- ADR-0002 use a queue\n- ADR-0003 use a cache\n' });
  try { assert.strictEqual(status(lookAt(dir2), 'E02'), 'weak'); assert.match(lookAt(dir2).results.E02.note, /no numbered ids/); } finally { cleanup(dir2); }
  const dir3 = withFiles({ 'docs/spec/SPEC.md': '# Spec\n\n- REQ-001 only one\n' });
  try { const n = lookAt(dir3).results.E02; assert.strictEqual(n.status, 'weak'); assert.match(n.note, /only 1 numbered id/); } finally { cleanup(dir3); }
});
// F-006.7
test('D18 a folder that is mostly documents gets a note that the checks are for code projects; a code project does not', () => {
  const docs = {}; for (let i = 0; i < 12; i++) docs[`notes/n${i}.md`] = `# Note ${i}\n\ntext\n`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdemo-docs-')); for (const [p, t] of Object.entries(docs)) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), t); }
  try {
    const look = lookAt(dir);
    assert.strictEqual(look.profile.codeProject, false);
    assert.match(render(look), /Note: Only 0 of \d+ files are source code\. These twelve checks are written for software projects; a documents, content or game-assets project needs a different profile/);
  } finally { cleanup(dir); }
  const good = buildGood();
  try { const look = lookAt(good); assert.strictEqual(look.profile.codeProject, true); assert.ok(!/different profile/.test(render(look))); } finally { cleanup(good); }
});
// F-006.7
test('D19 a folder without git history says so in E09, and the found line is a list, not a tally', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdemo-nogit-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# x\n');
  try {
    const look = lookAt(dir);
    assert.match(look.results.E09.note, /no \.git folder/);
    assert.ok(!/ of the 12 elements/.test(render(look)));
  } finally { cleanup(dir); }
});
// F-006.5
test('D16 E02: a project with a spec-driven tool folder is told which folder was seen and what is read', () => {
  const dir = withFiles({ '.specify/memory/constitution.md': '# C\n', 'openspec/changes/x/proposal.md': '# P\n' });
  try {
    const n = lookAt(dir).results.E02.note;
    assert.match(n, /spec-kit: \.specify\//);
    assert.match(n, /OpenSpec: openspec\//);
  } finally { cleanup(dir); }
});
