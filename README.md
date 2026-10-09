# genspec-tools

Checks that a software project built with AI assistance has what it needs to be trusted, and tests that those checks really work.

Plain Node, no dependencies, no model, no network. Each tool is one file you can read in an afternoon. MIT licence.

The checks look for twelve things a team can write down and enforce (a spec with numbered criteria, a gate that blocks a failing change, a record of who decided what, and so on; the list is below). For every one of them the repository has two kinds of evidence: a tool that looks for it, and a set of hand-made projects, some good and some broken on purpose, that the tool has to tell apart. A check that cannot tell a project with a gate from a project with a gate that never blocks is not worth running, so the second half matters as much as the first.

## Honest status

- **Tested, not validated.** Every tool has its own test suite (counts below, as measured on 2026-10-08) and was tuned in development loops on hand-made control projects and on a small number of development runs. None of it has been validated in a registered study. Nobody independent has yet written controls for it or audited it. Treat a result as a lead to follow, not as a finding.
- **The controls were written by the author of the checker.** That is the main weakness of the evidence. Independent controls are owed. Contributions that find a false "found" or a false "missing" are the most useful kind (see CONTRIBUTING).
- **A green result means the form is there and, where a tool says so, that a planted violation was refused.** It does not mean the software is right, that the spec is right, or that a test checks what it claims to.
- **What no tool here can prove:** that a spec describes what the users need; that a test is a good test; that a derived document is true of the code; that nobody skipped the hooks (`git commit --no-verify`); anything about server-side settings such as branch protection or required review, because a clone cannot show them; anything an assistant could fake by writing a file.
- **Not an audit, not a grade, not a certification.** No tool in this repository prints a score for a project or says that a project is "compliant" or "certified".

## This repository's own status

The repository is checked with its own `gs-check --strict` (`node scripts/self-check.mjs --since a101644`, also run by CI in the Linux job). It was installed at level L1 of `gs-init`, which claims E01 to E03, E06 and E07 and leaves the rest to the project. Measured on 2026-10-09 (Windows, Node 24, commit 023255d):

| Element | Result | Note |
|---|---|---|
| E01 sentinel | PASS | `CLAUDE.md` routes to the spec, decisions, open questions, the three derived documents and this README |
| E02 spec ids | PASS | `docs/spec/SPEC.md`: 7 requirements, 46 criteria, each naming a test file |
| E03 decisions | PASS | `docs/decisions/0001-...`; its status is still **Proposed**: the owner has not accepted it, and no tool or assistant does that for him |
| E04 derived documents | PASS | architecture, data model and conventions are short and written by hand; nobody has audited them against the code |
| E05 tests and a blocking gate | PASS | the pre-commit and pre-push hooks run `npm test`, the fast tier (about 40 seconds). The heavy suites (gs-decide, gs-snapshot, gs-init) and the slow gs-check controls run in `npm run test:quick`, `npm run test:all` and CI, not in the hooks, so a failing edit to one of them is caught on the server, not at commit |
| E06 ratchet floor | PASS | `docs/baseline.json`: criteria floor 46. The test floor is **0**: the generated gate does not look inside `tools/`, so it counts no tests here and that floor protects nothing |
| E07 open-questions gate | PASS | `docs/open-questions.md` is empty (no open question), so this says only that the gate would refuse one |
| E08 criteria coverage | PASS | by mapping: each criterion points at a test file that cites its id at a test definition. This shows that a test is named, not that the test is a good test of the criterion; the 24 mappings were chosen by the person who wrote the spec, which is also the person who wrote the checker's tests |
| E09 commits | PASS since `a101644`; **PARTIAL over the whole history** | two early assembly commits (62116f5, 57 files; 5f5dedd, 7 files) are not atomic and public history is not rewritten |
| E10 spec lock | **not met** (PARTIAL) | `gs-lock` is not wired to this repository: no lock file, no tags on the code. L1 leaves it to day 7 to 30 |
| E11 co-change gate | **not met** (ABSENT) | not wired; and `gs-check` finds no source file outside `tools/` to probe, so it cannot judge it here |
| E12 README steps | PASS | the commands in the "Fresh clone" block run from a clean clone; the `npx` commands are in text blocks, which the check does not run (they need the network) |

What this does not show: that the spec is the right spec, that the criteria are all that matters, that a CI re-check is a required check (branch protection is a server setting and is not set by this repository), or that the hooks are installed in your clone (run `node scripts/install-hooks.mjs` once). The same author wrote the tools, the tests, the spec and the mapping between them. It also applies the checker to itself with a configuration the author chose to pass; the E09 start commit is such a choice.

## Try it in one line

```text
npx github:pragma-works/genspec-tools demo --sample
```

That is the whole install. `npx` downloads this repository from GitHub into npm's cache, runs the `gs` command in it, and leaves nothing in your folder. There is no clone, no account and no package registry. It needs **Node 18 or later and git**, and an internet connection the first time.

`demo --sample` looks at a small example project that comes with the tools, so you can see the output before you point it at your own work. Then try it on a project of yours (it only reads; it works on a copy):

