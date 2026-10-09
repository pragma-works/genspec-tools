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
- F-001.6 A sentinel MUST NOT be reported as pointing to missing files because of a template path with a bracket placeholder or a bare word such as `test`. verified by: tools/gs-check/test/unit.test.mjs
- F-001.7 A project whose readme is named Readme.md MUST NOT have its clean baseline commit reported as blocked when it has no hook. verified by: tools/gs-check/test/readme-case.test.mjs
- F-001.8 The README check MUST NOT run a command that changes the machine that runs it (a global install, a system package manager, a download piped into a shell), and MUST NOT run a sentence written in a code block as if it were a command. verified by: tools/gs-check/test/unit.test.mjs

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
- F-006.4 A sentinel MUST NOT be marked weak because it mentions code, a package scope or a web address in backticks; a real missing document MUST still be named, with the note that it may be advice and not a route. verified by: tools/gs-demo/test/demo.test.mjs
- F-006.5 A spec numbered per feature folder (specs/001-name/spec.md, the spec-kit layout) MUST NOT be reported as having duplicate ids, a real duplicate inside one file MUST still be reported, and a spec-driven tool folder (.specify, openspec, _bmad) MUST be named in the E02 note. verified by: tools/gs-demo/test/demo.test.mjs
- F-006.6 A CI step that runs the tests through make ci, tox, nox, just, bun, vitest or jest MUST count as a gate that runs them; a CI file that runs no test command MUST NOT. verified by: tools/gs-demo/test/demo.test.mjs
- F-006.7 When fewer than 5 percent of the files are source code (or none), the output MUST say, in a note before the elements, that the checks are written for software projects and that a documents, content or game-assets project needs a different profile; the list of found elements MUST NOT be phrased as a tally out of twelve; a skipped commit check MUST say why. verified by: tools/gs-demo/test/demo.test.mjs

## F-007 gs is one front door to the tools, and takes out only what it put in

`bin/gs.mjs` picks the tool, asks at most two questions, and says in plain words what it got and what to do next. `gs-init` records what it wrote in `.gs-manifest.json`, and `gs uninstall` removes only that.

### Acceptance criteria

- F-007.1 An unknown command or an unknown assistant name MUST be refused with exit 2 and nothing written, and the help MUST name every command. verified by: bin/test/gs.test.mjs
- F-007.2 With no command in a project folder, and with `demo`, gs MUST run the quick look and leave the folder byte for byte as it was. verified by: bin/test/gs.test.mjs
- F-007.3 `init` with flags MUST ask nothing and write the assistant files asked for; in a terminal it MUST ask the level and the assistants and map the answers; it MUST refuse a home folder or a drive root. verified by: bin/test/gs.test.mjs
- F-007.4 `init` MUST record every file and block it wrote in `.gs-manifest.json`, and a second run MUST leave the record and the folder byte-identical and make no backup. verified by: bin/test/gs.test.mjs
- F-007.5 `uninstall` MUST remove what the record says, leave every file of the person's byte for byte (a file changed after it was written is kept), restore the person's own git hook, unset the hooks setting it set, and remove only the folders it emptied. verified by: bin/test/gs.test.mjs
- F-007.6 `uninstall --dry-run` MUST change nothing, and `uninstall` MUST refuse when there is no record, or when it cannot ask and was not given `--yes`. verified by: bin/test/gs.test.mjs
- F-007.7 `update` MUST re-run the setup from a given or fetched copy of the tools, back up each file it replaces, leave the person's files alone, and a second update MUST change nothing. verified by: bin/test/gs.test.mjs
- F-007.8 `doctor` MUST list what is installed and what is missing, flag tool copies that differ from this gs, and say that it does not test that anything works. verified by: bin/test/gs.test.mjs
- F-007.9 `start` MUST explain itself before acting, take the quick look, and then set up level L0 only. verified by: bin/test/gs.test.mjs
- F-007.10 The other tools (`lock`, `decide`, `snapshot`, `check`) MUST be reachable through gs with their own options. verified by: bin/test/gs.test.mjs

### Decisions

Why it is built this way: docs/decisions/0001-adopt-generative-specification.md.
