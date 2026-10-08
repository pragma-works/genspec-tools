# Contributing

Small, plain rules.

- **Node only, no dependencies.** Node 18 or later. No `package.json` dependencies, no build step, no network, no model in the tools or in their tests.
- **Every change has a test.** A tool lives in `tools/<name>/` with its tests in `tools/<name>/test/`. Run the quick suites with `node scripts/run-tests.mjs --quick` and everything with `node scripts/run-tests.mjs` (the `gs-check` controls take minutes: about four on Linux, twenty on Windows). Tools reference each other by relative path (`../gs-lock/gs-lock.mjs`); do not copy a tool into another one.
- **A new check needs a project that fails it.** The tests build small hand-made projects (see `tools/gs-check/test/build-fixtures.mjs` and `variants.mjs`): a good one, and one with a single element removed or broken. Add the variant that your check must refuse, and the one it must not refuse.
- **Say what a tool cannot prove.** Each tool README has a section for it. If your change widens or narrows what a tool can see, update that section.
- **Commits:** conventional (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), one logical change each, a message that says what changed and why. If an assistant wrote part of the change, say so with a `Co-Authored-By:` trailer.
- **Licence:** by contributing you agree that your contribution is under the MIT licence of this repository.

Open an issue before a large change. Reports of a false positive (a tool says "found" where the thing is not there) or a false negative are the most useful contribution.
