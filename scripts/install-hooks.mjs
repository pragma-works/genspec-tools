#!/usr/bin/env node
// gs-init: generated file (MIT). Points git at the hooks folder named in .gs.json (hooks). Run once after a fresh clone.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
(function () {
  const root = process.env.GS_ROOT || process.cwd();
  let dir = '.githooks'; try { dir = JSON.parse(fs.readFileSync(path.join(root, '.gs.json'), 'utf8').replace(/^\uFEFF/, '')).hooks || dir; } catch { /* default */ }
  if (!fs.existsSync(path.join(root, '.git'))) { console.log('install-hooks: not a git checkout; nothing to do'); return; }
  const d = path.join(root, dir); if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) { try { fs.chmodSync(path.join(d, f), 0o755); } catch { /* not allowed on this file system */ } }
  const r = cp.spawnSync('git', ['config', 'core.hooksPath', dir], { cwd: root });
  console.log(r.status === 0 ? 'install-hooks: git hooks now come from ' + dir : 'install-hooks: could not set core.hooksPath');
  process.exit(r.status === 0 ? 0 : 1);
})();
