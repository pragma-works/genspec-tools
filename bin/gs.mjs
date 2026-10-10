#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Juan Carlos Ghiringhelli, PragmaWorks (licence text in ../LICENSE; provided "AS IS", without warranty).
//
// gs: one front door for the genspec tools. ONE file, Node 18+, no dependencies, no model, no network of its own
// (only `gs update` fetches, with git). It does not hold the logic of the tools: it picks the right one, asks at most two
// questions, runs it, and says in plain words what it got and what to do next.
//
//   npx github:pragma-works/genspec-tools <command>        (no clone, no registry account; needs Node 18+ and git)
//   gs demo [folder|--sample]    gs start    gs init [--level L0|L1|L2] [--dry-run]    gs check    gs lock    gs decide    gs snapshot
//   gs update    gs uninstall    gs doctor    gs help
//
// Exit codes follow the tool that was run; 2 is a usage or environment problem.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fs.realpathSync(fileURLToPath(import.meta.url))), '..');
const REPO_URL = 'https://github.com/pragma-works/genspec-tools';
const MANIFEST = '.gs-manifest.json';
const TOOL = (name, file = name + '.mjs') => path.join(ROOT, 'tools', name, file);
const say = s => console.log('gs: ' + s);
const fail = (s, code = 2) => { console.error('gs: ' + s); process.exit(code); };
const version = () => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return 'unknown'; } };

if (Number(process.versions.node.split('.')[0]) < 18) fail(`this needs Node 18 or newer (you have ${process.versions.node}). Install a newer Node from https://nodejs.org and run it again.`);

// ------------------------------------------------------------------ small helpers
const takeFlag = (args, ...names) => { let hit = false; for (const n of names) { let i; while ((i = args.indexOf(n)) >= 0) { args.splice(i, 1); hit = true; } } return hit; };
const takeVal = (args, name) => { const i = args.indexOf(name); if (i < 0) return null; if (i + 1 >= args.length) fail(`${name} needs a value`); const v = args[i + 1]; args.splice(i, 2); return v; };
// GS_FRONT_DOOR tells a tool that it was started through gs, so it can suggest `gs check` and not a path inside a folder that npx keeps in its cache
const run = (script, args, opts = {}) => spawnSync(process.execPath, [script, ...args], { stdio: 'inherit', cwd: process.cwd(), env: { ...process.env, GS_FRONT_DOOR: '1' }, ...opts }).status ?? 1;
const gitOk = () => spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
const needGit = () => { if (!gitOk()) fail('git is needed and was not found. Install it from https://git-scm.com and run this again.'); };
const cwd = () => process.cwd();
const has = rel => fs.existsSync(path.join(cwd(), rel));
const looksLikeProject = () => ['.git', 'package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml', 'README.md'].some(has)
  || fs.readdirSync(cwd()).some(f => /\.(sln|csproj)$/.test(f));

// A person at a terminal gets questions; a script gets none (pass --yes, or the flags, and nothing is asked).
// GS_FORCE_PROMPT=1 lets a test feed answers on a pipe.
const canAsk = () => (process.stdin.isTTY && process.stdout.isTTY) || process.env.GS_FORCE_PROMPT === '1';
let piped = null;
function makeAsker() {
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return { ask: q => new Promise(res => rl.question(q, a => res(a.trim()))), close: () => rl.close() };
  }
  if (!piped) { let t = ''; try { t = fs.readFileSync(0, 'utf8'); } catch { /* no input */ } piped = t.split(/\r?\n/); }
  return { ask: q => { process.stdout.write(q); const a = (piped.shift() || '').trim(); process.stdout.write(a + '\n'); return Promise.resolve(a); }, close: () => {} };
}

// ------------------------------------------------------------------ help
const HELP = `gs ${version()}: check that a project is ready for work with an AI assistant, and set it up.
Needs Node 18+ and git. No account, no install, no network except \`gs update\`.

Try it (changes nothing):
  gs demo [folder]      a quick look (seconds) at a folder: what is there, what is missing
  gs demo --sample      the same look at a small example project that comes with gs
  gs start              a short walk-through for first-timers: a look, then the lightest setup (L0)

Set up and keep up:
  gs init               add the notes and checks to this project; asks two questions in a terminal
      --level L0|L1|L2    L0 notes only, L1 notes plus checks that refuse a bad commit (default), L2 plus a server check
      --agents claude,codex,cursor   which assistant files to write (CLAUDE.md, AGENTS.md, .cursor rules)
      --dry-run           list what would change and write nothing
      --yes               ask nothing (for scripts)
  gs update             fetch the newest tools and run the setup again (backs up anything it changes)
  gs uninstall          take out only what gs init wrote (your files and code stay)
  gs doctor             what is installed here, and what is missing

Use:
  gs check              the full test (minutes): plants a mistake in a copy and sees whether your checks refuse it.
                        It runs your project's own installs and tests, so by default it does that in a throwaway Docker container.
      --allow-network     let the container download packages (default: no network at all)
      --run-on-host --i-trust-this-repo   run on this machine instead (only for code you trust; you type the folder name)
  gs lock | gs decide | gs snapshot    the other tools, with their usual options

More: ${REPO_URL}`;

