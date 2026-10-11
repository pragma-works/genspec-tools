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
- F-001.8 The README check MUST NOT run a command that changes the machine that runs it (a global install, a system package manager, a download piped into a shell), and MUST NOT run a sentence, a configuration line (key: value) or a command with a placeholder ellipsis written in a code block as if it were a command. verified by: tools/gs-check/test/unit.test.mjs
- F-001.9 The text output of gs-check MUST say, on a line of its own after the unchanged `summary (mode): {...}` line, that the summary counts elements by status and is not a grade of the project. verified by: tools/gs-check/test/readme-case.test.mjs
- F-001.10 When the repository under test is a shallow clone and git refuses the push of the push-stage probe, the checker MUST report UNDETERMINABLE and name the shallow clone, not a red pre-push gate. verified by: tools/gs-check/test/shallow.test.mjs
- F-001.11 The checker MUST NOT install Python packages into the Python environment of the machine that runs it: every command it starts carries PIP_REQUIRE_VIRTUALENV, and a Python project is run in a virtual environment inside the throwaway folder. verified by: tools/gs-check/test/python-isolation.test.mjs

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
- F-006.6 A CI step that runs the tests through make ci, tox, nox, just, bun, vitest or jest MUST count as a gate that runs them; a CI file that runs no test command MUST NOT; when the tests are run only by CI, the note MUST say that gs-check --strict credits only a hook. verified by: tools/gs-demo/test/demo.test.mjs
- F-006.7 When fewer than 5 percent of the files are source code (or none), the output MUST say, in a note before the elements, that the checks are written for software projects and that a documents, content or game-assets project needs a different profile; the list of found elements MUST NOT be phrased as a tally out of twelve; a skipped commit check MUST say why. verified by: tools/gs-demo/test/demo.test.mjs
- F-006.8 A spec MUST NOT be reported as found with fewer than 3 numbered ids, a decision-record id (ADR-...) MUST NOT count as a requirement or criterion, and when a spec has ids but no criteria heading, the ids MUST be matched against the tests by their plain name. verified by: tools/gs-demo/test/demo.test.mjs
- F-006.9 A floor file or a gate script inside a fixtures, samples or examples folder MUST NOT be credited as the project's own ratchet or gate. verified by: tools/gs-demo/test/demo.test.mjs

## F-007 gs is one front door to the tools, and takes out only what it put in

`bin/gs.mjs` picks the tool, asks at most two questions, and says in plain words what it got and what to do next. `gs-init` records what it wrote in `.gs-manifest.json`, and `gs uninstall` removes only that.

### Acceptance criteria

- F-007.1 An unknown command or an unknown assistant name MUST be refused with exit 2 and nothing written, and the help MUST name every command. verified by: bin/test/gs.test.mjs
- F-007.2 With no command in a project folder, and with `demo`, gs MUST run the quick look and leave the folder byte for byte as it was; the next step it prints MUST be `gs check`, not a path into the tool folder. verified by: bin/test/gs.test.mjs
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

## F-008 Code from a project under examination runs only where it can do no harm

 runs the project's own install steps, git hooks and tests, which is running a stranger's program when the project is not yours. So by default it runs inside a throwaway container, never silently on the host, and  runs nothing of the target at all. What a container does and does not enforce is in tools/gs-check/README.md, section "Trust and isolation".

### Acceptance criteria

