#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Juan Carlos Ghiringhelli, PragmaWorks (licence text in ../../LICENSE; provided "AS IS", without warranty).
//
// gs-start: the hand-off from the deterministic part of gs to the person's own coding assistant. ONE file, Node 18+, no dependencies,
// no model, no network. It never runs the assistant on its own: `--launch <cli>` is the only way, and it is typed by the person.
//
//   node gs-start.mjs [--root <dir>] [--dry-run] [--json]      write .gs/inventory.json, .gs/inventory.md and .gs/start-prompt.md
//   node gs-start.mjs --verify-spec [--root <dir>]             check the FOUND IN CODE tags of docs/spec: does the file exist, is the line in range
//   node gs-start.mjs --clis                                    which assistant CLIs (claude, copilot, codex, gemini) are on the PATH
//
// The split (see README, "gs start"):
//   deterministic, here   the facts a program can read without a model: languages, package managers, test commands, entry points, folders,
//                         routes and commands where a pattern finds them, dependencies, documents, git history, CI, the state of the spec.
//   not deterministic     reading the code for intent, drafting the spec, asking the questions: that is the assistant's, from .gs/start-prompt.md.
//   never delegated       ratification. The prompt forbids the assistant to record one; the person does it (gs decide add, or an edit under their name).
// It reads files and runs read-only git commands (with every git setting that names a program switched off). It runs no code of the project.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SPEC_MD } from '../gs-init/gs-init.mjs';

const MANIFEST = '.gs-manifest.json';
// Order = usage evidence, 2026-10-10 (JetBrains Developer Ecosystem 2026, work use: Claude Code 39%, GitHub Copilot 21%, Codex 16%; npm weekly downloads and
// GitHub stars in the soma report gs-start-handoff-2026-10-09.md, section "Refinement 2026-10-10"). The first three are CORE: supported first, flags verified.
// Gemini CLI stays supported (flags read from its own --help) as a second tier: it is not close to the third in usage.
export const CORE_CLIS = ['claude', 'codex', 'copilot'];
export const CLIS = [...CORE_CLIS, 'gemini'];
// The only flags used, each read from that CLI's own --help on 2026-10-09 (claude 2.1.293 on this machine; copilot 1.0.95, codex 0.162.1 and
// gemini 0.63.0 installed in a node:22 container). A CLI whose flag could not be read is not in this table and gets the generic instruction.
export const CLI_START = {
  claude: { args: p => [p], note: 'claude [prompt]: "starts an interactive session by default"' },
  copilot: { args: p => ['-i', p], note: 'copilot -i, --interactive <prompt>: "Start interactive mode and automatically execute this prompt"' },
  codex: { args: p => [p], note: 'codex [PROMPT]: "Optional user prompt to start the session"' },
  gemini: { args: p => ['-i', p], note: 'gemini -i, --prompt-interactive: "Execute the provided prompt and continue in interactive mode"' },
};
export const PROMPT_FILE = '.gs/start-prompt.md';
export const INTRO = 'Read .gs/start-prompt.md and follow it step by step.';
export const GENERIC = 'open your assistant in this folder and say: follow .gs/start-prompt.md';

const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', '.venv', 'venv', 'env', '__pycache__', 'dist', 'build', 'target', 'bin', 'obj', 'out', '.next', '.nuxt', '.gradle', '.idea', '.vs', '.vscode', 'coverage', '.tox', '.mypy_cache', '.pytest_cache', '.gs-init-backup', 'vendor', 'site-packages', '.terraform', '.cache', '.turbo']);
const FIXTURE_DIRS = /^(fixtures?|__fixtures__|examples?|samples?|testdata|node_modules)$/i;
const SECRET_FILE = /^(\.env(\..*)?|.*\.pem|.*\.key|.*\.pfx|.*\.p12|id_rsa.*|id_ed25519.*|credentials(\..*)?|.*\.keystore|\.npmrc|\.netrc)$/i;
const SOURCE_EXT = /\.(js|mjs|cjs|jsx|ts|tsx|py|cs|go|rs|java|kt|rb|php|c|cc|cpp|h|hpp|gd|swift|lua|sh|ps1|scala|dart|vue|svelte)$/i;
const LANG = { js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', py: 'Python', cs: 'C#', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', rb: 'Ruby', php: 'PHP', c: 'C', h: 'C', cc: 'C++', cpp: 'C++', hpp: 'C++', gd: 'GDScript', swift: 'Swift', lua: 'Lua', sh: 'Shell', ps1: 'PowerShell', scala: 'Scala', dart: 'Dart', vue: 'Vue', svelte: 'Svelte' };
const MAX_FILES = 20000, MAX_READ = 200 * 1024, MAX_SCAN = 400;
const posix = p => p.split(path.sep).join('/');
const unbom = s => s.replace(/^﻿/, '');
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

// git settings that name a program to run are switched off, as in gs-demo: reading a stranger's history must not start anything of theirs
const NO_REPO_CODE = Object.fromEntries([['core.fsmonitor', 'false'], ['core.hooksPath', os.devNull], ['core.pager', 'cat'], ['core.sshCommand', 'false'], ['core.editor', 'true'], ['log.showSignature', 'false'], ['gpg.program', 'false'], ['diff.external', ''], ['credential.helper', '']]
  .flatMap(([k, v], i) => [['GIT_CONFIG_KEY_' + i, k], ['GIT_CONFIG_VALUE_' + i, v]]).concat([['GIT_CONFIG_COUNT', '9']]));
const git = (root, args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 20000, env: { ...process.env, ...NO_REPO_CODE, GIT_TERMINAL_PROMPT: '0' } });

// ---------------------------------------------------------------- the CLIs on the PATH (looked up as files; nothing is executed)
export function detectClis(pathVar = process.env.PATH || process.env.Path || '', platform = process.platform) {
  const dirs = pathVar.split(platform === 'win32' ? ';' : ':').filter(Boolean);
  const exts = platform === 'win32' ? ['', ...(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').toLowerCase().split(';').filter(Boolean)] : [''];
  const found = [];
  for (const cli of CLIS) {
    outer: for (const d of dirs) for (const e of exts) {
      const p = path.join(d.replace(/^"|"$/g, ''), cli + e);
      try { const st = fs.statSync(p); if (st.isFile() && (platform === 'win32' || (st.mode & 0o111))) { found.push({ cli, path: p }); break outer; } } catch { /* not here */ }
    }
  }
  return found;
}
export const handCommand = cli => [cli, ...CLI_START[cli].args('"' + INTRO + '"')].join(' ');

// ---------------------------------------------------------------- the walk
function walk(root) {
  const files = []; let truncated = false;
  const rec = rel => {
    let es = []; try { es = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
    es.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of es) {
      if (files.length >= MAX_FILES) { truncated = true; return; }
      const p = rel ? rel + '/' + e.name : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) rec(p); }
      else if (e.isFile() && !SECRET_FILE.test(e.name)) files.push(p);
    }
  };
  rec('');
  return { files, truncated };
}
const readText = (root, rel, max = MAX_READ) => {
  try { const fd = fs.openSync(path.join(root, rel), 'r'); try { const b = Buffer.alloc(max); const n = fs.readSync(fd, b, 0, max, 0); return unbom(b.toString('utf8', 0, n)); } finally { fs.closeSync(fd); } } catch { return null; }
};
const readJson = (root, rel) => { try { return JSON.parse(readText(root, rel, 2 * MAX_READ)); } catch { return null; } };

// what gs itself wrote, so that the project's own files are what is counted
const OWN_PATH = /^(\.gs\/|\.gs\.json$|\.gs-manifest\.json$|\.gs-init-backup\/|\.githooks\/|scripts\/(gs-gate|install-hooks)\.mjs$|tools\/(gs-[a-z]+\/|LICENSE$)|\.cursor\/rules\/gs\.mdc$)/;
function ownSet(root) {
  const m = readJson(root, MANIFEST), own = new Set();
  // a file counts as gs's only while it is still exactly what gs wrote; once the person or an assistant changed it, it is the project's
  if (m && m.files) for (const [k, v] of Object.entries(m.files)) { try { if (v && v.sha && sha(fs.readFileSync(path.join(root, k))) === v.sha) own.add(k); } catch { /* gone */ } }
  if (m && m.blocks) for (const [k, b] of Object.entries(m.blocks)) if (b && b.whole) own.add(k);
  return own;
}
const PLACEHOLDER = /Replace this with your first requirement/;

