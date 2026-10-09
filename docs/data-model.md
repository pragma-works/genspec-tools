# Data model

This repository has no database. The data are the files the tools read and write, all plain text, LF, UTF-8.

| File | Written by | Shape |
|---|---|---|
| `docs/spec/SPEC.md` | people | requirement headings `## F-001 ...`; criterion lines `- F-001.1 The system MUST ... verified by: <test file>`; ids are never reused |
| `docs/spec.lock` | `gs-lock` | one line per locked section (`S <spec-path>#<section> <hash>`) and per derived artifact (`A <artifact> <id> <spec-path>#<section> <hash>`), sorted |
| `docs/ratifications.md` | `gs-lock ratify` | append only; one line per ratification: when, who, artifact, id, section, old and new hash, reason |
| `docs/decisions.log.md` | `gs-decide add` | append only; entries `## D-0003` with `when`, `who`, `role`, `via`, `kind`, `ref`, `covers`, `approves` (sha256 of the approved content), `why`, optional `expires`, `prev` and `entry` (the hash chain) |
| `docs/decisions/NNNN-*.md` | people | architecture decision records |
| `docs/baseline.json` | `scripts/gs-gate.mjs ratchet --raise` | `{"floors": {...}, "ceilings": {...}}`; a floor may only go up, a ceiling only down |
| `docs/open-questions.md` | people | questions; a line starting `OPEN:` blocks the commit |
| `.gs.json` | `gs-init`, people | level, stack, sentinel, hooks folder, gate commands |
| gs-check report | `gs-check --out` | JSON: mode, head commit, config hash, one item per element with status, reasons and flags |
| `docs/snapshots/snapshot-YYYY-MM-DD.{md,json}` | `gs-snapshot` | deterministic; ignored by git in this repository |

Status values of a gs-check item: PASS, PARTIAL, ABSENT, UNDETERMINABLE (an environment fault).
