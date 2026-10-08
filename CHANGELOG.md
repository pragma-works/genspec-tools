# Changelog

All notable changes to this repository. The tools are not versioned separately yet.

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
