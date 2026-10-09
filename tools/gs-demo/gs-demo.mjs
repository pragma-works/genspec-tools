#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Juan Carlos Ghiringhelli, PragmaWorks
//
// gs-demo: a quick look (about 30 seconds) at a project folder. One file, Node 18+, no dependencies, no model, no network.
//
//   node tools/gs-demo/gs-demo.mjs <path-to-repo> [--budget <seconds>] [--max-mb <n>] [--json]
//
// What it does
//   1. Copies the folder to a temporary folder (skipping dependency and build folders, symbolic links and files that look like secrets).
//      The original is only read, never written. A very large folder is refused with a clear message.
//   2. Runs fast checks on the COPY, with no model and without running any code of the project. The only program it runs is gs-lock,
//      from this repository, and only when the project has a spec lock.
//   3. Prints, for each of the twelve elements: found, weak (with the reason), missing, or "not checked in the quick look".
//      Then what it found, what is missing, and the three most valuable next steps.
//
// What it is not: not an audit, not a grade, not a certification. "Found" means the form is there and, where said, that the
// wiring was read; it does not mean the thing works. Whether a gate really refuses a bad change is what gs-check tests (minutes, not
// seconds). The result never contains a score or a verdict about the project as a whole.
//
// Exit codes: 0 the look ran, 2 usage error or the folder was refused, 1 unexpected error.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKIP_DIRS = new Set(['node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build', 'target', 'bin', 'obj', '.next', '.gradle', '.idea', '.vs', 'coverage', '.tox', '.mypy_cache', '.pytest_cache']);
const SECRET_FILE = /^(\.env(\..*)?|.*\.pem|.*\.key|.*\.pfx|.*\.p12|id_rsa.*|id_ed25519.*|credentials(\..*)?|.*\.keystore|\.npmrc|\.netrc)$/i;
const DEFAULTS = { budgetSec: 30, maxMb: 150, maxFiles: 20000, gitMaxMb: 100 };
const posix = p => p.split(path.sep).join('/');

export const ELEMENTS = [
  ['E01', 'a sentinel file that routes to the project documents'],
  ['E02', 'a spec with numbered requirements and acceptance criteria'],
  ['E03', 'decision records, referenced from the documents'],
  ['E04', 'architecture, data model and conventions documents'],
  ['E05', 'tests plus a gate that blocks a failing change'],
  ['E06', 'a ratchet floor that only goes up'],
  ['E07', 'a gate that stops on open questions'],
  ['E08', 'every acceptance criterion maps to a test'],
  ['E09', 'small, descriptive, conventional commits'],
  ['E10', 'a spec lock that notices a changed spec'],
  ['E11', 'a gate that ties a behaviour change to the spec'],
  ['E12', 'the README steps work from a clean clone']
];
// What to do, per element, when it is missing or weak. The order is the order of value: what the rest depends on comes first.
const PRIORITY = ['E02', 'E05', 'E01', 'E08', 'E03', 'E10', 'E06', 'E04', 'E07', 'E11', 'E09'];
const FIX = {
  E02: 'Write down what the software must do as a spec with numbered requirements and acceptance criteria (for example docs/spec/SPEC.md). Everything else hangs from it.',
  E05: 'Put the tests behind a gate that refuses a failing change (a commit hook, or a CI step that must pass) and make sure the hook is installed for everyone who clones the project.',
  E01: 'Add a short sentinel file (CLAUDE.md or AGENTS.md) at the root that points to the spec, architecture, conventions and decisions, so an assistant starts from your documents.',
  E08: 'Make every acceptance criterion id appear in a test or in a coverage table (docs/coverage.md), so a criterion nobody tests becomes visible.',
  E03: 'Record the main decisions as short files (docs/decisions/0001-...md: what was decided, why, what was rejected) and link them from the sentinel or the spec.',
  E10: 'Add a spec lock (tools/gs-lock in this repository) so a change to a locked spec section is noticed by the next check.',
  E06: 'Keep a floor file (for example docs/ratchet.json with the number of tests) and a gate that fails when a measurement drops below it or the floor is lowered.',
  E04: 'Write short architecture, data model and conventions documents and route to them from the sentinel.',
  E07: 'Keep an open-questions list and let a gate refuse a commit while a question marked OPEN is unanswered.',
  E11: 'Let the commit hook refuse a source change whose message cites no spec id and touches no document, unless it is typed as a refactor.',
  E09: 'Commit in small steps with conventional messages (feat:, fix:, docs:, ...) that say what changed.'
};

