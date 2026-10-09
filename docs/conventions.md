# Conventions

The rules for contributors are in [CONTRIBUTING.md](../CONTRIBUTING.md); the short form for this repository:

- Plain Node 18 or later, no dependencies, no build step, no network, no model in the tools or their tests.
- A tool lives in `tools/<name>/` with its tests in `tools/<name>/test/`; tools reference each other by relative path and are never copied into one another.
- Every change has a test. A new check needs a hand-made project that fails it and one that must not.
- Change the spec first (`docs/spec/SPEC.md`): a criterion states what a test pins, names the test file after `verified by:`, and the test cites the criterion id on or just above its definition.
- Commits read `type: what changed` with one logical change each (feat, fix, docs, refactor, test, chore, build, ci, perf, style, revert). A commit made with an assistant carries a `Co-Authored-By:` trailer; an assistant never adds `Signed-off-by`.
- Each tool README says what the tool cannot prove; keep it true when the tool changes.
- `npm test` runs the fast tier (what the pre-commit hook runs); `npm run test:quick` and `npm run test:all` run more; CI runs everything.