- F-008.1  MUST refuse with exit 2, in plain words that name the two ways forward (install Docker, or the explicit host flags), and MUST run no project code and judge no element, when Docker is not running and the host flags are not both given. verified by: tools/gs-check/test/isolation.test.mjs
- F-008.2 Running on the host MUST need both  and  (either alone is refused), MUST print a warning, and MUST require the repository name typed by a person unless CI=true; a wrong or missing name MUST run nothing; the report MUST say . verified by: tools/gs-check/test/isolation.test.mjs
- F-008.3 Inside a container already (the tools' own CI, , )  MUST run directly without the flags. verified by: tools/gs-check/test/isolation.test.mjs
- F-008.4 In the container the twelve statuses and the exit code MUST equal those of the host run on a good Node project, a good Python project, a project wired to the reference lock tool, and three broken projects. verified by: tools/gs-check/test/isolation.test.mjs
- F-008.5 A project whose README install step and test write files outside the clone and in the home folder and read an environment variable MUST be contained: none of the files appears on the host, the variable and the host home path MUST NOT be visible to it, and the same project run on the host MUST do all of that (the control). verified by: tools/gs-check/test/isolation.test.mjs
- F-008.6 The container MUST start with no network unless  is given, MUST say which it did, and MUST leave the original repository untouched. verified by: tools/gs-check/test/isolation.test.mjs
- F-008.7 , directly and through the front door, MUST execute nothing from the target: a project with canaries in its package scripts, hooks, its own lock tool, a gate script and the programs named in its  MUST fire none, while a control shows the git-config canary is live. verified by: tools/gs-demo/test/no-execution.test.mjs
- F-008.8 The proof of  MUST run in the container, or be skipped in plain words when Docker is missing; running it on the host MUST need  and a typed folder name unless CI=true. verified by: tools/gs-init/test/init.test.mjs

## F-009 gs start reads the project with a program and hands the judgement to the person's assistant

`gs start` splits the work. A program reads the facts (`.gs/inventory.json`, `.gs/inventory.md`) and writes a prompt (`.gs/start-prompt.md`); the person's own assistant, started by the person, reads the code for intent, drafts a spec proposal and asks the questions; the person ratifies. gs starts no assistant unless `--launch` is given, and the proposal's quality depends on the model, which no test here exercises.

### Acceptance criteria

- F-009.1 The inventory MUST report, for node, python, go and dotnet projects, without a model and without running any code of the project, the package manager, the test commands found, the entry points, the routes and command names that a pattern finds, and the dependencies; two reads of the same state MUST give the same bytes. verified by: tools/gs-start/test/start.test.mjs
- F-009.2 A folder that is mostly not code MUST get the note "this is mostly not code, it needs a different profile", and `gs start` MUST write nothing in it: no spec, no prompt, no inventory. verified by: tools/gs-start/test/start.test.mjs
- F-009.3 The prompt MUST name every heading of the spec template that `gs-init` writes (read from the template itself), the sections of a spec proposal, the two tags FOUND IN CODE and ASSUMED, the questions each with a recommended answer, and the steps in the order read, explore, draft, ask, update, stop, check. verified by: tools/gs-start/test/start.test.mjs
- F-009.4 The prompt MUST forbid the assistant to record a ratification, an acceptance or a signature, every mention of the commands that record one MUST be a prohibition or be addressed to the person, and the stop for the person's ratification MUST come before `gs check`. verified by: tools/gs-start/test/start.test.mjs
- F-009.5 The prompt MUST follow the folder: an empty one asks for the intent first, a complete spec gets verify and sync, a draft spec is continued, and the placeholder spec that `gs-init` writes MUST NOT count as a spec. verified by: tools/gs-start/test/start.test.mjs
- F-009.6 A second `gs start` MUST change nothing and make no backup; a changed project MUST rewrite the derived files; a derived file the person edited MUST be copied to the backup folder first; `gs uninstall` MUST remove the files `gs start` wrote; `--dry-run` MUST write nothing. verified by: tools/gs-start/test/start.test.mjs
- F-009.7 Only the assistant CLIs found on the PATH MUST be offered, each with the command whose flags were read from that CLI's own `--help`; with none found, the generic instruction MUST be printed; no assistant MUST be started unless `--launch <cli>` is given; an unknown or missing CLI MUST be refused with exit 2 before anything is written. verified by: tools/gs-start/test/start.test.mjs
- F-009.8 `--assistant` MUST choose the instruction file written (CLAUDE.md, .github/copilot-instructions.md, AGENTS.md, GEMINI.md, .cursor/rules, or only the neutral AGENTS.md for none), several may be given, and an unknown name MUST be refused with exit 2 and nothing written. verified by: bin/test/gs.test.mjs
- F-009.9 `gs start --verify-spec` MUST report a FOUND IN CODE tag whose file or line does not exist (exit 1), MUST report requirement and criterion lines that carry no tag, and MUST say that it does not check that the code does what the sentence says. verified by: tools/gs-start/test/start.test.mjs
- F-009.10 Reading a project MUST start nothing of the project's: a package script and a git setting that names a program MUST NOT run. verified by: tools/gs-start/test/start.test.mjs
- F-009.11 When the project already has documentation, the prompt MUST make the assistant compare it with the code and list every discrepancy with file and line on both sides in docs/discrepancies.md, create the sentinel from what it finds, list technical debt in docs/tech-debt.md and ask whether a debt list exists elsewhere, ask for what the person wants to change in docs/roadmap.md, and configure the gates, hooks and baseline to reflect the project as it is, writing each accepted-as-is choice as a decision record with Status Proposed that the assistant MUST NOT ratify; the as-is spec, the discrepancies, the roadmap and the debt list MUST stay four separate files, and the inventory MUST detect existing documentation, decision records, backlog files and TODO or FIXME markers. verified by: tools/gs-start/test/start.test.mjs
- F-009.12 The assistant CLIs claude, codex and copilot (the three most used by the evidence of 2026-10-10) MUST come first, each with a launch command read from its own --help, and any further CLI MUST be marked second tier. verified by: tools/gs-start/test/start.test.mjs

### Decisions

Why it is built this way: docs/decisions/0001-adopt-generative-specification.md.