// ---------- small helpers ----------
const sh = (cmd, args, cwd, timeoutMs = 10000) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1 << 24, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } });
  return { code: r.status === null ? -1 : r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '', timedOut: !!(r.error && r.error.code === 'ETIMEDOUT') };
};
const readText = p => { try { return fs.readFileSync(p, 'utf8').replace(/\r/g, '').replace(/^﻿/, ''); } catch { return null; } };
const nonBlank = t => (t || '').split('\n').filter(l => l.trim()).length;

// ---------- sizing and copying ----------
// Walk the folder the way the copy will: no dependency or build folders, no symbolic links, no secret-looking files.
function walkTree(root, onFile) {
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    let entries;
    try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) stack.push(r); continue; }
      if (!e.isFile() || SECRET_FILE.test(e.name)) continue;
      if (onFile(r) === false) return false;
    }
  }
  return true;
}
export function measure(root, limits) {
  let files = 0, bytes = 0, gitBytes = 0, gitFiles = 0;
  const done = walkTree(root, r => {
    let size = 0; try { size = fs.statSync(path.join(root, r)).size; } catch { return true; }
    if (r === '.git' || r.startsWith('.git/')) { gitFiles++; gitBytes += size; return true; }
    files++; bytes += size;
    return !(files > limits.maxFiles || bytes > limits.maxMb * 1048576);
  });
  return { files, bytes, gitBytes, gitFiles, tooLarge: !done };
}
function copyTree(root, dest, { withGit, deadline }) {
  let n = 0;
  walkTree(root, r => {
    if ((r === '.git' || r.startsWith('.git/')) && !withGit) return true;
    if (++n % 200 === 0 && Date.now() > deadline) return false;
    const to = path.join(dest, r);
    try { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(root, r), to); } catch { /* unreadable file: skipped */ }
    return true;
  });
  return n;
}

function listFiles(dir) { const out = []; walkTree(dir, r => { out.push(r); return true; }); return out; }

// ---------- the checks (all on the copy) ----------
const SENTINELS = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.github/copilot-instructions.md', '.cursorrules', '.cursor/rules'];
const ID = String.raw`[A-Z][A-Z0-9]{0,5}(?:-[A-Z][A-Z0-9]{0,5})?-\d{1,4}(?:\.[A-Z]?\d{1,3}){0,2}`;
const LEADING_ID = new RegExp(String.raw`^[\s>|*_\-+\d.)\[\]xX~]*\**(${ID})(?![\w-])`);
const TEST_FILE = /(^|\/)(tests?|__tests__|spec|specs)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]*\.py$|_test\.(go|py)$|Tests?\.(cs|java)$/i;
const CONVENTIONAL = /^(feat|fix|docs|test|tests|chore|refactor|ci|build|perf|style|revert)(\([^)]+\))?!?: \S/;

