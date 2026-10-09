// SPDX-License-Identifier: MIT
// Runs every test suite of the repository, one node process per suite, and prints a count per suite and a total.
//   node scripts/run-tests.mjs              all suites (the gs-check controls take minutes: about 20 on Windows, 4 on Linux)
//   node scripts/run-tests.mjs --quick      all but the gs-check controls and migration suites
//   node scripts/run-tests.mjs --fast       all but the slow and the heavy suites (gs-check controls, migration, sync, smoke; gs-decide, gs-snapshot, gs-init): what the pre-commit hook runs, about 40 s
//   node scripts/run-tests.mjs gs-demo      only the suites whose path contains the word
// Exit 0 only if every suite has no failure and ran at least one test.
import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), quick = args.includes('--quick'), fast = args.includes('--fast'), words = args.filter(a => !a.startsWith('--'));
// a heavy suite is skipped by file name, so a NEW test file anywhere still runs in the fast tier; an edit to a heavy suite is only caught by --quick, a full run and CI
const HEAVY = /decide.test|signed.test|snapshot.test|init.test/;
const SLOW = /smoke-cli.test|controls\.test|migration\.test|sync\.test/;

const suites = [];
for (const tool of readdirSync(join(ROOT, 'tools')).sort()) {
  const dir = join(ROOT, 'tools', tool, 'test');
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).sort()) if (f.endsWith('.test.mjs')) suites.push(join(dir, f));
}
const chosen = suites.filter(s => ((!quick && !fast) || !SLOW.test(s)) && (!fast || !HEAVY.test(s)) && (!words.length || words.some(w => s.includes(w))));

function runOne(file) {
  return new Promise(res => {
    const t0 = Date.now(); let out = '';
    const p = spawn(process.execPath, ['--test', '--test-reporter=tap', file], { cwd: ROOT, env: { ...process.env } });
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('close', code => {
      const n = k => Number((out.match(new RegExp('^# ' + k + ' ([0-9]+)', 'm')) || [0, 0])[1]);
      res({ file: relative(ROOT, file).split(String.fromCharCode(92)).join('/'), code, tests: n('tests'), pass: n('pass'), fail: n('fail'), skipped: n('skipped'), secs: Math.round((Date.now() - t0) / 1000), out });
    });
  });
}

let bad = 0, T = 0, P = 0, F = 0, S = 0;
for (const f of chosen) {
  const r = await runOne(f);
  T += r.tests; P += r.pass; F += r.fail; S += r.skipped;
  const ok = r.code === 0 && r.fail === 0 && r.tests > 0;
  if (!ok) { bad++; console.log(r.out.split('\n').slice(-60).join('\n')); }
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.file}  tests ${r.tests}  pass ${r.pass}  fail ${r.fail}  skipped ${r.skipped}  ${r.secs}s`);
}
console.log(`\ntotal: ${T} tests, ${P} pass, ${F} fail, ${S} skipped in ${chosen.length} suites`);
process.exit(bad ? 1 : 0);
