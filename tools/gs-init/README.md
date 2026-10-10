# gs-init: one command to start

One file, `gs-init.mjs`. Node 18+, no dependencies, no model, no network. MIT (see `../LICENSE`).

**Status: design, installer tested on throwaway projects (19 tests, Windows and a Linux container); not yet in a registered run.** The depth it installs is explained at https://genspec.dev (scale-adaptive depth).

```
cd your-project            # the top folder of a git repository (it runs git init if there is none)
node path/to/gs-init.mjs [--level L0|L1|L2] [--dry-run] [--sentinel CLAUDE.md|AGENTS.md] [--also AGENTS.md,CLAUDE.md,cursor] [--tools <folder>] [--no-proof | --proof-on-host] [--pubkey <file>] [--verbose]
node path/to/gs-init.mjs --uninstall [--dry-run]
```

The usual way in is `gs init` (see the top-level README): `npx github:pragma-works/genspec-tools init`. It asks the level and the assistant files in a terminal and calls this file.

Start with `--dry-run`: it prints every file it would create, append to or keep, and writes nothing.

## The three levels

| Level | You get | Nothing else runs |
|---|---|---|
| **L0** | The sentinel (`CLAUDE.md` or `AGENTS.md`), `docs/spec/SPEC.md` with requirement and criterion ids, a first decision record, `docs/open-questions.md`, `.gs.json`, and the trailer rule (`Assisted-by:` for assistant commits, never an assistant `Signed-off-by`). | Nothing checks anything. |
| **L1** (default) | L0, plus `scripts/gs-gate.mjs` (spec shape, open questions, ratchet floor, typed commit messages, your test command), git hooks (`pre-commit`, `commit-msg`, `pre-push`), `docs/baseline.json` (the floor, measured now, only goes up), copies of `gs-check`, `gs-lock`, `gs-decide`, and a "Fresh clone" block in the README. | The lock and the co-change gate are day 7 to 30. |
| **L2** | L1, plus `gs-decide` wired into the hooks (ratifications, agent-commit marking), `.github/workflows/gs.yml` (the server re-check). With `--pubkey` it also writes `docs/decision-roles.json` and turns signed ratifications on. | Nobody has signed until you give a key; the server check is only as strong as the branch protection that requires it. |

Agent commit marking (see https://genspec.dev): its L0 (trailers), L1 (the hook), L2 (signed ratifications and CI).

## What it does and does not touch

- **New files** are created. **Your files** (the spec, a decision record, the open-questions list) are kept exactly as they are.
- **A sentinel, a README, a hook** that exists get a marked block (`gs-init:begin` ... `gs-init:end`, or `# >>> gs-init >>>`) after a backup; your text stays and, for hooks, still runs after the checks. `.gs.json` gets keys merged, yours kept.
- **Hooks are chained, not replaced.** A real hook in `.git/hooks` is carried into `.githooks/` with the checks added above it; if `core.hooksPath` already points somewhere (husky, say) the block goes into that folder's hooks; a hook that is not a shell script is kept as `<name>.gs-prev` and called after the checks.
- **Every change to a file of yours is copied first** to `.gs-init-backup/<stamp>/` (kept out of git through `.git/info/exclude`). Running it again changes nothing.
- It never commits, pushes, edits your code or calls a network.
- **`--also`** writes a short pointer block into the other assistant files you name (`AGENTS.md`, `CLAUDE.md`, or `cursor` for `.cursor/rules/gs.mdc`): "read the sentinel first". The sentinel itself (`--sentinel`) carries the full text.

## The install record and uninstall

Every run writes `.gs-manifest.json` (commit it with the setup): each file it created with a hash of what it wrote, each marked block it added to a file of yours, each settings key it set with what the key held before, and the `core.hooksPath` setting. A second run leaves it byte-identical.

`--uninstall` reads that record and removes only that:

- a created file is deleted only while it is **byte for byte what was written**; a file you edited since stays, and is named as kept;
- a block is taken out of a file of yours and the rest is left as it was (after a copy in `.gs-init-backup/<stamp>-uninstall/`); a file that holds nothing but the block is deleted; a hook of yours that was chained or wrapped is put back;
- the settings keys it set are removed or put back to the value they had, unless you changed them since; `core.hooksPath` is unset if it still holds what was set;
- folders it emptied are removed; `.git` (even one `git init` made), `.gs-init-backup/` and your own files never are.

Without a record it refuses. A project set up before the record existed has none: run the installer once more (it changes nothing already right) and then uninstall. `--dry-run` lists what would happen and changes nothing.

## Where the tools come from

The installer copies `gs-check` (1 file), `gs-lock` (3 files) and `gs-decide` (4 files) from, in order: `--tools <folder>`, `$GS_TOOLS`, the folder next to this one. If one is missing it says so and where to fetch it (https://github.com/pragma-works/genspec-tools, `tools/<name>`). L2 refuses to start without `gs-decide`. L1 and L0 work without any copied tool: the gate it generates needs none.

## The proof

Unless `--no-proof` or `--dry-run`, it copies your working tree to a temporary folder, makes one commit there, and runs `gs-check --strict` on it (`gs-check` reads only committed state; your repository is not touched). gs-check runs your project's own tests and install steps, so the proof runs in gs-check's throwaway container; without Docker the proof is skipped in plain words. `--proof-on-host` runs it on this machine instead, for your own project only (it asks you to type the folder name unless CI=true). It prints the twelve items and checks the ones this level claims:

| Level | Claimed (must read PASS) | Reads absent or partial on purpose |
|---|---|---|
| L0 | E01 sentinel, E02 spec ids, E03 decision records | everything that needs a gate |
| L1, L2 | E01, E02, E03, E06 ratchet, E07 open-questions gate | E10 lock and E11 co-change (day 7 to 30); E09 needs 4 commits of history; E05 needs 5 tests and a CI file; E04 and E08 (architecture, coverage) are yours to write |

If a claimed item does not pass it says so and exits 1. The starter spec has three placeholder criteria that make the **form** valid; replacing them with true ones is yours, and no program checks that they are true.

## What it cannot do

It cannot make the spec right, write your tests, choose who ratifies, set branch protection, or stop `git commit --no-verify` (the CI file at L2 re-checks, if you make it a required check). It does not detect a stack's real test command beyond `npm test`, `pytest`, `go test ./...`, `dotnet test`, and only when the tool is on this machine; otherwise it says no test command is set. It writes the files in English. A file left byte-identical to what a previous run wrote (the generated gate, the tool copies) is claimed by the record even if a person put it there first. A clone made by someone else needs `node scripts/install-hooks.mjs` once, because git does not copy hook settings.

## Tests

```
node --test tools/gs-init/test/init.test.mjs      # 19 tests (the install record, uninstall, update and the dispatcher are tested in bin/test/gs.test.mjs, 14 tests): dry run, idempotency, hook chaining (shell, husky folder, non-shell), the three levels on node and python, backups, gate red/green, L2 wiring, two proof runs
GS_INIT_SKIP_PROOF=1 node --test tools/gs-init/test/init.test.mjs   # without the two gs-check runs
```

The tests use the sibling tools in this repository (`../gs-check`, `../gs-lock`, `../gs-decide`); nothing is vendored.