function ctxFor(copy) {
  const files = listFiles(copy);
  const set = new Set(files);
  const has = p => set.has(p);
  const text = p => readText(path.join(copy, p));
  const sentinel = SENTINELS.find(s => has(s)) || files.find(f => f.startsWith('.cursor/rules/')) || null;
  return { copy, files, set, has, text, sentinel };
}
function routesFrom(c, relFile) {
  const t = c.text(relFile) || '';
  const refs = new Set();
  for (const m of t.matchAll(/`([^`\s]+)`|\]\(([^)\s#]+)(?:#[^)]*)?\)|(?:^|\s)@([\w./-]+)/gm)) {
    const raw = (m[1] || m[2] || m[3] || '').replace(/[.,;:]+$/, '');
    // '@word/word' without a file extension is a package scope (@nx/react), not an @-import of a document
    if (m[3] && !m[1] && !m[2] && !/\.(md|json|ya?ml|txt|toml)$/i.test(raw)) continue;
    // a web address written without the scheme (example.dev/try) is not a file of the project
    if (/^[\w-]+(\.[\w-]+)*\.(dev|com|io|org|net|app|ai|co|edu|me)(\/|$)/i.test(raw)) continue;
    if (!raw || /^[a-z]+:\/\//i.test(raw) || raw.startsWith('mailto:') || raw.startsWith('#') || /[*<>{}$|()=\[\]]/.test(raw)) continue;
    if (!raw.includes('/') && !/\.(md|json|yml|yaml|txt|toml)$/i.test(raw)) continue;
    refs.add(raw.replace(/^\.\//, '').replace(/\/$/, ''));
  }
  const base = path.posix.dirname(relFile);
  const found = [], dangling = [];
  for (const r of refs) {
    const cand = [r, base === '.' ? r : path.posix.join(base, r)];
    const hit = cand.find(x => c.has(x) || c.files.some(f => f.startsWith(x + '/')));
    if (hit) found.push(hit);
    else if (/^[\w.-]+(\/[\w.-]+)+$|^[\w.-]+\.(md|json|ya?ml|txt|toml)$/.test(r) && !/^(docs\/ratifications\.md|docs\/spec\.lock)$/.test(r)) {
      // count it only when it looks like a file of this project: it ends in a file extension, or it starts inside a folder that exists
      // (code such as DateTime.Now/UtcNow, or a package name such as react-three/fiber, is not a route)
      const first = r.split('/')[0];
      if (/\.[A-Za-z0-9]{1,5}$/.test(r) || c.files.some(f => f.startsWith(first + '/'))) dangling.push(r);
    }
  }
  return { found: [...new Set(found)], dangling: [...new Set(dangling)] };
}
function nonEmptyRoute(c, r) { if (c.has(r)) return nonBlank(c.text(r)) > 0; return c.files.some(f => f.startsWith(r + '/')); }

function specInfo(c) {
  const specFiles = c.files.filter(f => /^((docs?|openspec|\.kiro)\/)?(specs?|features)\/.+\.md$/i.test(f) || /^(docs?\/)?spec(ification)?\.md$/i.test(f) || /^SPEC\.md$/i.test(f));
  const defs = [], dupes = new Set(), seen = new Set(), bare = new Set(); const crit = []; let perFeature = false;
  for (const f of specFiles) {
    let heading = '';
    for (const line of (c.text(f) || '').split('\n')) {
      const h = line.match(/^#{1,6}\s+(.*)$/); if (h) { heading = h[1]; continue; }
      const m = line.match(LEADING_ID); if (!m || /^ADR/.test(m[1])) continue; // a decision-record id is not a requirement
      // spec-kit layout: each feature folder (specs/001-name/) numbers its own FR-001, so the same id in two folders is not a duplicate
      const feat = (f.match(/(^|\/)specs?\/(\d{2,4}[-_][^/]+)\//i) || [])[2] || '';
      if (feat) perFeature = true;
      const key = feat + '|' + m[1];
      defs.push(m[1]); if (seen.has(key)) dupes.add(m[1]); seen.add(key); bare.add(m[1]);
      if (/criteri|accept|aceptaci/i.test(heading) || /^(AC|CR|CRIT)\b/.test(m[1])) crit.push(m[1]);
    }
  }
  return { specFiles, perFeature, ids: [...bare], idCount: seen.size, dupes: [...dupes], criteria: [...new Set(crit.length ? crit : [...bare])] };
}

const R = (status, note) => ({ status, note });
const found = note => R('found', note), weak = note => R('weak', note), missing = note => R('missing', note), skipped = note => R('not checked', note);

function e01(c) {
  if (!c.sentinel) return missing('no CLAUDE.md, AGENTS.md or similar file at the root');
  const file = c.has(c.sentinel) ? c.sentinel : c.files.find(f => f.startsWith(c.sentinel + '/') || f.startsWith('.cursor/rules/'));
  if (nonBlank(c.text(file)) < 5) return weak(`${file} is a stub (fewer than 5 lines)`);
  const { found: ok, dangling } = routesFrom(c, file);
  const good = ok.filter(r => nonEmptyRoute(c, r)), docs = good.filter(r => /\.(md|mdx|txt|rst)$/i.test(r) || /^(docs?|adr|decisions)(\/|$)/i.test(r));
  if (dangling.length) return weak(`${file} mentions paths that do not exist: ${dangling.slice(0, 4).join(', ')} (if these are advice and not routes to documents, ignore this)`);
  if (docs.length < 2) return weak(`${file} routes to ${docs.length} document(s); a sentinel should route to the spec, architecture, conventions and decisions`);
  return found(`${file} routes to ${docs.length} existing documents`);
}
// folders that tools for spec-driven development create; named so that a project using them is not told it has nothing
function toolFolders(c) {
  const marks = [['.specify/', 'spec-kit'], ['openspec/', 'OpenSpec'], ['_bmad/', 'BMAD'], ['.bmad-core/', 'BMAD'], ['.kiro/specs/', 'Kiro']];
  return marks.filter(([p]) => c.files.some(f => f.startsWith(p))).map(([p, n]) => `${n}: ${p}`);
}
function e02(c, S) {
  const tool = toolFolders(c);
  const toolNote = tool.length ? ` A spec-driven tool folder is present (${tool.join(', ')}); its specs count only if they sit under specs/ or docs/spec(s)/ and start their lines with ids like FR-001.` : '';
  if (!S.specFiles.length) return missing('no spec file found (docs/spec/SPEC.md, docs/specs/, SPEC.md).' + toolNote);
  if (!S.ids.length) return weak('a spec file exists but defines no numbered ids (like REQ-001 or AC-001).' + toolNote);
  if (S.dupes.length) return weak(`id defined twice: ${S.dupes.slice(0, 4).join(', ')}`);
  if (S.idCount < 3) return weak(`only ${S.idCount} numbered id(s) (${S.ids.join(', ')}); a spec usually states several requirements`);
  if (!S.criteria.length) return weak('requirement ids found but no acceptance criteria');
  return found(`${S.idCount} numbered ids, ${S.criteria.length} acceptance criteria, no duplicates${S.perFeature ? ' (ids are numbered per feature folder)' : ''}`);
}
function e03(c) {
  const dir = ['docs/decisions', 'docs/adr', 'docs/adrs', 'adr', 'adrs', 'doc/adr', 'docs/architecture/decisions', 'decisions'].find(d => c.files.some(f => f.startsWith(d + '/') && f.endsWith('.md')));
  if (!dir) return missing('no decisions folder (docs/decisions, docs/adr, ...) with records');
  const recs = c.files.filter(f => f.startsWith(dir + '/') && f.endsWith('.md') && !/readme|template/i.test(f));
  if (!recs.length) return missing(`${dir} has no records`);
  const hay = c.files.filter(f => f.endsWith('.md') && !f.startsWith(dir + '/')).map(f => c.text(f) || '').join('\n');
  const loose = recs.filter(r => !hay.includes(path.posix.basename(r)) && !hay.includes(r));
  if (loose.length) return weak(`${loose.length} of ${recs.length} records are referenced by no document (${path.posix.basename(loose[0])}${loose.length > 1 ? ', ...' : ''})`);
  return found(`${recs.length} record(s) in ${dir}, all referenced`);
}
function e04(c) {
  const kinds = [['architecture', /(^|\/)(architecture|arquitectura)[^/]*\.md$/i], ['data model', /(^|\/)(data[-_ ]?model|schema|modelo[-_ ]?de[-_ ]?datos)[^/]*\.md$/i], ['conventions', /(^|\/)(conventions|style|convenciones|coding[-_ ]?standards)[^/]*\.md$/i]];
  const got = [], lack = [], stub = [], unrouted = [];
  const sentinelText = c.sentinel ? (c.text(c.has(c.sentinel) ? c.sentinel : c.files.find(f => f.startsWith('.cursor/rules/')) || '') || '') : '';
  for (const [name, re] of kinds) {
    const f = c.files.find(x => re.test(x) && /\.md$/.test(x) && (x.startsWith('docs/') || x.startsWith('doc/') || !x.includes('/')));
    if (!f) { lack.push(name); continue; }
    if (nonBlank(c.text(f)) < 5) stub.push(name); else got.push(name);
    if (!sentinelText.includes(f) && !sentinelText.includes(path.posix.basename(f))) unrouted.push(name);
  }
  if (!got.length && !stub.length) return missing('none of architecture, data model, conventions found under docs/');
  if (lack.length || stub.length) return weak(`${lack.length ? 'missing: ' + lack.join(', ') : ''}${lack.length && stub.length ? '; ' : ''}${stub.length ? 'only a stub: ' + stub.join(', ') : ''}`);
  if (unrouted.length) return weak(`the sentinel does not route to: ${unrouted.join(', ')}`);
  return found('architecture, data model and conventions exist and are routed from the sentinel');
}

// Gates: hooks, their wiring, the CI file, and package scripts. Read, not run.
function gateFacts(c) {
  const hookFiles = c.files.filter(f => /^(\.githooks|\.husky|githooks|hooks)\/[^/]+$/.test(f) && !/\.sample$/.test(f) && !/^\.husky\/(_|\.gitignore)/.test(f));
  const hooks = hookFiles.map(f => ({ file: f, text: c.text(f) || '' }));
  const real = h => {
    const lines = h.text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    return lines.some(l => !/^(exit\s+0|true|:|echo\b.*|printf\b.*|set\s+[-+]\w+.*)$/.test(l));
  };
  const blocking = hooks.filter(real);
  const pkg = (() => { try { return JSON.parse(c.text('package.json') || 'null'); } catch { return null; } })();
  const scripts = pkg && pkg.scripts ? pkg.scripts : {};
  const hookInstaller = /install[-_]?hooks|core\.hooksPath|husky|simple-git-hooks|lefthook|pre-commit install/;
  const gitConfig = c.text('.git/config') || '';
  const readme = c.text('README.md') || '';
  const wired = /hooksPath/.test(gitConfig) || c.files.some(f => f.startsWith('.husky/')) || c.has('.pre-commit-config.yaml') || c.has('lefthook.yml')
    || Object.entries(scripts).some(([k, v]) => /^(prepare|postinstall|install|setup|hooks)$/.test(k) && hookInstaller.test(v)) || (pkg && pkg['simple-git-hooks'] ? true : false)
    || hookInstaller.test(readme);
  const ciFiles = c.files.filter(f => /^\.github\/workflows\/[^/]+\.ya?ml$|^\.gitlab-ci\.yml$|^azure-pipelines\.yml$|^\.circleci\/config\.yml$|^Jenkinsfile$/.test(f));
  // (scan, 2026-10-09) requests runs its tests with `make ci`; other projects use tox, nox, just, bun, vitest, jest and the like
  const TESTCMD = /\b(npm (run )?test|npm run \w*(test|check|gate|ci)\w*|(yarn|pnpm|bun)( run)? (-\w+ )*test|pytest|python -m (pytest|unittest)|go test|dotnet test|cargo (nextest|test)|node --test|mvn (-\w+ )*(test|verify)|gradle(w)? (test|check)|make (test|tests|check|ci)|just (test|check|ci)|tox|nox|vitest|jest|deno test|mix test|rake (test|spec)|ctest|swift test|flutter test|sbt test|bundle exec rspec|phpunit)\b/;
  const ci = ciFiles.filter(f => { const t = c.text(f) || ''; return TESTCMD.test(t) && !/continue-on-error:\s*true/.test(t); });
  const testScript = scripts.test && !/no test specified|^\s*(echo|exit 0|true)\b/.test(scripts.test) ? scripts.test : null;
  const tests = c.files.filter(f => TEST_FILE.test(f) && !/(^|\/)(fixtures?|node_modules)\//.test(f));
  return { hooks, blocking, wired, ci, ciFiles, scripts, testScript, tests, pkg, allGateText: [...hooks.map(h => h.text), ...c.files.filter(f => /(^|\/)(gate|check|verify)[^/]*\.(js|mjs|cjs|py|sh)$/i.test(f) || /^scripts\/.+/.test(f)).map(f => c.text(f) || ''), ...ciFiles.map(f => c.text(f) || ''), ...Object.values(scripts)].join('\n') };
}
function e05(c, G) {
  if (!G.tests.length) return missing('no test files found');
  const empty = G.hooks.filter(h => !G.blocking.includes(h));
  if (empty.length) return weak(`hook(s) that look like a gate but never block (only print or exit 0): ${empty.slice(0, 3).map(h => h.file).join(', ')}`);
  if (G.hooks.length && !G.wired) return weak('hooks are versioned but nothing installs them (no prepare script, husky, core.hooksPath or instruction)');
  const viaHook = G.blocking.length > 0, viaCi = G.ci.length > 0;
  if (viaHook || viaCi) return found(`${G.tests.length} test file(s); ${[viaHook ? 'a hook with content, installed by a script or instruction' : '', viaCi ? 'a CI step that runs the tests' : ''].filter(Boolean).join(' and ')} (wiring read, not exercised)`);
  if (G.testScript) return weak('tests exist and run with a script, but nothing runs that script for you: no hook, no CI step');
  return weak('tests exist but no gate runs them');
}
function e06(c, G) {
  const f = c.files.find(x => /(^|\/)(ratchet|baseline|floors?)[^/]*\.(json|ya?ml|txt)$/i.test(x) && !/(^|\/)node_modules\//.test(x));
  if (!f) return missing('no ratchet or floor file');
  const t = c.text(f) || ''; const nums = [...t.matchAll(/:\s*(-?\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
  if (!nums.length) return weak(`${f} holds no numbers`);
  if (nums.every(n => n === 0)) return weak(`${f} floors are all zero, so nothing can fall below them`);
  const name = path.posix.basename(f);
  const used = new RegExp(`ratchet|${name.replace(/\./g, '\\.')}`, 'i').test(G.allGateText);
  if (!used) return weak(`${f} exists but no hook, script or CI file mentions it`);
  return found(`${f} has ${nums.length} floor value(s) and a gate mentions it (wiring read, not exercised)`);
}
function e07(c, G) {
  const doc = c.files.find(f => /open[-_ ]?questions/i.test(f)) || c.files.find(f => /^(docs?\/)?(specs?\/.+|spec)\.md$/i.test(f) && /open questions/i.test(c.text(f) || ''));
  const gate = /\bOPEN:|open[-_ ]?questions?|\bTBD\b.*(fail|block)|preguntas[-_ ]abiertas/i.test(G.allGateText);
  if (!doc && !gate) return missing('no open-questions list and no gate that looks for open questions');
  if (!gate) return weak('open questions are kept in a document, but no hook, script or CI file looks for unanswered ones');
  return found('a gate looks for open questions' + (doc ? ` (list: ${doc})` : '') + ' (wiring read, not exercised)');
}
function e08(c, S) {
  if (!S.criteria.length) return missing('no acceptance criteria to cover (needs the spec first)');
  const cov = c.files.filter(f => /coverage/i.test(f) && /\.(md|json|csv|txt)$/i.test(f) && !/(^|\/)(node_modules|coverage\/)/.test(f));
  const testText = c.files.filter(f => TEST_FILE.test(f) && !/(^|\/)fixtures?\//.test(f)).map(f => c.text(f) || '').join('\n');
  const covText = cov.map(f => c.text(f) || '').join('\n');
  const uncovered = S.criteria.filter(id => !testText.includes(id) && !covText.includes(id));
  if (!cov.length && !testText) return missing('no coverage table and no tests that cite criterion ids');
  if (uncovered.length) return weak(`${uncovered.length} of ${S.criteria.length} criteria are in no test and no coverage table: ${uncovered.slice(0, 5).join(', ')}`);
  return found(`all ${S.criteria.length} criteria appear in a test or in the coverage table (a mention, not proof that the test checks it${S.perFeature ? '; ids repeat across feature folders, so a mention of one id cannot say which feature it covers' : ''})`);
}
// The twelve checks are written for software projects. Say so when the folder is mostly something else (documents, content, game assets).
const SOURCE_EXT = /\.(js|mjs|cjs|jsx|ts|tsx|py|cs|go|rs|java|kt|rb|php|c|cc|cpp|h|hpp|gd|swift|lua|sh|ps1|scala|dart|vue|svelte)$/i;
export function profileOf(c) {
  const files = c.files.filter(f => !f.startsWith('.git/'));
  const source = files.filter(f => SOURCE_EXT.test(f)).length;
  const notCode = files.length >= 10 && (source === 0 || source / files.length < 0.05);
  return { files: files.length, sourceFiles: source, codeProject: !notCode, note: notCode ? `Only ${source} of ${files.length} files are source code. These twelve checks are written for software projects; a documents, content or game-assets project needs a different profile, and a "missing" below says little about it.` : '' };
}
function e09(c, orig, gitOk, gitNote) {
  if (!gitOk) return skipped(gitNote || 'the git history was not available or was too large to copy');
  const r = sh('git', ['log', '-n', '50', '--no-merges', '--pretty=%s'], c.copy);
  if (r.code !== 0) return skipped('this folder is not a git repository');
  const subjects = r.stdout.split('\n').map(s => s.trim()).filter(Boolean);
  if (subjects.length < 5) return skipped(`only ${subjects.length} commits so far`);
  const conv = subjects.filter(s => CONVENTIONAL.test(s)).length, share = conv / subjects.length;
  const lens = subjects.map(s => s.length).sort((a, b) => a - b), median = lens[Math.floor(lens.length / 2)];
  if (share < 0.8) return weak(`${conv} of the last ${subjects.length} commit messages are conventional (feat:, fix:, docs:, ...); only that style is recognised, so clear messages in another style are not counted`);
  if (median < 15) return weak(`messages are conventional but very short (median ${median} characters)`);
  return found(`${conv} of the last ${subjects.length} commit messages are conventional and descriptive`);
}
function e10(c, lockTool, deadline) {
  if (!c.has('docs/spec.lock')) return missing('no docs/spec.lock');
  if (!lockTool) return found('docs/spec.lock exists; gs-lock was not found beside this demo, so it was not verified');
  if (Date.now() > deadline - 2000) return skipped('out of time');
  const r = sh(process.execPath, [lockTool, 'check', '--root', c.copy], c.copy, Math.max(3000, Math.min(15000, deadline - Date.now())));
  if (r.timedOut) return skipped('the lock check took too long');
  if (r.code === 0) return found('docs/spec.lock exists and gs-lock check passes on the copy (ran gs-lock)');
  const first = r.out.split('\n').map(s => s.trim()).filter(Boolean)[0] || 'the check reported findings';
  return weak(`gs-lock check reports findings: ${first.slice(0, 120)}`);
}
function e11(c, G) {
  const text = G.hooks.map(h => h.text).join('\n') + '\n' + G.allGateText;
  const tool = /gs-cochange/.test(text);
  const own = /commit[-_ ]?msg/i.test(text) && /(\[A-Z\]|[A-Z]{2,5}-\\?d|criterion id|spec id|cite)/i.test(text) && /docs?\//.test(text);
  if (!tool && !own) return missing('no hook or script that ties a source change to the spec');
  if (!G.blocking.length && !G.ci.length) return weak('a co-change rule is written down but no installed hook or CI step runs it');
  return found((tool ? 'gs-cochange is referenced' : 'a script checks the message and the documents') + ' (wiring read, not exercised)');
}
const e12 = () => skipped('needs a clean clone and a run of the steps; gs-check does it');

// ---------- the look ----------
export function lookAt(target, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const start = Date.now(), deadline = start + o.budgetSec * 1000;
  const root = path.resolve(target);
  let st; try { st = fs.statSync(root); } catch { return { refused: `The path does not exist: ${root}` }; }
  if (!st.isDirectory()) return { refused: `Not a folder: ${root}` };
  const m = measure(root, o);
  if (m.tooLarge) return { refused: `This folder is large (more than ${o.maxFiles} files or ${o.maxMb} MB, without dependency and build folders). The quick look is meant for a project folder of normal size, and it copies the folder to look at it. Point it at a smaller folder, or use tools/gs-check for a full check.` };
  const withGit = m.gitFiles > 0 && m.gitBytes <= o.gitMaxMb * 1048576;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-demo-'));
  const copy = path.join(tmp, 'copy');
  try {
    fs.mkdirSync(copy);
    copyTree(root, copy, { withGit, deadline });
    const c = ctxFor(copy);
    const lockTool = ['..', 'gs-lock', 'gs-lock.mjs'].reduce((a, b) => path.join(a, b), HERE);
    const lockPath = fs.existsSync(lockTool) ? lockTool : null;
    const S = specInfo(c), G = gateFacts(c);
    const safe = (id, fn) => { if (Date.now() > deadline) return skipped('out of time'); try { return fn(); } catch (e) { return skipped('this check failed to run: ' + String(e && e.message).slice(0, 80)); } };
    const res = {
      E01: safe('E01', () => e01(c)), E02: safe('E02', () => e02(c, S)), E03: safe('E03', () => e03(c)), E04: safe('E04', () => e04(c)),
      E05: safe('E05', () => e05(c, G)), E06: safe('E06', () => e06(c, G)), E07: safe('E07', () => e07(c, G)), E08: safe('E08', () => e08(c, S)),
      E09: safe('E09', () => e09(c, root, withGit, m.gitFiles > 0 ? `the git history is ${Math.round(m.gitBytes / 1048576)} MB, over the ${o.gitMaxMb} MB the quick look copies, so commits were not examined` : 'this folder has no .git folder, so commits were not examined')), E10: safe('E10', () => e10(c, lockPath, deadline)), E11: safe('E11', () => e11(c, G)), E12: e12()
    };
    return { root, files: m.files, secs: Math.round((Date.now() - start) / 100) / 10, profile: profileOf(c), results: res };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 }); } catch { /* best effort */ }
  }
}

// ---------- the report ----------
const LABEL = { found: 'found', weak: 'weak', missing: 'missing', 'not checked': 'not checked in the quick look' };
export function render(look, repoArg = '<path-to-repo>') {
  const L = [], res = look.results;
  const by = s => ELEMENTS.filter(([id]) => res[id].status === s);
  L.push(`gs-demo: a quick look at ${look.root}`);
  L.push(`A copy was examined in a temporary folder and then deleted; your folder was only read. (${look.files} files, ${look.secs} s)`);
  if (look.profile && look.profile.note) { L.push(''); L.push('Note: ' + look.profile.note); }
  L.push('');
  for (const [id, name] of ELEMENTS) {
    const r = res[id];
    L.push(`${id}  ${name}`);
    L.push(`      ${LABEL[r.status]}${r.note ? ': ' + r.note : ''}`);
  }
  L.push('');
  const f = by('found'), w = by('weak'), mi = by('missing'), nc = by('not checked');
  L.push('What it found');
  L.push(f.length ? `  Found: ${f.map(([id]) => id).join(', ')}.` : '  No element was found in a form this quick look can recognise.');
  L.push('What is missing or weak');
  L.push(mi.length + w.length ? `  ${mi.length ? 'missing: ' + mi.map(([id]) => id).join(', ') + '.' : ''}${mi.length && w.length ? ' ' : ''}${w.length ? 'weak: ' + w.map(([id]) => id).join(', ') + '.' : ''}` : '  Nothing the quick look could see.');
  if (nc.length) L.push(`  Not checked in the quick look: ${nc.map(([id]) => id).join(', ')}.`);
  L.push('');
  const steps = PRIORITY.filter(id => res[id].status === 'missing' || res[id].status === 'weak').slice(0, 3);
  L.push('The three most valuable next steps');
  const extra = [
    `Run the full checker, which plants a violation and sees whether the gates refuse it (minutes): node tools/gs-check/gs-check.mjs --repo ${repoArg} --strict`,
    'Read the method and the twelve elements at https://genspec.dev, and pick the element that would hurt most if it failed tomorrow.',
    'Ask someone who did not write the project to follow the README from a clean clone and write down where they got stuck.'
  ];
  const list = steps.map(id => res[id].status === 'weak' ? `${id} is weak (${res[id].note}). Repair it before adding anything new: ${FIX[id]}` : `${id}: ${FIX[id]}`);
  for (const e of extra) if (list.length < 3) list.push(e);
  list.forEach((s, i) => L.push(`  ${i + 1}. ${s}`));
  L.push('');
  L.push('This is a quick look, not an audit grade and not a certification. "Found" means the form is there (and, where it says so, that the wiring was read); it does not mean that the thing works or that the software is right. It ran no code of your project.');
  return L.join('\n');
}

// ---------- CLI ----------
function main(argv) {
  const o = { json: false }; const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--budget') o.budgetSec = Number(argv[++i]);
    else if (a === '--max-mb') o.maxMb = Number(argv[++i]);
    else if (a === '--help' || a === '-h') { console.log('usage: node tools/gs-demo/gs-demo.mjs <path-to-repo> [--budget <seconds>] [--max-mb <n>] [--json]'); return 0; }
    else if (a.startsWith('--')) { console.error(`unknown option ${a}\nusage: node tools/gs-demo/gs-demo.mjs <path-to-repo> [--budget <seconds>] [--max-mb <n>] [--json]`); return 2; }
    else rest.push(a);
  }
  if (rest.length !== 1 || (o.budgetSec !== undefined && !(o.budgetSec > 0)) || (o.maxMb !== undefined && !(o.maxMb > 0))) { console.error('usage: node tools/gs-demo/gs-demo.mjs <path-to-repo> [--budget <seconds>] [--max-mb <n>] [--json]'); return 2; }
  const look = lookAt(rest[0], o);
  if (look.refused) { console.error('gs-demo: ' + look.refused); return 2; }
  console.log(o.json ? JSON.stringify(look, null, 2) : render(look, rest[0]));
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error('gs-demo: unexpected error: ' + (e && e.stack || e)); process.exitCode = 1; }
}