// ------------------------------------------------------------------ demo
function cmdDemo(args) {
  const sample = takeFlag(args, '--sample');
  const withVal = new Set(['--budget', '--max-mb']);
  let target = null;
  for (let i = 0; i < args.length; i++) { if (withVal.has(args[i])) { i++; continue; } if (!args[i].startsWith('--')) { target = args[i]; args.splice(i, 1); break; } }
  if (sample) target = path.join(ROOT, 'tools', 'gs-check', 'test', 'fixtures', 'good');
  target = target || '.';
  if (!fs.existsSync(target)) fail(`${target} was not found. Give the folder of a project, or use: gs demo --sample`);
  say(`looking at ${path.resolve(target)}${sample ? ' (the example project that comes with gs)' : ''}; it only reads, and takes a few seconds.`);
  const code = run(TOOL('gs-demo'), [target, ...args]);
  if (code === 0) {
    say('that was a quick look; nothing was changed.');
    say('next: "gs init --dry-run" shows what setting this project up would add; "gs check" is the full test (minutes).');
  }
  return code;
}

// ------------------------------------------------------------------ init
const AGENT_FILES = { claude: 'CLAUDE.md', 'claude-code': 'CLAUDE.md', 'claude.md': 'CLAUDE.md', codex: 'AGENTS.md', copilot: 'AGENTS.md', gemini: 'AGENTS.md', agents: 'AGENTS.md', 'agents.md': 'AGENTS.md', cursor: 'cursor' };
function parseAgents(list) {
  const out = [];
  for (const raw of list.split(',').map(x => x.trim().toLowerCase()).filter(Boolean)) {
    if (raw === 'all') { out.push('CLAUDE.md', 'AGENTS.md', 'cursor'); continue; }
    const f = AGENT_FILES[raw]; if (!f) fail(`I do not know the assistant "${raw}". Use claude, codex (or copilot, gemini), cursor, or all.`);
    out.push(f);
  }
  return [...new Set(out)];
}
async function cmdInit(args, { forceLevel = null, friendly = false } = {}) {
  needGit();
  const yes = takeFlag(args, '--yes', '-y');
  let level = takeVal(args, '--level') || forceLevel, agents = takeVal(args, '--agents');
  const explicit = args.includes('--sentinel') || args.includes('--also');
  const here = path.resolve(cwd());
  if (here === os.homedir() || path.parse(here).root === here) fail(`${here} looks like your home folder or a drive root, not a project. Go into the project folder and run this again.`);
  if (!yes && canAsk() && (!level || (!agents && !explicit))) {
    const q = makeAsker();
    if (!level) {
      console.log('How much do you want to start with?');
      console.log('  1  Notes only: a map file for your assistant, a spec, a decisions folder. Nothing runs by itself.   (L0)');
      console.log('  2  Notes plus checks that refuse a bad commit (spec shape, open questions, quality floor, tests). (L1, the usual choice)');
      console.log('  3  Everything above plus a record of who accepted risky changes and a server check.                (L2)');
      const a = await q.ask('Choose 1, 2 or 3 [2]: ');
      level = { '1': 'L0', '2': 'L1', '3': 'L2', '': friendly ? 'L0' : 'L1' }[a] || (/^L[012]$/i.test(a) ? a.toUpperCase() : null);
      if (!level) { q.close(); fail('please answer 1, 2 or 3.'); }
    }
    if (!agents && !explicit) {
      const dflt = has('CLAUDE.md') ? '1' : has('AGENTS.md') ? '2' : '1';
      console.log('Which assistant do you use? (several are fine, like 1,3)');
      console.log('  1  Claude Code   (writes CLAUDE.md)');
      console.log('  2  Codex, Copilot, Gemini and others   (writes AGENTS.md)');
      console.log('  3  Cursor   (writes .cursor/rules/gs.mdc)');
      const a = await q.ask(`Choose [${dflt}]: `);
      const pick = (a || dflt).split(/[ ,]+/).filter(Boolean), names = { 1: 'claude', 2: 'codex', 3: 'cursor' };
      if (pick.some(x => !names[x])) { q.close(); fail('please answer with the numbers 1, 2 or 3.'); }
      agents = pick.map(x => names[x]).join(',');
    }
    q.close();
  }
  const pass = [];
  if (agents) {
    const files = parseAgents(agents);
    const primary = files.includes('CLAUDE.md') ? 'CLAUDE.md' : 'AGENTS.md';
    pass.push('--sentinel', primary);
    const more = files.filter(f => f !== primary);
    if (more.length) pass.push('--also', more.join(','));
  }
  if (level) pass.push('--level', level);
  return run(TOOL('gs-init'), [...pass, ...args], { cwd: cwd() });
}