```text
cd your-project
npx github:pragma-works/genspec-tools demo
```

With no command at all, inside a project folder, it does the same: `npx github:pragma-works/genspec-tools`.

If you will use it more than once, the short form is a global install from the same address (`npm install -g github:pragma-works/genspec-tools`), after which every command below is `gs <command>`. Everything below is written as `gs`; with `npx` put `npx github:pragma-works/genspec-tools` in its place.

| Command | What it does |
|---|---|
| `gs demo [folder]` | The quick look (seconds): what is there, what is missing, the three most useful next steps. `--sample` uses the example project. Reads a copy, runs none of your code |
| `gs start` | For a first time: five lines of explanation, the quick look, then the lightest setup (level L0, notes only) |
| `gs init` | Sets the project up. In a terminal it asks two questions (how deep, and which assistant files: `CLAUDE.md`, `AGENTS.md`, Cursor rules). For scripts: `gs init --level L1 --agents claude,codex --yes`. `--dry-run` lists what it would do and writes nothing |
| `gs doctor` | What is installed here, what is missing, and whether the tool copies match this version |
| `gs update` | Fetches the newest tools from GitHub and runs the setup again; anything it replaces is copied to `.gs-init-backup/` first |
| `gs uninstall` | Takes out only what `gs init` wrote, using the record it made (`.gs-manifest.json`). A file you changed since stays. Your code and your git history are never touched |
| `gs check` | The full test (minutes): plants mistakes in a throwaway copy of your last commit and sees whether your checks refuse them. It runs your project's own code |
| `gs lock`, `gs decide`, `gs snapshot` | The other tools, with their usual options |

Measured on 2026-10-09 through the GitHub address above, wall clock, one run each. Cold means an empty npm cache (the first run ever on that machine, download included); warm means the same command again.

| | Windows 11, Node 24 | Linux container, Node 22 |
|---|---|---|
| `gs help`, cold | 8.7 s | 3.2 s |
| `gs demo --sample`, warm | 2.3 s | 1.1 s |
| `gs init --level L1` on a small Node project, with its strict self-check | 10.6 s (cold) | 2.2 s (warm) |

Node 18.20 is the oldest version tried (the tests of `bin/test/gs.test.mjs` pass on it in a Linux container); Node 16 is refused with a message and exit 2.

### What this does not do

- It needs Node and git on your machine. It does not install either.
- It is not on the npm registry. Publishing there needs the maintainer's npm account; the exact steps are in [docs/publishing-to-npm.md](docs/publishing-to-npm.md) and have not been run. Until then the address above is the way in, and it follows the `main` branch of this repository: you get whatever is on `main` at that moment. To pin a version, add a tag or a commit: `npx github:pragma-works/genspec-tools#<commit>`.
- It trusts GitHub and npm to deliver this repository unchanged. Read the one file `bin/gs.mjs` (under 300 lines) before running it, as with any `npx` command.
- `gs init` does not make your spec right, write your tests, choose who ratifies, set branch protection or stop `git commit --no-verify`. `gs init` needs no model and no internet, and never edits your code, commits or pushes (`gs update` is the one command that fetches).
- The quick look is not a grade. A green `gs init` proof means the form it claims is there and a planted violation was refused; nothing here says the software is right.
- A teammate who clones the project afterwards needs `node scripts/install-hooks.mjs` once, because git does not copy hook settings. Nothing needs gs installed to run the checks, which are copied into the project.
- `gs uninstall` needs the record. A project set up before the record existed (before 2026-10-09) has none: run `gs init` once more (it changes nothing that is already right) and then `gs uninstall`.
- `.gs-manifest.json` is meant to be committed with the setup, so a teammate can uninstall too. The `.git` folder that `gs init` makes in a folder that had none, and `.gs-init-backup/`, are never removed by `gs uninstall`.

### Without npx

```
git clone https://github.com/pragma-works/genspec-tools
cd genspec-tools
node bin/gs.mjs demo --sample
node tools/gs-demo/gs-demo.mjs .
```

The last line looks at the clone itself; give it the path of your own project instead of the dot. The old way of calling a tool directly (`node tools/gs-demo/gs-demo.mjs <path>`) still works, and so does every other file under `tools/`.

