# Changelog

All notable changes to this repository. The tools are not versioned separately yet.

## [Unreleased]

### Security
- `gs-check` no longer runs a project's install steps, hooks and tests on your machine by default. It runs in a throwaway Docker container (no network unless `--allow-network`, read-only copy, non-root, memory/CPU/process/time limits, no host environment) and refuses without Docker; `--run-on-host --i-trust-this-repo` (and a typed repository name, unless `CI=true`) is the explicit way around. `gs check` and the proof of `gs-init` follow it (`gs-init --proof-on-host` for your own project). `gs demo` could run a program named in the examined folder's `.git/config` (a file-system monitor): fixed, and a test with canaries proves it executes nothing from the target.

### Added
- `gs start` hands the project to the person's own coding assistant. A program (no model, no network, none of the project's code) writes `.gs/inventory.json` and `.gs/inventory.md` (languages, package managers, test commands, entry points, routes, folders, documents, history, CI, state of the spec) and `.gs/start-prompt.md`: the prompt that makes the assistant draft a spec proposal with every section of the template, tag each statement FOUND IN CODE or ASSUMED, ask the questions with a recommended answer each, and stop for the person to ratify. It prints three lines of next steps and, for each of claude, copilot, codex and gemini found on the PATH, the command that hands it the prompt (flags read from each CLI's own `--help`); `--launch <cli>` starts one, nothing else does. `--assistant` chooses the instruction files, now including `GEMINI.md` and `.github/copilot-instructions.md`. `gs start --verify-spec` checks that each FOUND IN CODE tag names an existing file and line. A folder that is mostly not code gets a note and nothing is written. New tool `tools/gs-start` and spec F-009 (10 criteria; criteria floor 54 to 64).
- `bin/gs.mjs`, the `gs` command: `npx github:pragma-works/genspec-tools <command>` runs the tools with no clone and no registry account. Commands: `demo` (also `--sample`), `start`, `init`, `check`, `lock`, `decide`, `snapshot`, `update`, `uninstall`, `doctor`, `help`.
- `gs-init` writes an install record (`.gs-manifest.json`) and has `--uninstall`, which removes only what the record lists and keeps any file changed since; `--also` writes pointer files for further assistants (`AGENTS.md`, `CLAUDE.md`, Cursor rules).
- `docs/publishing-to-npm.md`: the steps for the maintainer to publish under the organization scope (not done).

### Changed
- `--agents gemini` now writes `GEMINI.md` (the file Gemini CLI reads) instead of `AGENTS.md`, and `--agents copilot` writes `.github/copilot-instructions.md` (the file `copilot init` writes); `--assistant` is the new name of the flag and `--agents` still works.

### Fixed
- `gs-init` named a personal fork in its "fetch the tools" message and now names `pragma-works/genspec-tools`; it also copies the licence when run from the `tools` folder.

## [0.1.0] - 2026-10-08

First assembly of the repository from two development branches.

### Added
- `tools/gs-check`: the checker for the twelve elements (`--strict`, `--both`, `--verbose`, `--migration`, `--sync`), with its control projects and tests.
- `tools/gs-lock`: the spec lock, the co-change gate (`gs-cochange`) and the red proofs (`gs-redproof`).
- `tools/gs-decide`: the signed decision and ratification record with its hooks, `gs-attribution-hook` and `gs-decide-ci`.
- `tools/gs-snapshot`: a dated snapshot of what a project can compute about itself.
- `tools/gs-init`: the installer that wires a project at one of three depths (L0, L1, L2).
- `tools/gs-demo`: a quick look (about 30 seconds) at a project folder; reads a copy, runs no project code, grades nothing.
- `scripts/run-tests.mjs`, and a GitHub Actions workflow that runs every suite on Linux and Windows with Node 20 and 22.

### Changed
- The tools reference each other as siblings under `tools/`. The copies of `gs-check` and `gs-lock` that the installer, the decision tool and the snapshot tool carried under their test folders are gone, and `gs-snapshot` reads the control projects of `gs-check` instead of keeping its own copy.
- Links to documents that are not published were removed from the tool READMEs; the method is at https://genspec.dev.