// ---------------------------------------------------------------- stacks
const NODE_FW = ['express', 'fastify', 'koa', 'hapi', '@nestjs/core', 'next', 'nuxt', 'react', 'vue', 'svelte', '@angular/core', 'electron', 'commander', 'yargs', 'vite', 'webpack'];
const NODE_TEST = ['jest', 'vitest', 'mocha', 'ava', 'tap', 'playwright', '@playwright/test', 'cypress', 'jasmine'];
const PY_FW = ['django', 'flask', 'fastapi', 'starlette', 'tornado', 'aiohttp', 'click', 'typer', 'pydantic', 'sqlalchemy', 'celery', 'pandas', 'numpy', 'torch', 'tensorflow'];
const names = list => [...new Set(list)].sort();
const pick = (deps, known) => known.filter(k => deps.has(k));
const pyName = s => (s.match(/^[A-Za-z0-9_.-]+/) || [''])[0].toLowerCase().replace(/_/g, '-');

function nodeStack(root, dir, files) {
  const rel = f => (dir ? dir + '/' + f : f), pkg = readJson(root, rel('package.json'));
  if (!pkg || typeof pkg !== 'object') return null;
  const deps = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})]), dev = new Set(Object.keys(pkg.devDependencies || {}));
  const all = new Set([...deps, ...dev]), has = f => files.includes(rel(f));
  const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : (has('bun.lockb') || has('bun.lock')) ? 'bun' : has('package-lock.json') ? 'npm' : 'npm (no lock file)';
  const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const run = pm.startsWith('yarn') ? 'yarn' : pm.startsWith('pnpm') ? 'pnpm' : pm.startsWith('bun') ? 'bun run' : 'npm run';
  const testCommands = [];
  if (scripts.test && !/no test specified/i.test(scripts.test)) testCommands.push({ command: pm.startsWith('npm') ? 'npm test' : run.split(' ')[0] + ' test', source: 'package.json scripts.test: ' + scripts.test });
  for (const k of Object.keys(scripts).sort()) if (/^test[:\-]/.test(k)) testCommands.push({ command: `${run} ${k}`, source: 'package.json scripts.' + k });
  const entry = [];
  if (pkg.main) entry.push({ file: posix(path.posix.join(dir, String(pkg.main))), why: 'package.json main' });
  const bin = typeof pkg.bin === 'string' ? { [pkg.name || 'bin']: pkg.bin } : (pkg.bin || {});
  for (const [k, v] of Object.entries(bin)) entry.push({ file: posix(path.posix.join(dir, String(v))), why: 'package.json bin ' + k });
  if (scripts.start) entry.push({ command: `${run} start`.replace('npm run start', 'npm start'), why: 'package.json scripts.start: ' + scripts.start });
  return {
    stack: 'node', dir: dir || '.', manifest: rel('package.json'), name: pkg.name || null, packageManager: pm, typescript: has('tsconfig.json') || all.has('typescript'),
    frameworks: pick(all, NODE_FW), testTools: pick(all, NODE_TEST), testCommands, entryPoints: entry,
    scripts: Object.fromEntries(['build', 'start', 'dev', 'lint', 'test'].filter(k => scripts[k]).map(k => [k, scripts[k]])),
    dependencies: { runtime: deps.size, dev: dev.size, top: names([...deps]).slice(0, 40) },
  };
}

