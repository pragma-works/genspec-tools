# Architecture

genspec-tools is a set of small command-line tools in plain Node (18 or later, no dependencies, no network, no model). Each tool is one folder under `tools/` with its own README and its own tests under `tools/<name>/test/`.

| Tool | Entry point | Reads | Writes |
|---|---|---|---|
| gs-check | `tools/gs-check/gs-check.mjs` | the committed state of a git repository (in a throwaway clone) | a report on standard output and, with `--out`, a JSON file; never the repository under test |
| gs-lock | `tools/gs-lock/gs-lock.mjs`, `gs-cochange.mjs`, `gs-redproof.mjs` | spec files, `@gs` tags, git history | `docs/spec.lock`, `docs/ratifications.md` |
| gs-decide | `tools/gs-decide/gs-decide.mjs`, `gs-decide-hook.mjs`, `gs-attribution-hook.mjs`, `gs-decide-ci.mjs` | `docs/decisions.log.md`, git identity, staged files | `docs/decisions.log.md` (append only) |
| gs-snapshot | `tools/gs-snapshot/gs-snapshot.mjs` | everything the others can read | `docs/snapshots/` |
| gs-init | `tools/gs-init/gs-init.mjs` | the project it is run in | the sentinel, spec, decisions, gate, hooks and floor of that project, after a backup |
| gs-demo | `tools/gs-demo/gs-demo.mjs` | a copy of a project folder | standard output only |
| gs | `bin/gs.mjs` (the `bin` of `package.json`, so `npx github:pragma-works/genspec-tools <command>` works with no clone) | the arguments, the project's `.gs-manifest.json` and `.gs.json`, and for `update` a fetched copy of this repository | nothing itself; it runs the tool that does the work |

## How the tools depend on each other

`bin/gs.mjs` is the front door: it holds no logic of the tools, only the choice of tool, at most two questions in a terminal (level and assistant files), and the plain-words summary. `gs init` calls `gs-init`; `gs uninstall` calls `gs-init --uninstall`, which reads the install record `gs-init` wrote; `gs update` clones this repository to a temporary folder (or takes `--from <folder>`) and runs that copy's `gs-init` at the recorded level.

They sit side by side and call each other by relative path; nothing is vendored. `gs-init` copies `gs-check`, `gs-lock` and `gs-decide` into the project it installs. `gs-snapshot` and `gs-demo` use `gs-lock`, and `gs-snapshot` runs `gs-check`. `gs-check` runs the target's own hooks and tests in the throwaway clone (it plants a violation and watches whether the project's gate refuses it), which is why it executes project code.

## How this repository checks itself

`scripts/gs-gate.mjs` (written by `gs-init`) is run by the git hooks in `.githooks/`: spec shape, open questions, the ratchet floor in `docs/baseline.json`, the form of commit messages, and `npm test` (the fast tier of the tests). CI (`.github/workflows/test.yml`) runs every suite on Linux and Windows and, on Linux only, `gs-check --strict` on this repository. See `docs/spec/SPEC.md` for what is promised and the README for what is not met.