// ------------------------------------------------------------------ start (friendly mode)
async function cmdStart(args) {
  const yes = args.includes('--yes') || args.includes('-y');
  console.log('Welcome. This takes about a minute and asks before it changes anything.');
  console.log('  1. First it takes a quick look at your project and tells you what is there and what is missing. It only reads.');
  console.log('  2. Then it adds a few small notes files so your AI assistant knows how your project works. Nothing runs by itself.');
  console.log('  3. It never edits your code, never commits, and never uses the internet.');
  console.log('  4. To take it all out again: gs uninstall.   To see what is installed: gs doctor.');
  console.log('  Press Enter to go on, or Ctrl+C to stop.');
  if (!yes && canAsk()) { const q = makeAsker(); await q.ask(''); q.close(); }
  const d = cmdDemo(['.']);
  if (d !== 0) return d;
  console.log('');
  return cmdInit(args, { forceLevel: 'L0', friendly: true });
}

// ------------------------------------------------------------------ check, lock, decide, snapshot
function cmdCheck(args) {
  needGit();
  if (!args.includes('--repo')) args = ['--repo', cwd(), '--strict', ...args];
  say('the full check copies your last commit to a temporary folder, plants mistakes there and sees whether your checks refuse them.');
  say('it runs your project\'s own installs, hooks and tests, so by default it does that inside a throwaway Docker container (no network, a read-only copy, none of your files or secrets). Changes you have not committed are not seen. It takes minutes.');
  say('without Docker it refuses. For code you wrote or fully trust you can run it here on purpose: gs check --run-on-host --i-trust-this-repo. If the project must download packages: gs check --allow-network.');
  return run(TOOL('gs-check'), args);
}

// ------------------------------------------------------------------ doctor
const sameBytes = (a, b) => { try { return fs.readFileSync(a, 'utf8').replace(/\r\n/g, '\n') === fs.readFileSync(b, 'utf8').replace(/\r\n/g, '\n'); } catch { return false; } };
function readJson(rel) { try { return JSON.parse(fs.readFileSync(path.join(cwd(), rel), 'utf8').replace(/^﻿/, '')); } catch { return null; } }
function cmdDoctor() {
  const rows = [];
  const row = (ok, what, fix = '') => rows.push([ok, what, fix]);
  row(true, `gs ${version()} on Node ${process.versions.node}`);
  const g = gitOk(); row(g, g ? 'git is installed' : 'git is missing', 'install git from https://git-scm.com');
  const inRepo = g && spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: cwd(), encoding: 'utf8' }).status === 0;
  row(inRepo, inRepo ? 'this folder is a git repository' : 'this folder is not a git repository', 'gs init will start one');
  const man = readJson(MANIFEST), cfg = readJson('.gs.json');
  row(!!man, man ? `gs init has been run here (level ${man.level})` : 'gs init has not been run here (or it ran before the install record existed)', 'run: gs init');
  const level = (man && man.level) || (cfg && cfg.level) || null;
  const sent = ['CLAUDE.md', 'AGENTS.md', '.cursor/rules/gs.mdc'].filter(has);
  row(sent.length > 0, sent.length ? `assistant files: ${sent.join(', ')}` : 'no assistant file (CLAUDE.md, AGENTS.md or .cursor/rules/gs.mdc)', 'run: gs init');
  row(has('docs/spec/SPEC.md'), has('docs/spec/SPEC.md') ? 'spec: docs/spec/SPEC.md' : 'no spec file', 'run: gs init');
  if (level && level !== 'L0') {
    row(has('scripts/gs-gate.mjs'), 'the checks: scripts/gs-gate.mjs', 'run: gs init');
    const hp = g && inRepo ? spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: cwd(), encoding: 'utf8' }).stdout.trim() : '';
    row(!!hp, hp ? `git hooks come from ${hp}` : 'the git hooks are not switched on in this clone', 'run: node scripts/install-hooks.mjs (once per clone)');
    row(has('docs/baseline.json'), 'quality floor: docs/baseline.json', 'run: gs init');
  }
  if (level === 'L2') row(has('.github/workflows/gs.yml'), 'server check: .github/workflows/gs.yml', 'run: gs init --level L2');
  if (man) {
    const mine = [];
    for (const rel of Object.keys(man.files || {})) if (/^tools\/gs-[a-z]+\/[^/]+\.mjs$/.test(rel)) mine.push(rel);
    const differ = mine.filter(rel => !sameBytes(path.join(cwd(), rel), path.join(ROOT, rel)));
    if (mine.length) row(differ.length === 0, differ.length ? `${differ.length} of ${mine.length} tool files here differ from this gs (version ${version()})` : `the ${mine.length} tool files here match this gs`, 'run: gs update (or ignore it if you changed them on purpose)');
  }
  for (const [ok, what, fix] of rows) console.log(`  ${ok ? 'ok     ' : 'missing'} ${what}${!ok && fix ? '   -> ' + fix : ''}`);
  const bad = rows.filter(r => !r[0]);
  console.log('');
  say(bad.length ? `${bad.length} thing(s) are missing. The first: ${bad[0][1]}${bad[0][2] ? ' (' + bad[0][2] + ')' : ''}.` : 'everything gs init puts in place is here.');
  say('this lists what is installed, not whether it works; "gs check" is the test that does that (minutes).');
  return bad.length ? 1 : 0;
}