function pythonStack(root, dir, files) {
  const rel = f => (dir ? dir + '/' + f : f), has = f => files.includes(rel(f));
  const reqs = files.filter(f => path.posix.dirname(f) === (dir || '.') && /^requirements.*\.txt$/.test(path.posix.basename(f)));
  if (!(has('pyproject.toml') || has('setup.py') || has('setup.cfg') || has('Pipfile') || reqs.length)) return null;
  const py = has('pyproject.toml') ? readText(root, rel('pyproject.toml')) || '' : '';
  const deps = new Set();
  const dm = py.match(/^dependencies\s*=\s*\[([\s\S]*?)\]/m);
  if (dm) for (const s of dm[1].matchAll(/["']([^"']+)["']/g)) deps.add(pyName(s[1]));
  const pm = py.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\n\[|$)/);
  if (pm) for (const l of pm[1].split('\n')) { const m = l.match(/^([A-Za-z0-9_.-]+)\s*=/); if (m && m[1].toLowerCase() !== 'python') deps.add(pyName(m[1])); }
  for (const r of reqs) for (const l of (readText(root, r) || '').split('\n')) { const m = l.trim(); if (m && !m.startsWith('#') && !m.startsWith('-')) deps.add(pyName(m)); }
  const nameM = py.match(/^name\s*=\s*["']([^"']+)["']/m);
  const manager = has('uv.lock') ? 'uv' : has('poetry.lock') || /\[tool\.poetry\]/.test(py) ? 'poetry' : has('Pipfile') ? 'pipenv' : has('pdm.lock') ? 'pdm' : 'pip';
  const pytest = deps.has('pytest') || /\[tool\.pytest|\[pytest\]/.test(py) || has('pytest.ini') || has('conftest.py') || files.some(f => /(^|\/)test_[^/]*\.py$/.test(f) && f.startsWith(dir ? dir + '/' : ''));
  const testCommands = pytest ? [{ command: 'python -m pytest', source: 'pytest config, dependency or test_*.py files found' }] : (files.some(f => /(^|\/)tests?\/.*\.py$/.test(f)) ? [{ command: 'python -m unittest discover', source: 'convention: a tests folder with .py files and no pytest marker' }] : []);
  const entry = [];
  for (const f of ['main.py', 'app.py', 'manage.py', 'wsgi.py', 'asgi.py', '__main__.py', 'cli.py']) if (has(f)) entry.push({ file: rel(f), why: 'conventional entry file' });
  for (const f of files) { const r = dir ? (f.startsWith(dir + '/') ? f.slice(dir.length + 1) : null) : f; if (r && /^(src\/)?[^/]+\/__main__\.py$/.test(r)) entry.push({ file: f, why: 'package __main__' }); }
  const sc = py.match(/\[project\.scripts\]([\s\S]*?)(?:\n\[|$)/) || py.match(/\[tool\.poetry\.scripts\]([\s\S]*?)(?:\n\[|$)/);
  if (sc) for (const l of sc[1].split('\n')) { const m = l.match(/^([A-Za-z0-9_.-]+)\s*=\s*["']([^"']+)["']/); if (m) entry.push({ command: m[1], why: 'pyproject scripts: ' + m[2] }); }
  return {
    stack: 'python', dir: dir || '.', manifest: has('pyproject.toml') ? rel('pyproject.toml') : reqs[0] || rel('setup.py'), name: nameM ? nameM[1] : null, packageManager: manager,
    frameworks: pick(deps, PY_FW), testTools: pytest ? ['pytest'] : [], testCommands, entryPoints: entry, dependencies: { runtime: deps.size, dev: 0, top: names([...deps]).slice(0, 40) },
  };
}

function goStack(root, dir, files) {
  const rel = f => (dir ? dir + '/' + f : f);
  if (!files.includes(rel('go.mod'))) return null;
  const mod = readText(root, rel('go.mod')) || '', req = new Set();
  const inBlock = mod.match(/require\s*\(([\s\S]*?)\)/g) || [];
  for (const b of inBlock) for (const l of b.split('\n')) { const m = l.trim().match(/^([^\s()]+)\s+v\S+/); if (m && !/\/\/\s*indirect/.test(l)) req.add(m[1]); }
  for (const m of mod.matchAll(/^require\s+([^\s(]+)\s+v\S+/gm)) req.add(m[1]);
  const inDir = f => f.startsWith(dir ? dir + '/' : '');
  const hasTests = files.some(f => inDir(f) && f.endsWith('_test.go'));
  const entry = files.filter(f => inDir(f) && /(^|\/)(main\.go|cmd\/[^/]+\/main\.go)$/.test(f)).map(f => ({ file: f, why: 'package main' }));
  return {
    stack: 'go', dir: dir || '.', manifest: rel('go.mod'), name: (mod.match(/^module\s+(\S+)/m) || [])[1] || null, packageManager: 'go modules', goVersion: (mod.match(/^go\s+(\S+)/m) || [])[1] || null,
    frameworks: ['gin-gonic/gin', 'labstack/echo', 'gofiber/fiber', 'go-chi/chi', 'spf13/cobra', 'gorilla/mux'].filter(k => [...req].some(r => r.includes(k))),
    testTools: hasTests ? ['go test'] : [], testCommands: hasTests ? [{ command: 'go test ./...', source: 'convention: *_test.go files found' }] : [], entryPoints: entry,
    dependencies: { runtime: req.size, dev: 0, top: names([...req]).slice(0, 40) },
  };
}

function dotnetStack(root, dir, files) {
  const inDir = f => f.split('/').length <= 5 && !f.split('/').some(s => FIXTURE_DIRS.test(s));
  const projs = files.filter(f => inDir(f) && /\.(csproj|fsproj|vbproj)$/.test(f)), slns = files.filter(f => (dir ? path.posix.dirname(f) === dir : !f.includes('/')) && f.endsWith('.sln'));
  if (!projs.length && !slns.length) return null;
  const pk = new Set(); let web = false, tests = false; const fw = new Set(), entry = [];
  for (const p of projs) {
    const t = readText(root, p) || '';
    for (const m of t.matchAll(/<PackageReference\s+Include="([^"]+)"/g)) pk.add(m[1]);
    for (const m of t.matchAll(/<TargetFrameworks?>([^<]+)</g)) m[1].split(';').forEach(x => fw.add(x.trim()));
    if (/Microsoft\.NET\.Sdk\.Web/.test(t)) web = true;
    if (/Microsoft\.NET\.Test\.Sdk/.test(t)) tests = true;
    if (/<OutputType>\s*Exe/i.test(t) || /Sdk\.Web/.test(t)) { const pd = path.posix.dirname(p); const pf = path.posix.join(pd, 'Program.cs'); if (files.includes(pf)) entry.push({ file: pf, why: 'Program.cs of ' + path.posix.basename(p) }); }
  }
  return {
    stack: 'dotnet', dir: dir || '.', manifest: (slns[0] || projs[0]), name: path.posix.basename(slns[0] || projs[0]).replace(/\.[a-z]+$/, ''), packageManager: 'nuget', targetFrameworks: [...fw].sort(),
    frameworks: web ? ['ASP.NET Core'] : [], testTools: ['xunit', 'nunit', 'mstest'].filter(k => [...pk].some(p => p.toLowerCase().includes(k))), testCommands: tests ? [{ command: 'dotnet test', source: 'a project references Microsoft.NET.Test.Sdk' }] : [],
    entryPoints: entry, dependencies: { runtime: pk.size, dev: 0, top: names([...pk]).slice(0, 40) },
  };
}

function simpleStack(root, dir, files) {
  const rel = f => (dir ? dir + '/' + f : f), has = f => files.includes(rel(f)), out = [];
  if (has('Cargo.toml')) {
    const t = readText(root, rel('Cargo.toml')) || '', d = (t.match(/\[dependencies\]([\s\S]*?)(?:\n\[|$)/) || [])[1] || '';
    const top = names(d.split('\n').map(l => (l.match(/^([A-Za-z0-9_-]+)\s*=/) || [])[1]).filter(Boolean));
    out.push({ stack: 'rust', dir: dir || '.', manifest: rel('Cargo.toml'), name: (t.match(/^name\s*=\s*"([^"]+)"/m) || [])[1] || null, packageManager: 'cargo', frameworks: [], testTools: ['cargo test'], testCommands: [{ command: 'cargo test', source: 'convention: Cargo.toml found' }], entryPoints: files.filter(f => /(^|\/)src\/(main\.rs|bin\/[^/]+\.rs)$/.test(f) && f.startsWith(dir ? dir + '/' : '')).map(f => ({ file: f, why: 'binary target' })), dependencies: { runtime: top.length, dev: 0, top: top.slice(0, 40) } });
  }
  if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) {
    const g = has('pom.xml') ? 'maven' : 'gradle';
    out.push({ stack: 'java', dir: dir || '.', manifest: rel(has('pom.xml') ? 'pom.xml' : has('build.gradle') ? 'build.gradle' : 'build.gradle.kts'), name: null, packageManager: g, frameworks: [], testTools: [], testCommands: [{ command: g === 'maven' ? 'mvn test' : (has('gradlew') ? './gradlew test' : 'gradle test'), source: 'convention: ' + (g === 'maven' ? 'pom.xml' : 'a gradle build file') + ' found' }], entryPoints: [], dependencies: { runtime: 0, dev: 0, top: [] } });
  }
  if (has('Gemfile')) out.push({ stack: 'ruby', dir: dir || '.', manifest: rel('Gemfile'), name: null, packageManager: 'bundler', frameworks: [], testTools: [], testCommands: files.includes(rel('spec')) || files.some(f => f.startsWith(rel('spec/'))) ? [{ command: 'bundle exec rspec', source: 'convention: a spec folder found' }] : [], entryPoints: [], dependencies: { runtime: 0, dev: 0, top: names([...(readText(root, rel('Gemfile')) || '').matchAll(/^\s*gem\s+["']([^"']+)/gm)].map(m => m[1])).slice(0, 40) } });
  if (has('composer.json')) { const c = readJson(root, rel('composer.json')) || {}; out.push({ stack: 'php', dir: dir || '.', manifest: rel('composer.json'), name: c.name || null, packageManager: 'composer', frameworks: [], testTools: [], testCommands: c.scripts && c.scripts.test ? [{ command: 'composer test', source: 'composer.json scripts.test' }] : [], entryPoints: [], dependencies: { runtime: Object.keys(c.require || {}).length, dev: Object.keys(c['require-dev'] || {}).length, top: names(Object.keys(c.require || {})).slice(0, 40) } }); }
  return out;
}

function detectStacks(root, files) {
  const dirs = new Set();
  for (const f of files) {
    const base = path.posix.basename(f);
    if (!/^(package\.json|pyproject\.toml|setup\.py|setup\.cfg|Pipfile|requirements.*\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|Gemfile|composer\.json)$/.test(base)) continue;
    const d = path.posix.dirname(f) === '.' ? '' : path.posix.dirname(f);
    if (d.split('/').length > 3 || d.split('/').some(s => FIXTURE_DIRS.test(s) || s === 'test' || s === 'tests')) continue;
    dirs.add(d);
  }
  const out = [];
  for (const d of [...dirs].sort()) {
    for (const fn of [nodeStack, pythonStack, goStack]) { const s = fn(root, d, files); if (s && !out.some(o => o.stack === s.stack && o.dir === s.dir)) out.push(s); }
    out.push(...simpleStack(root, d, files));
  }
  const dn = dotnetStack(root, '', files); if (dn) out.push(dn);
  return out.slice(0, 12);
}

// ---------------------------------------------------------------- routes and commands where a pattern finds them (heuristic)
const ROUTE_RX = [
  [/\.(js|mjs|cjs|jsx|ts|tsx)$/, /\b(?:app|router|server|fastify|api|routes)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g, (m) => `${m[1].toUpperCase()} ${m[2]}`],
  [/\.py$/, /@\w+\.(get|post|put|patch|delete|route)\(\s*['"]([^'"]+)['"]/g, (m) => `${m[1].toUpperCase()} ${m[2]}`],
  [/\.py$/, /\bpath\(\s*['"]([^'"]*)['"]\s*,/g, (m) => `URL /${m[1]}`],
  [/\.cs$/, /\[Http(Get|Post|Put|Patch|Delete)(?:\(\s*"([^"]*)"\s*\))?\]/g, (m) => `${m[1].toUpperCase()} ${m[2] || '(controller route)'}`],
  [/\.cs$/, /\.Map(Get|Post|Put|Patch|Delete)\(\s*"([^"]*)"/g, (m) => `${m[1].toUpperCase()} ${m[2]}`],
  [/\.go$/, /\b(?:HandleFunc|Handle|GET|POST|PUT|PATCH|DELETE)\(\s*"([^"]+)"/g, (m) => `ROUTE ${m[1]}`],
];
const CMD_RX = [
  [/\.(js|mjs|cjs|ts)$/, /\.command\(\s*['"`]([^'"`]+)['"`]/g], [/\.py$/, /\badd_parser\(\s*['"]([^'"]+)['"]/g], [/\.py$/, /@(?:click|app|cli)\.command\(\s*(?:name\s*=\s*)?['"]?([\w-]*)/g],
  [/\.go$/, /\bUse:\s*"([^"]+)"/g],
];
const isTestFile = p => /(^|\/)(tests?|__tests__|spec)\//i.test(p) || /(\.|_)(test|spec)\.[a-z]+$/i.test(p) || /(^|\/)test_[^/]*\.py$/.test(p) || /Tests?\.cs$/.test(p);
const TESTRE = [/^\s*(?:test|it)(?:\.\w+)*\s*\(/gm, /^\s*(?:async\s+)?def\s+test_/gm, /^func\s+Test\w+/gm, /\[\s*(?:Fact|Theory|Test|TestCase|TestMethod)\b/g];

function scanSource(root, files) {
  const src = files.filter(f => SOURCE_EXT.test(f) && !isTestFile(f)).slice(0, MAX_SCAN), routes = [], commands = [];
  for (const f of src) {
    const t = readText(root, f); if (!t) continue;
    for (const [ext, rx, fmt] of ROUTE_RX) if (ext.test(f)) for (const m of t.matchAll(rx)) routes.push({ route: fmt(m), file: f });
    for (const [ext, rx] of CMD_RX) if (ext.test(f)) for (const m of t.matchAll(rx)) if (m[1]) commands.push({ command: m[1], file: f });
  }
  const uniq = (a, k) => { const s = new Set(); return a.filter(x => { const key = x[k] + '|' + x.file; if (s.has(key)) return false; s.add(key); return true; }); };
  return { routes: uniq(routes, 'route').slice(0, 40), commands: uniq(commands, 'command').slice(0, 40), scanned: src.length };
}

// ---------------------------------------------------------------- the spec
export function specState(root, files) {
  const specFiles = files.filter(f => /^docs\/spec\/.+\.md$/.test(f));
  if (!specFiles.length) return { state: 'none', file: null, requirements: 0, criteria: 0, open: 0, assumed: 0 };
  let reqs = new Set(), crits = 0, open = 0, assumed = 0, placeholder = false;
  for (const f of specFiles) for (const l of (readText(root, f) || '').replace(/\r/g, '').split('\n')) {
    const r = l.match(/^#{1,6} +\**([FN]-\d{3})(?!\.\d)/); if (r) reqs.add(r[1]);
    if (/^[ >|*_[xX-]*\**[FN]-\d{3}\.\d+/.test(l) && /verified by:/i.test(l)) crits++;
    if (/^\s*(?:[-*]\s*)?OPEN:/.test(l)) open++;
    if (/\bASSUMED\b/.test(l)) assumed++;
    if (PLACEHOLDER.test(l)) placeholder = true;
  }
  const complete = !placeholder && reqs.size >= 1 && crits >= 3 && open === 0 && assumed === 0;
  return { state: placeholder ? 'placeholder' : complete ? 'complete' : 'partial', file: specFiles.includes('docs/spec/SPEC.md') ? 'docs/spec/SPEC.md' : specFiles[0], requirements: reqs.size, criteria: crits, open, assumed };
}

// ---------------------------------------------------------------- the inventory
export function inventory(root) {
  root = path.resolve(root);
  const { files: all, truncated } = walk(root), own = ownSet(root);
  const sp = specState(root, all);
  const isOwn = f => own.has(f) || OWN_PATH.test(f)
    || (f === 'docs/spec/SPEC.md' && sp.state === 'placeholder')
    || (f === 'docs/open-questions.md' && /\(none yet\)/.test(readText(root, f) || '') && (readText(root, f) || '').split('\n').length < 14)
    || (/^docs\/decisions\/0001-adopt-generative-specification\.md$/.test(f) && /Written by gs-init/.test(readText(root, f) || ''));
  const files = all.filter(f => !isOwn(f));
  const source = files.filter(f => SOURCE_EXT.test(f));
  const langCount = {};
  for (const f of source) { const l = LANG[path.posix.extname(f).slice(1).toLowerCase()]; if (l) langCount[l] = (langCount[l] || 0) + 1; }
  const languages = Object.entries(langCount).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([name, n]) => ({ name, files: n, share: Math.round(1000 * n / Math.max(1, source.length)) / 10 }));
  const stacks = detectStacks(root, files);
  const testFiles = files.filter(f => isTestFile(f) && /\.(m?[jt]sx?|cjs|py|go|cs)$/.test(f));
  let testCases = 0; for (const f of testFiles.slice(0, MAX_SCAN)) { const t = readText(root, f) || ''; for (const r of TESTRE) testCases += (t.match(r) || []).length; }
  const scan = scanSource(root, files);
  const top = {};
  for (const f of files) { const i = f.indexOf('/'); const d = i < 0 ? '.' : f.slice(0, i); (top[d] = top[d] || { files: 0, sub: new Set() }).files++; if (i >= 0) { const j = f.indexOf('/', i + 1); if (j >= 0) top[d].sub.add(f.slice(i + 1, j)); } }
  const folders = Object.entries(top).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, v]) => ({ dir: d, files: v.files, subfolders: [...v.sub].sort().slice(0, 10) }));
  const docs = {
    readme: files.find(f => /^README(\.[a-z]+)?$/i.test(f)) || null,
    markdown: files.filter(f => /\.(md|mdx|rst|adoc)$/i.test(f) && !/^README/i.test(f)).slice(0, 40),
    decisionRecords: files.filter(f => /^(docs\/(decisions|adr|adrs)|adr|doc\/adr)\/.+\.md$/i.test(f)).slice(0, 20),
    instructionFiles: ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.github/copilot-instructions.md', '.cursorrules'].filter(f => files.includes(f)).concat(files.filter(f => f.startsWith('.cursor/rules/'))),
    specTools: ['.specify', 'openspec', '_bmad', '.bmad-core'].filter(d => files.some(f => f.startsWith(d + '/'))),
    otherSpecFiles: files.filter(f => /^(specs?|requirements)\/.+\.md$/i.test(f) || /(^|\/)(PRD|SPEC|REQUIREMENTS)\.md$/i.test(f)).slice(0, 20),
  };
  const trackerRx = /(^|\/)(TODO|BACKLOG|ROADMAP|KNOWN[_-]?ISSUES|ISSUES|CHANGELOG|HISTORY)(\.[a-z]+)?$/i;
  docs.trackerFiles = files.filter(f => trackerRx.test(f) || /^\.github\/ISSUE_TEMPLATE(\/|\.md$)/.test(f) || /^docs\/(roadmap|backlog|todo)/i.test(f) || /(^|\/)wiki\//i.test(f)).slice(0, 20);
  docs.readmeLines = docs.readme ? (readText(root, docs.readme) || '').split('\n').filter(l => l.trim()).length : 0;
  const notDoc = f => trackerRx.test(f) || /^(CLAUDE|AGENTS|GEMINI)\.md$/.test(f) || /^(LICENSE|CONTRIBUTING|CODE_OF_CONDUCT|SECURITY)/i.test(f) || /^docs\/(spec|decisions)\//.test(f) || /^docs\/(open-questions|discrepancies|roadmap|tech-debt|baseline)/.test(f);
  docs.existing = docs.readmeLines >= 10 || docs.decisionRecords.some(f => !/0001-adopt-generative-specification/.test(f)) || docs.otherSpecFiles.length > 0 || docs.markdown.some(f => !notDoc(f));
  const debt = { markers: 0, files: [] };
  for (const f of source.slice(0, 1500)) { const n = ((readText(root, f) || '').match(/\b(?:TODO|FIXME|HACK|XXX)\b/g) || []).length; if (n) { debt.markers += n; debt.files.push({ file: f, markers: n }); } }
  debt.files = debt.files.sort((a, b) => b.markers - a.markers || (a.file < b.file ? -1 : 1)).slice(0, 10);
  const ci = files.filter(f => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f) || /^(\.gitlab-ci\.yml|azure-pipelines\.yml|Jenkinsfile|\.circleci\/config\.yml|bitbucket-pipelines\.yml)$/.test(f));
  const containers = files.filter(f => /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml)$/.test(f)).slice(0, 10);
  const nonBoiler = files.filter(f => !/^(README(\.[a-z]+)?|LICENSE[^/]*|\.gitignore|\.gitattributes|\.editorconfig)$/i.test(f));
  const docsOnly = (source.length === 0 && files.length > 3) || (files.length >= 10 && source.length / files.length < 0.05);
  let mode, why;
  if (docsOnly && sp.state !== 'complete') { mode = 'documents'; why = `${source.length} of ${files.length} files are source code (under 5 percent, or none): mostly not code`; }
  else if (sp.state === 'complete') { mode = 'sync'; why = `docs/spec has ${sp.requirements} requirement(s) and ${sp.criteria} criteria and no OPEN or ASSUMED markers: verify and sync`; }
  else if (!nonBoiler.length && sp.state !== 'partial') { mode = 'greenfield'; why = 'no source code and no documents beyond a README or licence'; }
  else if (sp.state === 'partial') { mode = 'continue'; why = `${sp.file} exists but is a draft (${sp.criteria} criteria, ${sp.open} OPEN, ${sp.assumed} ASSUMED)`; }
  else { mode = 'brownfield'; why = `${source.length} source file(s) and ${sp.state === 'placeholder' ? 'only the placeholder spec that gs init writes' : 'no spec'}`; }

  const g = { isRepo: false, commits: 0 };
  const inRepo = git(root, ['rev-parse', '--is-inside-work-tree']);
  if (inRepo.status === 0 && git(root, ['rev-parse', '--verify', '-q', 'HEAD']).status === 0) {
    const n = Number(git(root, ['rev-list', '--count', 'HEAD']).stdout.trim()) || 0;
    const emails = git(root, ['log', '-n', '5000', '--format=%ae']).stdout.split('\n').filter(Boolean);
    const touched = {};
    for (const l of git(root, ['log', '-n', '200', '--name-only', '--format=']).stdout.split('\n')) if (l && !isOwn(l)) touched[l] = (touched[l] || 0) + 1;
    Object.assign(g, {
      isRepo: true, commits: n, branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim(), head: git(root, ['rev-parse', '--short', 'HEAD']).stdout.trim(),
      firstCommit: git(root, ['log', '--max-parents=0', '--format=%cs']).stdout.split('\n').filter(Boolean).sort()[0] || null, lastCommit: git(root, ['log', '-1', '--format=%cs']).stdout.trim(),
      authors: new Set(emails).size, recentSubjects: git(root, ['log', '-n', '8', '--format=%s']).stdout.split('\n').filter(Boolean),
      mostChangedFiles: Object.entries(touched).filter(([f]) => fs.existsSync(path.join(root, f))).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 10).map(([file, commits]) => ({ file, commits })),
    });
  } else if (inRepo.status === 0) g.isRepo = true;
  const cfg = readJson(root, '.gs.json') || {};
  return {
    schema: 'gs-inventory/1', note: 'Facts read by a program, with no model. Patterns are heuristics: absence of a route or command here does not mean it does not exist.',
    mode, modeWhy: why, root: path.basename(root),
    files: { total: files.length, source: source.length, tests: testFiles.length, testCases, truncated },
    languages, stacks, testCommands: stacks.flatMap(s => s.testCommands.map(t => ({ ...t, dir: s.dir }))),
    entryPoints: stacks.flatMap(s => s.entryPoints.map(e => ({ ...e, dir: s.dir }))), routes: scan.routes, cliCommands: scan.commands, sourceFilesScanned: scan.scanned,
    folders, docs, debt, spec: sp, git: g, ci, containers, gs: { level: cfg.level || null, sentinel: cfg.sentinel || null },
  };
}

export function renderInventoryMd(inv) {
  const L = [], row = (...c) => '| ' + c.join(' | ') + ' |';
  L.push('# Inventory (read by a program, no model)', '');
  L.push(`Written by \`gs start\`. Facts only; patterns for routes and commands are heuristics. **${inv.mode}**: ${inv.modeWhy}.`, '');
  L.push('## Summary', '');
  L.push(`- ${inv.files.total} files, ${inv.files.source} source, ${inv.files.tests} test file(s) with about ${inv.files.testCases} test case(s)${inv.files.truncated ? ' (the walk stopped at 20000 files)' : ''}.`);
  L.push(`- Languages: ${inv.languages.length ? inv.languages.map(l => `${l.name} ${l.files} (${l.share}%)`).join(', ') : 'none found'}.`);
  L.push(`- Stacks: ${inv.stacks.length ? inv.stacks.map(s => `${s.stack}${s.dir === '.' ? '' : ' in ' + s.dir}`).join(', ') : 'no package manifest found'}.`);
  L.push(`- Spec: ${inv.spec.state}${inv.spec.file && inv.spec.state !== 'placeholder' ? ' (' + inv.spec.file + ': ' + inv.spec.requirements + ' requirements, ' + inv.spec.criteria + ' criteria, ' + inv.spec.open + ' OPEN, ' + inv.spec.assumed + ' ASSUMED)' : ''}.`);
  L.push(`- Git: ${inv.git.isRepo ? (inv.git.commits ? `${inv.git.commits} commits by ${inv.git.authors} author(s), ${inv.git.firstCommit} to ${inv.git.lastCommit}, branch ${inv.git.branch}` : 'a repository with no commit yet') : 'not a repository'}. CI: ${inv.ci.length ? inv.ci.join(', ') : 'none found'}.`, '');
  for (const s of inv.stacks) {
    L.push(`## Stack: ${s.stack}${s.dir === '.' ? '' : ' (' + s.dir + ')'}`, '');
    L.push(`- Manifest: \`${s.manifest}\`${s.name ? `, name ${s.name}` : ''}; package manager: ${s.packageManager}${s.goVersion ? '; go ' + s.goVersion : ''}${s.targetFrameworks && s.targetFrameworks.length ? '; ' + s.targetFrameworks.join(', ') : ''}${s.typescript ? '; TypeScript' : ''}.`);
    if (s.frameworks.length) L.push(`- Frameworks and libraries recognised: ${s.frameworks.join(', ')}.`);
    if (s.testTools.length) L.push(`- Test tools: ${s.testTools.join(', ')}.`);
    L.push(`- Dependencies: ${s.dependencies.runtime} runtime${s.dependencies.dev ? ', ' + s.dependencies.dev + ' dev' : ''}${s.dependencies.top.length ? '. First ' + s.dependencies.top.length + ': ' + s.dependencies.top.join(', ') : ''}.`);
    if (s.scripts && Object.keys(s.scripts).length) L.push(`- Scripts: ${Object.entries(s.scripts).map(([k, v]) => `${k}=\`${v}\``).join('; ')}.`);
    L.push('');
  }
  L.push('## Test commands found', '');
  L.push(inv.testCommands.length ? inv.testCommands.map(t => `- \`${t.command}\`${t.dir !== '.' ? ' (in ' + t.dir + ')' : ''}: ${t.source}`).join('\n') : '- none recognised. The assistant must not invent one: say so and ask.');
  L.push('', '## Entry points', '');
  L.push(inv.entryPoints.length ? inv.entryPoints.map(e => `- ${e.file ? '`' + e.file + '`' : '`' + e.command + '`'}: ${e.why}`).join('\n') : '- none recognised.');
  if (inv.routes.length) { L.push('', '## Routes found by pattern (heuristic, first 40)', '', ...inv.routes.map(r => `- ${r.route}  (\`${r.file}\`)`)); }
  if (inv.cliCommands.length) { L.push('', '## Command names found by pattern (heuristic, first 40)', '', ...inv.cliCommands.map(r => `- ${r.command}  (\`${r.file}\`)`)); }
  L.push('', '## Folder layout', '', row('folder', 'files', 'subfolders'), row('---', '---', '---'));
  for (const f of inv.folders) L.push(row(f.dir === '.' ? '(root)' : f.dir + '/', f.files, f.subfolders.join(', ')));
  L.push('', '## Documents', '');
  L.push(`- README: ${inv.docs.readme || 'none'}. Instruction files: ${inv.docs.instructionFiles.join(', ') || 'none'}. Decision records: ${inv.docs.decisionRecords.length}. Other spec-like files: ${inv.docs.otherSpecFiles.join(', ') || 'none'}. Spec tool folders: ${inv.docs.specTools.join(', ') || 'none'}.`);
  L.push(`- Existing documentation: ${inv.docs.existing ? 'YES (the prompt makes the assistant compare it with the code)' : 'no (a README under 10 lines or none, no decision records, no other docs)'}. Issue-tracker or backlog files: ${inv.docs.trackerFiles.join(', ') || 'none'}.`);
  L.push(`- Debt markers in source (TODO, FIXME, HACK, XXX): ${inv.debt.markers}${inv.debt.files.length ? '; most in ' + inv.debt.files.slice(0, 5).map(f => `\`${f.file}\` ${f.markers}`).join(', ') : ''}.`);
  if (inv.docs.markdown.length) L.push(`- Markdown: ${inv.docs.markdown.join(', ')}.`);
  if (inv.git.isRepo && inv.git.commits) {
    L.push('', '## Git history', '', `- Recent subjects: ${inv.git.recentSubjects.map(s => '"' + s + '"').join('; ')}.`);
    if (inv.git.mostChangedFiles.length) L.push(`- Most changed files (last 200 commits): ${inv.git.mostChangedFiles.map(f => `\`${f.file}\` ${f.commits}`).join(', ')}.`);
  }
  if (inv.containers.length) L.push('', `Containers: ${inv.containers.join(', ')}.`);
  L.push('', '## What this does not tell you', '', '- What the code is for, who uses it, what it must never do, which behaviour is a bug. That is for the assistant to read in the code and for the person to answer.', '- Whether any test passes. Nothing was run.');
  return L.join('\n') + '\n';
}

// ---------------------------------------------------------------- the prompt
// Section names come from the template gs-init writes (SPEC_MD) plus the shape of formula 2 (adopt after an MVP, genspec.dev/formulas/adopt/).
export const SPEC_SECTIONS = [
  'Title and one-paragraph overview: what the project is, for whom, why it exists',
  'Scope',
  'Non-goals',
  'The AI must never (a short list of things an assistant must not do in this project)',
  'Requirements: one heading per requirement, `## F-001 Name` (non-functional: `## N-001 Name`), with one sentence under it: what the project must do, for whom, and why it matters',
  '`### Acceptance criteria` under each requirement: list lines `- F-001.1 The system MUST ... verified by: <test file, command, or "manual step">` (MUST, SHOULD or MAY; ids never renumbered or reused)',
  '`### Decisions` under the requirements: a pointer to the decision records (docs/decisions/) that say why it was built this way',
];

const RULES = [
  '**Never record a ratification, an acceptance or a decision on the person\'s behalf.** Do not run `gs decide add`, do not edit `docs/decisions.log.md`, do not change a decision record\'s Status to Accepted, do not add `Signed-off-by`. Ratifying is the person\'s act; you propose, they decide. Tell them which command is theirs.',
  '**Do not change production source code in this session.** You may write `docs/spec/SPEC.md`, `docs/open-questions.md`, `docs/discrepancies.md`, `docs/tech-debt.md`, `docs/roadmap.md`, the assistant instruction file, gate and hook configuration and the baseline, decision records with `Status: Proposed`, and, if the person asks, tests. Do not commit unless the person tells you to; if they do, use `type: what changed` and an `Assisted-by:` or `Co-Authored-By:` trailer.',
  '**Do not invent.** Every statement in the spec ends with exactly one tag (for a requirement, the one-sentence line under its heading; for a criterion, the end of its line): `[FOUND IN CODE: path/to/file.ext:line]` (you read it there) or `[ASSUMED: why you think so]` (you did not see it). A criterion you found in code also carries `[observed]`, a tag the gs tools already know: derived from code, not yet ratified. Never tag a guess as FOUND IN CODE.',
  '**Ask, do not decide.** Anything the code cannot tell you (intent, who it is for, what must never happen, which behaviour is a bug) goes to `docs/open-questions.md` as a line starting `OPEN:` and then to the person as a question. Never ask what you can read in the code or in `.gs/inventory.md`.',
  'Answer in the language the person writes to you in. Keep ids, tags and headings in English: programs read them.',
];

const QUESTION_PROTOCOL = [
  'Ask the questions **one at a time, or in a batch of at most 4**, most important first. Each question has this shape:',
  '',
  '> **Q3 (who is it for)** The code has an admin area and a public API; I could not tell who the main user is.',
  '> **Recommended:** the public API consumers, because most of the tests and the README target them.',
  '> Reply `ok` to take the recommendation, or write your own answer.',
  '',
  'Always give a recommendation and the reason, even when you are unsure (say so in the reason). When the person replies `ok`, record the recommended answer as theirs. When they answer otherwise, record their words. If they say "skip", leave the line as `OPEN:`.',
];

export function buildPrompt(inv) {
  const m = inv.mode, L = [];
  const title = { brownfield: 'Draft a spec proposal from the code', continue: 'Continue the spec draft', sync: 'Verify and sync the spec with the code', greenfield: 'Start from the intent' }[m];
  L.push(`# gs start: ${title}`, '');
  L.push(`Generated by \`gs start\`; mode **${m}** (${inv.modeWhy}). You are the person's coding assistant. This file is your whole brief. Follow the steps in order.`, '');
  L.push('## Who does what', '');
  L.push('- `gs` (a program, no model) already read the repository and wrote `.gs/inventory.md` and `.gs/inventory.json`: stack, test commands, entry points, folders, documents, history. Trust those facts, check the ones you rely on.');
  L.push('- You read the code for intent, write the proposal and ask the questions. That part is not deterministic: your proposal is a draft, not a result.');
  L.push('- The person answers and ratifies. `gs check` and `gs start --verify-spec` (programs) then check that the spec and the code agree.', '');
  L.push('## Rules for the whole session', '');
  RULES.forEach((r, i) => L.push(`${i + 1}. ${r}`));
  L.push('');

  let n = 0;
  const step = t => { n++; L.push('## Step ' + n + '. ' + t, ''); };
  const adopt = m !== 'greenfield';
  const docsExist = adopt && inv.docs.existing;
  if (m === 'sync') {
    step('Read');
    L.push('Read `.gs/inventory.md`, then `docs/spec/` (every file), `docs/open-questions.md` and the decision records. Do not draft a new spec: the person already has one.', '');
    step('Compare the spec with the code');
    L.push('For every requirement and criterion id in the spec, find the code that implements it and the test that cites it (`verified by:`). Build a table, one row per id: `id | code found (path:line) | test found | test result if you ran it | verdict`. Verdicts: `in sync`, `spec says, code does not`, `code does, spec silent`, `no test`. Then list, separately:', '');
    L.push('- test ids that the spec does not define (orphans), and criteria no test cites;');
    L.push('- behaviour in the code that no criterion covers (propose a criterion for each, tagged `[observed]` and `[ASSUMED: ...]` if you are unsure);');
    L.push('- criteria the code contradicts (write each as an `OPEN:` line in `docs/open-questions.md` quoting both sides; do not pick a side).');
    L.push('You may run the test command listed in the inventory. If it needs a network, a service or a secret, do not run it and say so.', '');
  } else if (m === 'greenfield') {
    step('Ask for the intent first');
    L.push('The folder has no code and no documents, so there is nothing to read yet. Ask the person, in this order, and wait for each answer: (1) what they want to build and what problem it solves; (2) who will use it; (3) what it must never do. Give a recommendation with each question: derive it from the folder name or README if there is one, otherwise offer two or three example answers and say that they are examples. Then read `.gs/inventory.md` only for the conventions that exist (git, instruction files).', '');
  } else {
    step('Read');
    L.push('Read `.gs/inventory.md`. Then read the README, the manifests it lists, the entry points, the test files and the routes or commands it found. Skim the history it summarises. ' + (m === 'continue' ? 'Read the existing draft `' + inv.spec.file + '` and keep its ids and what the person already answered. ' : '') + 'Do not ask the person what the code does.');
    L.push('You may run the test command listed in the inventory to see the real result. If it needs a network, a service or a secret, do not run it and say so. Do not fix anything that fails.', '');
    step('Explore');
    L.push('Find, for each part of the system: what it does, for whom, what it depends on, what it must not do. Keep a list of what you could not tell: those are your questions.', '');
  }
  if (docsExist) {
    step('Compare the existing documentation with the code, and mark every discrepancy');
    L.push('The project already has documentation (README, docs, decision records: see "Documents" in `.gs/inventory.md`). The code is the evidence; the documents are claims. Read each document and check every statement about behaviour, commands, configuration, structure or versions against the code. Write `docs/discrepancies.md`: one entry per DISCREPANCY, in this shape: `D-001 | doc says: <quote> (path:line) | code does: <what> (path:line) | kind: stale doc, wrong doc, or code drifted | your guess which side is right`. File and line on both sides, always; if one side has no line (a missing feature), say so. Do not fix either side and do not choose: the person decides. This file is separate from the spec: it records disagreement, not intent.', '');
  }
  if (m !== 'sync') {
    step('Draft the spec proposal' + (adopt ? ' (the as-is spec)' : ''));
    L.push('Write `docs/spec/SPEC.md` ' + (m === 'continue' ? '(edit the draft; never renumber an id)' : m === 'greenfield' ? '(it holds only the placeholder that gs init wrote; replace the placeholder text, keep the file)' : '(it holds only the placeholder that gs init wrote, or does not exist yet; replace the placeholder text, keep the file)') + ' with **all** of these sections, in this order:', '');
    SPEC_SECTIONS.forEach((x, i) => L.push((i + 1) + '. ' + x));
    L.push('');
    L.push('Rules for the draft: ' + (adopt ? 'the spec describes what the system does TODAY (as-is), never what the person wishes: wishes go to the roadmap (a later step). ' : '') + 'one requirement per feature that exists, ids `F-001`, `F-002`, ... in the order you describe them; at least three criteria in total and at least as many as the floor in `docs/baseline.json` if that file exists; every requirement sentence and every criterion ends with its tag (rule 3); a criterion whose test you did not find says `verified by: manual step (no test found)`. Do not write a criterion for behaviour you did not see' + (m === 'greenfield' ? ' (there is no code: every statement is `[ASSUMED: ...]` until the person answers)' : '') + '.', '');
    step('Write what you could not decide');
    L.push('Append to `docs/open-questions.md` one line per unanswered point, each starting `OPEN:` and ending with the id of the requirement it blocks. (A line starting `OPEN:` blocks the gate at levels L1 and L2 until it is answered, which is the point.)', '');
  }
  if (adopt) {
    step('Create the sentinel from what you FOUND');
    L.push('Create the assistant instruction file the person chose (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md` or `.cursor/rules/gs.mdc`; the "Instruction files" line of the inventory says which exist; if one exists, read it and extend it, never overwrite what the person wrote). Write it from the code and the documents you actually read, not from a template: what the system is and what it must never do (as found), the commands that really run the tests and the build (the ones you ran or found), the real code layout, the constraints you saw with their reasons, and a routing table (topic | file) that names only paths that exist. Keep it small enough to read whole. Anything you could not confirm is an `OPEN:` line, not a sentence.', '');
    step('Mark the technical debt you find');
    L.push('Write `docs/tech-debt.md`: one entry per item, in this shape: `T-001 | item | evidence (path:line, or the command and its output) | severity guess (high, medium, low) and why | suggested step`. Start from the markers the inventory counted (' + inv.debt.markers + ' TODO, FIXME, HACK or XXX in source' + (inv.debt.files.length ? ', most in ' + inv.debt.files.slice(0, 3).map(f => '`' + f.file + '`').join(', ') : '') + '), then add what you saw: duplicated or dead code, missing tests, undeclared or unused dependencies, failing tests, hard-coded secrets or paths. Severity is your guess; say so. Do not fix any of it. ' + (inv.docs.trackerFiles.length ? 'The inventory found these backlog or tracker files: ' + inv.docs.trackerFiles.join(', ') + '. Read them and import or link their items. ' : '') + 'Also ASK the person whether a tech-debt list already exists elsewhere (an issue tracker, TODO files, a wiki, a spreadsheet) that you should import or link; do not invent one. This file is separate from the spec and from the roadmap.', '');
  }
  step('Ask the questions');
  L.push(...QUESTION_PROTOCOL, '');
  if (adopt) {
    step('Ask what the person WANTS TO CHANGE: the roadmap');
    L.push('Ask for a report of what they want to change, or a roadmap of future steps (a pasted list, a link, or their own words). Record it in `docs/roadmap.md`, one entry per item in their own words, in the order they gave it. It is the WISHED-FOR state and stays **separate** from the as-is spec: never turn a roadmap item into a requirement or criterion until the person ratifies the change. If they have none yet, write the file with the line `(none given yet)` and move on.', '');
    step('Configure the substrate to reflect what exists today');
    L.push('Set up the gates, hooks and the ratchet baseline (`docs/baseline.json`, `.githooks/`, the CI workflow, the test command) so that they describe **the project as it is**: measure today\'s test count and result, coverage, lint and type errors, and write them as the baseline (floors for what must not fall, ceilings for error counts). Nothing that exists today may become blocked: a check that fails on today\'s code is advisory, and labelled so. This is configuration, not production code. Every such "accepted as is" choice (a failing test tolerated, a missing lint rule, a low coverage floor, a gate left advisory) is a **proposal for the person to ratify**: one decision record per choice in `docs/decisions/` with `Status: Proposed`, saying what was accepted as is, why, and that normalizing or changing it later is allowed and expected. You never ratify these records and you never add them to `docs/decisions.log.md`; the person does, with `gs decide add`.', '');
  }
  step('Update the spec with the answers');
  L.push('For each answer: change the statement, replace its `[ASSUMED: ...]` tag with `[ANSWERED: Qn]` (it means the person answered, not that they ratified), and rewrite the `OPEN:` line in `docs/open-questions.md` as `ANSWERED (Qn): <the answer>`. Never renumber an id.' + (adopt ? ' Keep the four artifacts apart: the as-is spec (`docs/spec/`), the discrepancies, the roadmap and the debt list; an answer goes in the one it belongs to.' : ''), '');
  const last = n + 1;
  L.push(`## Step ${last}. Stop and hand over`, '');
  L.push('Print a short report: what is in the spec (counts of requirements, criteria, `FOUND IN CODE`, `ASSUMED`, `ANSWERED`), the `OPEN:` lines left, and the places where the code and the README or the old spec disagree. Then **stop** and say, in plain words:', '');
  L.push('> The spec is a proposal. Read it, change what is wrong, and ratify it yourself: record your acceptance with `gs decide add` (run `gs decide` to see its options), or accept the decision record by editing its Status line under your own name and committing. I have not ratified anything and I will not.', '');
  L.push(`## Step ${last + 1}. Check the sync (after the person has read and committed)`, '');
  L.push('Run these two commands and paste their real output and exit codes:', '');
  L.push('```text', 'gs start --verify-spec', 'gs check', '```', '');
  L.push('`gs start --verify-spec` checks that every `FOUND IN CODE` tag names a file that exists and a line that is in it. It does not check that the code does what the sentence says. `gs check` is the deterministic test of the substrate (criteria with tests, orphan ids, gates); it runs in a throwaway container by default and takes minutes. If the person cannot run it, say so instead of describing a result you did not see.');
  return L.join('\n') + '\n';
}

// ---------------------------------------------------------------- writing (own files, backed up, recorded for uninstall)
function claim(root, rels) {
  const mp = path.join(root, MANIFEST);
  if (!fs.existsSync(mp)) return false;
  let man; try { man = JSON.parse(unbom(fs.readFileSync(mp, 'utf8'))); } catch { return false; }
  if (!man || !man.files) return false;
  const before = JSON.stringify(man);
  for (const rel of rels) { try { man.files[rel] = { sha: sha(fs.readFileSync(path.join(root, rel))) }; } catch { /* not written */ } }
  if (JSON.stringify(man) !== before) fs.writeFileSync(mp, JSON.stringify(man, null, 2) + '\n');
  return true;
}
function recorded(root, rel) { try { return JSON.parse(unbom(fs.readFileSync(path.join(root, MANIFEST), 'utf8'))).files[rel].sha || null; } catch { return null; } }
export function writeHandoff(root, inv, { dryRun = false } = {}) {
  root = path.resolve(root);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const want = [['.gs/inventory.json', JSON.stringify(inv, null, 2) + '\n'], ['.gs/inventory.md', renderInventoryMd(inv)]];
  if (inv.mode !== 'documents') want.push([PROMPT_FILE, buildPrompt(inv)]);
  const ops = [];
  for (const [rel, body] of want) {
    const p = path.join(root, rel), exists = fs.existsSync(p);
    const same = exists && fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') === body;
    if (same) { ops.push({ kind: 'same', rel }); continue; }
    let backup = null;
    // a file that is still exactly what gs wrote last time is regenerated without a backup; one that was edited is copied first
    const rec = recorded(root, rel);
    if (exists && !(rec && rec === sha(fs.readFileSync(p)))) backup = '.gs-init-backup/' + stamp + '/' + rel;
    if (!dryRun) {
      if (backup) { const b = path.join(root, backup); fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(p, b); }
      fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body);
    }
    ops.push({ kind: exists ? 'update' : 'create', rel, backup });
  }
  if (!dryRun) claim(root, want.map(w => w[0]));
  return ops;
}

// ---------------------------------------------------------------- the tag check (partial by design)
export function verifySpec(root) {
  root = path.resolve(root);
  const { files } = walk(root), res = { tagged: 0, ok: 0, broken: [], assumed: 0, answered: 0, untagged: [] };
  for (const f of files.filter(f => /^docs\/spec\/.+\.md$/.test(f))) {
    const lines = (readText(root, f) || '').replace(/\r/g, '').split('\n');
    lines.forEach((l, i) => {
      const isStmt = /^#{1,6} +\**[FN]-\d{3}(?!\.\d)/.test(l) || (/^[ >|*_[xX-]*\**[FN]-\d{3}\.\d+/.test(l) && /verified by:/i.test(l));
      const tags = [...l.matchAll(/\[FOUND IN CODE:\s*([^\]\s,;]+)[^\]]*\]/g)];
      for (const t of tags) {
        res.tagged++;
        const m = t[1].match(/^(.+?)(?::(\d+)(?:-(\d+))?)?$/), rel = m[1].replace(/\\/g, '/'), abs = path.resolve(root, rel);
        let why = null;
        if (!abs.startsWith(root + path.sep) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) why = 'file not found';
        else if (m[2]) { const n = (fs.readFileSync(abs, 'utf8').match(/\n/g) || []).length + 1; if (Number(m[2]) > n || (m[3] && Number(m[3]) > n)) why = `line out of range (file has ${n} lines)`; }
        if (why) res.broken.push({ file: f, line: i + 1, tag: t[1], why }); else res.ok++;
      }
      if (/\[ASSUMED/.test(l)) res.assumed++;
      if (/\[ANSWERED/.test(l)) res.answered++;
      // a requirement heading is tagged when the sentence under it is (the first non-blank line after the heading)
      const next = /^#{1,6} /.test(l) ? (lines.slice(i + 1).find(x => x.trim()) || '') : '';
      const tagged = tags.length || /\[(ASSUMED|ANSWERED)/.test(l) || /\[(FOUND IN CODE|ASSUMED|ANSWERED)/.test(next);
      if (isStmt && !tagged) res.untagged.push({ file: f, line: i + 1, text: l.trim().slice(0, 70) });
    });
  }
  return res;
}

// ---------------------------------------------------------------- the words printed after the hand-off
export function nextSteps(inv, clis) {
  const L = [];
  L.push('Next, in three lines:');
  L.push('  1. gs read your project with no model and wrote .gs/inventory.md (the facts) and .gs/start-prompt.md (the instructions for your assistant).');
  L.push('  2. Open your assistant in this folder and say: follow .gs/start-prompt.md');
  L.push(`  3. It will ${inv.mode === 'sync' ? 'compare the spec with the code' : inv.mode === 'greenfield' ? 'ask you what you want to build' : 'draft a spec from your code'}, ask you questions that each come with a recommended answer (reply ok to take it), then stop so that you ratify; after that run: gs check`);
  if (clis.length) {
    L.push('', 'Assistants found on this machine, and the exact command that hands each one the prompt (copy it, or add --launch <name> to gs start):');
    for (const c of clis) L.push(`  ${c.cli.padEnd(8)} ${handCommand(c.cli)}${CORE_CLIS.includes(c.cli) ? '' : '   (second tier: supported, flags verified, less used)'}`);
  } else L.push('', `No assistant CLI (${CLIS.join(', ')}) was found on the PATH, so: ${GENERIC}.`);
  return L;
}

export function launch(cli, root, platform = process.platform) {
  if (!CLI_START[cli]) return { status: 2, error: `I can only start ${CLIS.join(', ')}. For any other assistant: ${GENERIC}.` };
  // INTRO is a constant with no quote or shell character in it. On Windows an npm CLI is a .cmd file, which needs a shell (and one string).
  const r = platform === 'win32' ? spawnSync(handCommand(cli), { cwd: root, stdio: 'inherit', shell: true }) : spawnSync(cli, CLI_START[cli].args(INTRO), { cwd: root, stdio: 'inherit' });
  return { status: r.status ?? 1, error: r.error ? r.error.message : null };
}

// ---------------------------------------------------------------- the notes for a folder that is not code
export const DOCUMENTS_NOTE = 'this is mostly not code, it needs a different profile. The spec, the gates and the questions that gs asks are written for software, so gs start writes no code spec and no prompt here. The inventory above is still true. For a documents, content or assets project, the checks of a software project do not apply; see the README, "What this does not do".';

// ---------------------------------------------------------------- command line
export async function main(argv) {
  const args = [...argv], flag = n => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
  const val = n => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const root = path.resolve(val('--root') || process.cwd()), dry = flag('--dry-run'), json = flag('--json');
  if (flag('--clis')) { for (const c of detectClis()) console.log(`${c.cli}  ${c.path}`); return 0; }
  if (flag('--verify-spec')) {
    const r = verifySpec(root);
    console.log(`gs start --verify-spec: ${r.tagged} FOUND IN CODE tag(s): ${r.ok} point to a file that exists (and a line in range), ${r.broken.length} do not; ${r.assumed} ASSUMED, ${r.answered} ANSWERED; ${r.untagged.length} requirement or criterion line(s) carry no tag.`);
    for (const b of r.broken) console.log(`  broken   ${b.file}:${b.line}  ${b.tag}  (${b.why})`);
    for (const u of r.untagged.slice(0, 20)) console.log(`  untagged ${u.file}:${u.line}  ${u.text}`);
    console.log('This checks that the place a tag names exists. It does not check that the code does what the sentence says: that is for a person to review, and for the tests that gs check looks for.');
    return r.broken.length ? 1 : 0;
  }
  const inv = inventory(root);
  if (json) { console.log(JSON.stringify(inv, null, 2)); return 0; }
  if (inv.mode === 'documents') { console.log('gs-start: ' + DOCUMENTS_NOTE); }
  const ops = writeHandoff(root, inv, { dryRun: dry });
  console.log(`gs-start: mode ${inv.mode} (${inv.modeWhy})${dry ? '  [dry run: nothing was written]' : ''}`);
  for (const o of ops) console.log(`  ${o.kind.padEnd(6)} ${o.rel}${o.backup ? '   (backup ' + o.backup + ')' : ''}`);
  if (inv.mode !== 'documents') for (const l of nextSteps(inv, detectClis())) console.log(l);
  return 0;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main(process.argv.slice(2)).then(c => process.exit(c));
