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
