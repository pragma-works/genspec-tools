# genspec-tools: specification

The source of truth for what this repository's tools promise. Edit the spec first, then the tests, then the code. Ids are never renumbered or reused.
Every criterion below names the test file that checks it, and that test cites the criterion id on or just above its definition. A criterion states what a test pins; it does not claim that the tool is right in general (see the README, "Honest status").

## F-001 gs-check judges a repository without changing it

`gs-check` reports a status for each of the twelve elements on the committed state of a git repository, in a throwaway clone.

### Acceptance criteria

- F-001.1 The checker MUST give each control project exactly the statuses declared for it, so that a project with one element removed or broken does not read PASS on that element. verified by: tools/gs-check/test/controls.test.mjs
- F-001.2 The checker MUST NOT modify the repository under test (working tree, HEAD and git configuration unchanged after a run). verified by: tools/gs-check/test/controls.test.mjs
- F-001.3 Two runs on the same project MUST give identical statuses and reasons. verified by: tools/gs-check/test/controls.test.mjs
- F-001.4 The command MUST exit 0 and print twelve PASS lines on a known-good project, and exit 1 on a negative control, with the same statuses on a second run. verified by: tools/gs-check/test/smoke-cli.test.mjs
- F-001.5 In strict mode a hook that never blocks MUST NOT be credited as a gate. verified by: tools/gs-check/test/smoke-cli.test.mjs

## F-002 gs-lock notices a change to a locked spec section and gates behaviour changes

`gs-lock` ties derived files to spec sections by tag and hash; `gs-cochange` refuses a behaviour change that cites no spec.

### Acceptance criteria

- F-002.1 A reworded spec criterion MUST make the file derived from it STALE. verified by: tools/gs-lock/test/gs-lock.test.mjs
- F-002.2 A ratification without a reason of at least 15 characters MUST be refused and leave the lock unchanged. verified by: tools/gs-lock/test/gs-lock.test.mjs
- F-002.3 A behaviour change typed as a refactor MUST be refused (NOT A REFACTOR) when the parent commit's tests fail against it. verified by: tools/gs-lock/test/gs-lock.test.mjs
- F-002.4 A source change that cites no spec id and stages no spec change MUST be rejected; citing an id the spec defines MUST be accepted. verified by: tools/gs-lock/test/gs-lock.test.mjs

## F-003 gs-decide keeps an append-only, hash-chained record of human decisions

`gs-decide` records who accepted what, and its hook refuses protected changes that nobody accepted.

### Acceptance criteria

- F-003.1 Editing the reason of an old entry MUST be detected by verify. verified by: tools/gs-decide/test/decide.test.mjs
- F-003.2 The hook MUST refuse a protected spec change that has no entry and accept it once an entry covers that content. verified by: tools/gs-decide/test/decide.test.mjs
- F-003.3 An open waiver past its expiry date MUST fail verify. verified by: tools/gs-decide/test/decide.test.mjs
- F-003.4 An entry made by an agent-suspected identity MUST NOT approve a change. verified by: tools/gs-decide/test/decide.test.mjs

## F-004 gs-snapshot reports what a project can compute about itself, and says what it cannot

### Acceptance criteria

- F-004.1 The same repository state and date MUST give identical snapshot bytes. verified by: tools/gs-snapshot/test/snapshot.test.mjs
- F-004.2 A missing checker MUST be said in the report, not guessed. verified by: tools/gs-snapshot/test/snapshot.test.mjs
- F-004.3 KPIs and audit results MUST NOT be computed by the tool; absent, they are empty or n/a, and supplied ones are labelled supplied. verified by: tools/gs-snapshot/test/snapshot.test.mjs

## F-005 gs-init wires a project without destroying what is there

### Acceptance criteria

- F-005.1 A dry run MUST write nothing, not even a repository. verified by: tools/gs-init/test/init.test.mjs
- F-005.2 A second run MUST change nothing and make no backup. verified by: tools/gs-init/test/init.test.mjs
- F-005.3 A file of the project's own MUST get a marked block or a merged key after a backup, never a replacement. verified by: tools/gs-init/test/init.test.mjs
- F-005.4 The generated gate MUST refuse a broken spec shape, an open question, a ratchet floor fall and an untyped commit message, and accept the good versions. verified by: tools/gs-init/test/init.test.mjs
- F-005.5 An existing git hook MUST be carried over and still run after the checks. verified by: tools/gs-init/test/init.test.mjs

## F-006 gs-demo looks at a project without touching it or grading it

### Acceptance criteria

- F-006.1 The original folder MUST NOT be modified and no temporary copy may be left behind. verified by: tools/gs-demo/test/demo.test.mjs
- F-006.2 The output MUST NOT say "governed" or give a grade, and MUST end with the quick-look line. verified by: tools/gs-demo/test/demo.test.mjs
- F-006.3 A very large folder MUST be refused with a message and nothing copied. verified by: tools/gs-demo/test/demo.test.mjs

### Decisions

Why it is built this way: docs/decisions/0001-adopt-generative-specification.md.
