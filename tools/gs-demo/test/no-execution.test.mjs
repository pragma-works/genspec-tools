// SPDX-License-Identifier: MIT
// gs-demo claims "it ran no code of your project". This proves it: a project full of canaries (every place where a project could get code run when
// someone reads it: package scripts, git hooks, a lock tool of its own, a gate script, and a .git/config that names programs for git to run) is looked at,
// and not one canary may fire. A control first shows that the git config canaries ARE live (plain `git status` fires the file-system monitor).
//   F-008.7 gs demo executes nothing from the target.
// Run: node --test tools/gs-demo/test/no-execution.test.mjs
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO = path.join(HERE, '..', 'gs-demo.mjs'), GS = path.join(HERE, '..', '..', '..', 'bin', 'gs.mjs');
const fwd = p => p.split(path.sep).join('/');
const env = () => { const e = { ...process.env }; for (const k of Object.keys(e)) if (/^(GIT_DIR|GIT_INDEX_FILE|GIT_WORK_TREE|GIT_PREFIX|NODE_TEST_CONTEXT|NODE_OPTIONS)$/.test(k)) delete e[k]; return e; };
const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { cwd, encoding: 'utf8', env: env() });

function booby(root) {
  const work = fs.mkdtempSync(path.join(root, 'proj-')), canaryDir = fs.mkdtempSync(path.join(root, 'canaries-'));
  const mark = name => path.join(canaryDir, name);
  const writer = fs.mkdtempSync(path.join(root, 'writer-')), w = path.join(writer, 'w.cjs'); // writes the canary named by argv[2]
  fs.writeFileSync(w, "require('fs').writeFileSync(process.argv[2], 'executed');\n");
  const cmd = name => `node ${fwd(w)} ${fwd(mark(name))}`;
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(work, rel)), { recursive: true }); fs.writeFileSync(path.join(work, rel), text); };
  put('README.md', '# Booby-trapped\n\nClean clone:\n\n```bash\nnpm install\nnpm test\n```\n');
  put('package.json', JSON.stringify({ name: 'booby', version: '1.0.0', scripts: { test: cmd('npm-test'), prepare: cmd('npm-prepare'), postinstall: cmd('npm-postinstall') } }));
  put('CLAUDE.md', '# Map\n\nSee docs/spec/SPEC.md\n');
  put('docs/spec/SPEC.md', '# Spec\n\n## Requirements\n\n- R-001 It adds.\n- R-002 It subtracts.\n- R-003 It multiplies.\n\n### Acceptance criteria\n\n- AC-001 adds. verified by: test/a.test.js\n');
  put('docs/spec.lock', '{}\n');
  put('tools/gs-lock/gs-lock.mjs', `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(mark('target-lock-tool'))}, 'executed');\n`); // a lock tool of the project itself
  put('scripts/gate.js', `require('fs').writeFileSync(${JSON.stringify(mark('gate-script'))}, 'executed');\n`);
  put('.githooks/pre-commit', `#!/bin/sh\n${cmd('hook-pre-commit')}\n`);
  put('.husky/pre-commit', `#!/bin/sh\n${cmd('husky-pre-commit')}\n`);
  put('test/a.test.js', "require('node:test')('a', () => {});\n");
  git(work, 'init', '-q', '-b', 'main'); git(work, 'add', '-A');
  for (const m of ['feat: one', 'feat: two', 'feat: three', 'feat: four', 'feat: five']) git(work, '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '--allow-empty', '-m', m + ' of the booby-trapped project');
  // the repository config names programs for git to run
  fs.appendFileSync(path.join(work, '.git', 'config'), `[core]\n\tfsmonitor = ${cmd('git-fsmonitor')}\n\tpager = ${cmd('git-pager')}\n\thooksPath = .githooks\n[diff]\n\texternal = ${cmd('git-diff-external')}\n`);
  return { work, canaryDir, names: ['npm-test', 'npm-prepare', 'npm-postinstall', 'target-lock-tool', 'gate-script', 'hook-pre-commit', 'husky-pre-commit', 'git-fsmonitor', 'git-pager', 'git-diff-external'], mark };
}
const fired = b => fs.readdirSync(b.canaryDir);

test('control: the canaries are live (git status in the project fires the file-system monitor named in its .git/config)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-noexec-')); const b = booby(root);
  try { git(b.work, 'status'); assert.ok(fired(b).includes('git-fsmonitor'), 'the control canary fired: the traps work, so a silent demo means something'); }
  finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }); }
});

// F-008.7
for (const how of ['gs-demo directly', 'gs demo (the front door)']) {
  test(`${how} executes nothing from the target: no canary fires, and it still gives a look`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-noexec-')); const b = booby(root);
    try {
      const args = how.startsWith('gs-demo') ? [DEMO, b.work] : [GS, 'demo', b.work];
      const r = spawnSync(process.execPath, args, { encoding: 'utf8', env: env(), timeout: 120000, cwd: root });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /E05/); assert.match(r.stdout, /ran no code of your project/);
      assert.deepStrictEqual(fired(b), [], 'canaries that fired: ' + fired(b).join(', '));
    } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }); }
  });
}
