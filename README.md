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

## Thirty-second quickstart

```
git clone https://github.com/jghiringhelli/genspec-tools
cd genspec-tools
node tools/gs-demo/gs-demo.mjs /full/path/to/your/project
```

Needs Node 18 or later and git. It copies your project to a temporary folder (your folder is only read), looks at the twelve things in about half a minute without running any of your code, and prints what it found, what is missing, and the three most useful next steps. It refuses a very large folder with a message. It is a quick look: for some elements it only reads how a gate is wired and says so; for others it says "not checked in the quick look".

For the real test, which plants a violation in a throwaway clone and sees whether your gates refuse it (minutes, and it runs your project's code, so use a disposable environment for a project you did not write):

```
node tools/gs-check/gs-check.mjs --repo /full/path/to/your/project --strict
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
| [`gs-demo`](tools/gs-demo) | The 30-second quick look described above | That any gate works; it reads wiring and says so. E12 is never checked |
| [`gs-check`](tools/gs-check) | Judges the twelve elements as present **and working** on a git repository, in a throwaway clone; `--strict` credits only a hook that refuses a planted violation; `--both`, `--verbose`; `--migration` and `--sync` for projects that were migrated or got a spec generated from existing code | Server-side CI, branch protection, `--no-verify`, whether a spec or a test is good. Runs project code |
| [`gs-lock`](tools/gs-lock) | The spec lock (`gs-lock`), the co-change gate (`gs-cochange`) and one-command red proofs (`gs-redproof`) | That a tagged file really implements its spec section; `ratify` is a command anyone, or any agent, can run |
| [`gs-decide`](tools/gs-decide) | An append-only, hash-chained record of decisions and ratifications under a named git identity, optionally signed; a hook that refuses protected changes without one; `gs-attribution-hook` for marking agent-made commits; `gs-decide-ci` for the server re-check | That the person who ratified understood what they ratified; local hooks can be skipped, so the CI re-check must be a required check |
| [`gs-snapshot`](tools/gs-snapshot) | A dated, deterministic report of what a project can compute about itself, and the difference since the last one | Anything about correctness; counts are counts |
| [`gs-init`](tools/gs-init) | An installer that wires a project at one of three depths (L0 commit trailers, L1 hooks and gates, L2 signed ratifications and CI), with `--dry-run` | That the spec is right, who should ratify, or that branch protection is on |

The tools sit side by side and call each other by relative path (`gs-init` copies `gs-check`, `gs-lock` and `gs-decide` into a project; `gs-snapshot` and `gs-demo` use `gs-lock`; the tests of several tools use the control projects of `gs-check`). Nothing is vendored.

## Tests

```
node scripts/run-tests.mjs --quick     # every suite except the long gs-check controls
node scripts/run-tests.mjs             # everything
```

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
| **Total** | **280** | **280 pass, 0 fail** | **280 pass, 0 fail** |

CI runs everything on Linux and Windows with Node 20 and 22 (`.github/workflows/test.yml`).

## Licence

MIT. See [LICENSE](LICENSE). Contributing: [CONTRIBUTING](CONTRIBUTING.md). Security: [SECURITY](SECURITY.md). History: [CHANGELOG](CHANGELOG.md).