// ------------------------------------------------------------------ update
function cmdUpdate(args) {
  needGit();
  const from = takeVal(args, '--from');
  const man = readJson(MANIFEST), cfg = readJson('.gs.json');
  const level = (man && man.level) || (cfg && cfg.level);
  if (!level) fail('there is no gs setup in this folder yet. Run: gs init', 1);
  let src = from, tmp = null;
  if (!src || !fs.existsSync(path.join(src, 'tools', 'gs-init', 'gs-init.mjs'))) {
    const url = src || REPO_URL;
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-update-'));
    say(`fetching the newest tools from ${url} ...`);
    const r = spawnSync('git', ['clone', '--depth', '1', '--quiet', url, tmp], { encoding: 'utf8', timeout: 180000 });
    if (r.status !== 0) { fs.rmSync(tmp, { recursive: true, force: true }); fail(`could not fetch ${url}; nothing was changed. ${(r.stderr || '').trim().split('\n')[0]}\n  If you are offline, use a copy you already have: gs update --from <folder of genspec-tools>`, 1); }
    src = tmp;
  }
  try {
    let v = 'unknown'; try { v = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')).version; } catch { /* no package file */ }
    say(`running the setup again at level ${level} with the tools of version ${v} (anything it changes is copied to .gs-init-backup first).`);
    const sentinel = cfg && cfg.sentinel ? ['--sentinel', cfg.sentinel] : [];
    const code = run(path.join(src, 'tools', 'gs-init', 'gs-init.mjs'), ['--level', level, '--no-proof', ...sentinel, ...args]);
    if (code === 0) say('done. "gs doctor" shows what is here now; "gs check" is the full test (minutes).');
    return code;
  } finally { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ------------------------------------------------------------------ uninstall
async function cmdUninstall(args) {
  const yes = takeFlag(args, '--yes', '-y'), dry = args.includes('--dry-run');
  if (!has(MANIFEST)) { say('there is no install record (' + MANIFEST + ') here, so there is nothing gs can safely take out. If this project was set up before the record existed, run "gs init" once and then "gs uninstall".'); return 1; }
  if (!yes && !dry) {
    if (!canAsk()) fail('to take it out without a prompt, add --yes (or --dry-run to only look).');
    const q = makeAsker();
    console.log('This removes only the files and blocks that gs init wrote (listed in ' + MANIFEST + '). Files you changed since stay; edited files are backed up first.');
    const a = await q.ask('Go on? [y/N]: '); q.close();
    if (!/^y(es)?$/i.test(a)) { say('stopped; nothing was changed.'); return 0; }
  }
  return run(TOOL('gs-init'), ['--uninstall', ...args]);
}

// ------------------------------------------------------------------ main
export async function main(argv) {
  const args = [...argv];
  const cmd = args.shift();
  switch (cmd) {
    case undefined:
      if (looksLikeProject()) { say('no command given, so: a quick look at this folder (gs help lists the commands).'); return cmdDemo(['.']); }
      console.log(HELP); return 0;
    case 'help': case '--help': case '-h': console.log(HELP); return 0;
    case 'version': case '--version': case '-v': console.log(version()); return 0;
    case 'demo': return cmdDemo(args);
    case 'start': return cmdStart(args);
    case 'init': return cmdInit(args);
    case 'check': return cmdCheck(args);
    case 'lock': return run(TOOL('gs-lock'), args);
    case 'decide': return run(TOOL('gs-decide'), args);
    case 'snapshot': return run(TOOL('gs-snapshot'), args);
    case 'update': return cmdUpdate(args);
    case 'uninstall': return cmdUninstall(args);
    case 'doctor': return cmdDoctor();
    default:
      console.error(`gs: I do not know the command "${cmd}". These work: demo, start, init, check, lock, decide, snapshot, update, uninstall, doctor, help.`);
      return 2;
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main(process.argv.slice(2)).then(c => process.exit(c));
