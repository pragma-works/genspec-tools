# genspec-tools: sentinel

<!-- gs-init:begin (managed block; edit outside it) -->
## Generative Specification: how work is done here (level L1)

Read this first. It routes to everything else. Written by `gs-init`; the level is in `.gs.json`.

### Which case it is

| the change is | do this |
|---|---|
| tiny (a typo, a comment, a rename, a formatting fix) | make it and commit; the automatic checks are the only review |
| normal (new or changed behaviour) | change `docs/spec/SPEC.md` first (a criterion id), then the test, then the code; cite the id in the commit |
| risky (security, money, data, a gate, the spec itself, the floor) | stop: a named person writes down that they accept it, before the commit |

### Where things are

| topic | file |
|---|---|
| what the project must do, with ids | `docs/spec/SPEC.md` |
| why it was built this way | `docs/decisions/0001-adopt-generative-specification.md` |
| questions nobody has answered | `docs/open-questions.md` |
| settings and the level | `.gs.json` |
| the floor that may only go up | `docs/baseline.json` |
| the gates | `scripts/gs-gate.mjs` |

### Tool sequence

| gate | command | runs at | red proof |
|---|---|---|---|
| spec-shape | `node scripts/gs-gate.mjs spec` | pre-commit, pre-push | `printf "\n- F-001.9 The thing MUST work.\n" >> docs/spec/SPEC.md && node scripts/gs-gate.mjs spec` |
| open-questions | `node scripts/gs-gate.mjs open` | pre-commit, pre-push | `printf "OPEN: probe\n" >> docs/open-questions.md && node scripts/gs-gate.mjs open` |
| ratchet | `node scripts/gs-gate.mjs ratchet` | pre-commit, pre-push | `printf "{\"floors\":{\"tests\":99999},\"ceilings\":{}}" > docs/baseline.json && node scripts/gs-gate.mjs ratchet` |
| commit-message | `node scripts/gs-gate.mjs commit-msg <file>` | commit-msg | `echo "fixed stuff" > msg.txt && node scripts/gs-gate.mjs commit-msg msg.txt` |
| tests | `npm test` | pre-commit, pre-push | break one test, then run the command |

### Rules

- Commit messages read `type: what changed` (feat, fix, docs, refactor, test, chore, build, ci, perf, style, revert), one change per commit.
- A commit made with an assistant carries `Assisted-by: AGENT:MODEL` or the tool's own `Co-Authored-By:` line. An assistant never adds `Signed-off-by`.
- An assistant proposes; it never records a person's acceptance of a risky change for them.
- Requirement and criterion ids (`F-001`, `F-001.1`) are never renumbered or reused. A line `OPEN:` in the spec or in `docs/open-questions.md` blocks the work until it is answered.
<!-- gs-init:end -->

## Derived documents

| topic | file |
|---|---|
| architecture: the tools, what each reads and writes, how they depend on each other | `docs/architecture.md` |
| data model: the files the tools read and write | `docs/data-model.md` |
| conventions: how to contribute and commit | `docs/conventions.md` |
| contributing rules | `CONTRIBUTING.md` |
| what is and is not met by this repository itself | `README.md` (section "This repository's own status") |