For the real test, which plants a violation in a throwaway clone and sees whether your gates refuse it (minutes, and it runs your project's code, so use a disposable environment for a project you did not write):

```
node tools/gs-check/gs-check.mjs --repo <full-path-to-your-project> --strict
```

## The twelve elements

| | What it is |
|---|---|
| E01 | A sentinel file (`CLAUDE.md`, `AGENTS.md` or similar) that routes to the project's documents, and every route exists |
| E02 | A spec with unique requirement ids and acceptance-criterion ids |
| E03 | Decision records, referenced from the documents |
| E04 | Architecture, data model and conventions documents, routed from the sentinel |
| E05 | Tests plus an enforced gate that blocks a failing change |
| E06 | A ratchet floor file; a regression is refused and the floor cannot be lowered |
| E07 | An open-questions gate that fails while a question is open |
| E08 | Criteria coverage: every acceptance criterion maps to a test |
| E09 | Atomic, descriptive, conventional commits |
| E10 | A spec lock: a change to a locked section of the spec is noticed |
| E11 | A co-change gate: a behaviour change needs a spec citation or a document change; a refactor must pass the parent commit's tests |
| E12 | The README steps work from a clean clone |

The method behind them is at https://genspec.dev.

## The tools

| Tool | What it does | What it cannot prove |
|---|---|---|
| [`gs`](bin/gs.mjs) | The front door: `gs demo`, `start`, `init`, `check`, `lock`, `decide`, `snapshot`, `update`, `uninstall`, `doctor`. Picks the tool, asks at most two questions, says in plain words what it got and what to do next | Nothing the tools do not: it adds no check of its own |
| [`gs-demo`](tools/gs-demo) | The 30-second quick look described above | That any gate works; it reads wiring and says so. E12 is never checked |
| [`gs-check`](tools/gs-check) | Judges the twelve elements as present **and working** on a git repository, in a throwaway clone; `--strict` credits only a hook that refuses a planted violation; `--both`, `--verbose`; `--migration` and `--sync` for projects that were migrated or got a spec generated from existing code | Server-side CI, branch protection, `--no-verify`, whether a spec or a test is good. Runs project code |
| [`gs-lock`](tools/gs-lock) | The spec lock (`gs-lock`), the co-change gate (`gs-cochange`) and one-command red proofs (`gs-redproof`) | That a tagged file really implements its spec section; `ratify` is a command anyone, or any agent, can run |
| [`gs-decide`](tools/gs-decide) | An append-only, hash-chained record of decisions and ratifications under a named git identity, optionally signed; a hook that refuses protected changes without one; `gs-attribution-hook` for marking agent-made commits; `gs-decide-ci` for the server re-check | That the person who ratified understood what they ratified; local hooks can be skipped, so the CI re-check must be a required check |
| [`gs-snapshot`](tools/gs-snapshot) | A dated, deterministic report of what a project can compute about itself, and the difference since the last one | Anything about correctness; counts are counts |
| [`gs-init`](tools/gs-init) | An installer that wires a project at one of three depths (L0 commit trailers, L1 hooks and gates, L2 signed ratifications and CI), with `--dry-run`, an install record and `--uninstall` | That the spec is right, who should ratify, or that branch protection is on |

The tools sit side by side and call each other by relative path (`gs-init` copies `gs-check`, `gs-lock` and `gs-decide` into a project; `gs-snapshot` and `gs-demo` use `gs-lock`; the tests of several tools use the control projects of `gs-check`). Nothing is vendored.

## Tests

```
npm test
```

`npm test` runs the fast tier (about 40 seconds: every suite except the slow gs-check ones and the three heavy ones, gs-decide, gs-snapshot and gs-init), which is what the pre-commit hook runs. An edit to a heavy suite is only run by the wider tiers and by CI. `npm run test:quick` (or `node scripts/run-tests.mjs --quick`) runs every suite except the long gs-check controls, and `npm run test:all` (or `node scripts/run-tests.mjs`) runs everything.

Measured on Node 24 on Windows 11 and in a Linux container (Node 22):

| Suite | Tests | Windows (Node 24) | Linux (Node 22) |
|---|---|---|---|
| gs-check controls | 53 | 53 pass, about 20 min | 53 pass, about 4.5 min |
| gs-check migration controls | 17 | 17 pass | 17 pass |
| gs-check smoke (the command on known projects) | 11 | 11 pass | 11 pass |
| gs-check sync controls | 6 | 6 pass | 6 pass |
| gs-check unit | 10 | 10 pass | 10 pass |
| gs-lock | 75 | 75 pass | 75 pass |
| gs-decide | 38 + 19 | 57 pass | 57 pass |
| gs-snapshot | 19 | 19 pass | 19 pass |
| gs-init | 19 | 19 pass | 19 pass |
| gs-demo | 13 | 13 pass | 13 pass |
| gs (dispatcher, install record, uninstall, update) | 14 | 14 pass | 14 pass |
| **Total** | **294** | see below | see below |

The 280 other tests were measured on 2026-10-08; the 14 of `gs` on 2026-10-09 (Windows Node 24, Linux Node 22 and Node 18); the 294 have not been run together in one pass here. CI runs everything on Linux and Windows with Node 20 and 22 (`.github/workflows/test.yml`).

## Licence

MIT. See [LICENSE](LICENSE). Contributing: [CONTRIBUTING](CONTRIBUTING.md). Security: [SECURITY](SECURITY.md). History: [CHANGELOG](CHANGELOG.md).

<!-- gs-init:begin (managed block; edit outside it) -->
## Fresh clone (Generative Specification checks)

```bash
node scripts/install-hooks.mjs
node scripts/gs-gate.mjs all
```

The first line points git at the hooks of this project; the second runs the same checks the hooks run.
<!-- gs-init:end -->
