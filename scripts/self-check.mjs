#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Runs gs-check --strict on this repository and compares it with what the repository claims to meet (level L1 of gs-init).
//   node scripts/self-check.mjs [--since <rev>]
// Exit 0 only if every CLAIMED element reads PASS. The elements that are NOT claimed are printed as not met, honestly; a regression in a
// claimed element, or a claimed element that is silently dropped from the list below, is the only thing that fails. The list is the one
// in the README section "This repository's own status".
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Claimed: E01..E08 and E12 over the committed state; E09 (commit hygiene) only since the adoption commit, because two early assembly commits are not atomic.
const CLAIMED = ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E12'];
const NOT_CLAIMED = { E10: 'no spec lock: gs-lock is not wired here (the L1 level leaves it to day 7 to 30)', E11: 'no co-change gate; gs-check finds no "source file" outside tools/ to probe' };
const since = process.argv.includes('--since') ? process.argv[process.argv.indexOf('--since') + 1] : null;

const dir = mkdtempSync(join(tmpdir(), 'self-check-')), out = join(dir, 'report.json');
const args = [join(ROOT, 'tools/gs-check/gs-check.mjs'), '--repo', ROOT, '--strict', '--out', out, ...(since ? ['--since', since] : [])];
const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
const r = spawnSync(process.execPath, args, { encoding: 'utf8', env, maxBuffer: 1 << 26 });
process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
let rep; try { rep = JSON.parse(readFileSync(out, 'utf8')); } catch { console.error('self-check: gs-check produced no report'); process.exit(1); } finally { rmSync(dir, { recursive: true, force: true }); }
const st = Object.fromEntries(rep.items.map(i => [i.id, i.status]));
let bad = 0;
console.log('\nself-check: claimed elements' + (since ? ` (E09 since ${since})` : ''));
for (const id of CLAIMED) { const ok = st[id] === 'PASS'; if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id} ${st[id]}`); }
console.log('self-check: not claimed (reported as not met, not failing)');
for (const [id, why] of Object.entries(NOT_CLAIMED)) console.log(`  ${st[id] === 'PASS' ? 'PASS' : 'not met'} ${id} ${st[id]}: ${why}`);
process.exit(bad ? 1 : 0);
