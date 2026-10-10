# gs-check: the substrate conformance checker

> **Trust warning.** gs-check runs the project's own tests, git hooks and install steps. Only run it on code you trust, or let it use the container default: a throwaway Docker container with no network, a read-only copy, a non-root user, no access to your home folder and none of your environment variables. Without Docker it refuses and says how to go on. See [Trust and isolation](#trust-and-isolation).

One file, `gs-check.mjs`. Node 18+, no dependencies, no model, no network of its own (a container it starts has none either, unless you allow it). It judges the twelve items of the twelve-element substrate checklist (listed in the [top-level README](../../README.md)) as **present and working** on a git repository and prints, for each item, a status and the raw probe lines. MIT (see `../LICENSE`).

**Canonical copy: this file.** `tools/gs-check/gs-check.mjs` in this repository is the only maintained copy. The default configuration is embedded; `node gs-check.mjs --print-config` prints it and its SHA-256 (the value every report carries as `config_sha256`).

**Status: a prototype.** Tuned on hand-built control projects and on 24 development runs (13 defects fixed, mostly false negatives); the controls are by the checker's author; independent controls and a held-out audit are owed. A green run says the form is there and a planted violation is refused, not that the software is right.

## Use

```
node gs-check.mjs --repo <path> [--allow-network] [--time-limit MIN] [--memory 2g] [--cpus 2] [--run-on-host --i-trust-this-repo] [--strict] [--both] [--verbose] [--migration] [--mutants N] [--only E01,E05] [--since <rev>] [--config <file>] [--out <report.json>] [--keep]
```

- It clones the **committed** state into a temporary folder and never modifies the repository under test. It executes project code (install scripts, hooks, tests), so by default it does that inside a throwaway container (next section).
- `--strict` is **strict enforcement**: only a commit hook or a push hook that refuses a planted violation is credited. A package script that fails (`npm run check`) is **not** credited, because nothing runs it unless a person does. The default mode credits such scripts (it is what the development loop used); `--both` runs both and prints a table with the two columns. A project whose E05 to E07 or E10 depend on a script reads PASS by default and PARTIAL in strict mode (controls `GS2` and `R06`).
- `--verbose` prints every reason and the probe flags of each item (what the verify formula pastes). `--only` pulls in the items the chosen ones depend on (E10 needs E02 and E04). `--since <rev>` limits the commit check (E09) to `rev..HEAD`.
- Exit 0 only if all twelve are PASS; 1 otherwise; 2 on a usage error. Status values: `PASS` present and working, `PARTIAL` present and not (fully) working, `ABSENT`, `UNDETERMINABLE` (an environment fault: network, missing tool, timeout).

## Trust and isolation

gs-check judges whether a project's gates really refuse a bad change, so it has to run them: the README install steps, the git hooks and the tests of the project. On a project you did not write, that is running a stranger's program. So:

- **Default: a throwaway Docker container.** It needs Docker running (Linux containers). The first run builds a small image (Node 22, Python, git; it downloads packages once, so it needs the network that one time). Each run: a fresh clone of the committed state, mounted **read-only**; a **non-root** user; the root file system read-only with only `/tmp` writable (2 GB); **no Linux capabilities** and no privilege gain; **2 GB memory, 2 CPUs, 512 processes, 60 minutes** (`--memory`, `--cpus`, `--time-limit`); **no host environment variables**, no credentials, no mount of your home folder or of anything else; and the container is removed afterwards. The report comes back as text on standard output and gs-check writes `--out` itself on the host, so the container needs no writable mount.
- **Network policy, precisely.** What Docker can enforce is on or off, not "only these servers". The default is **off** (`--network none`). A project whose install step downloads packages then behaves as on a machine without the internet: the install fails and is reported as such (usually `UNDETERMINABLE` or `PARTIAL`); a project that needs no download is unaffected. `--allow-network` gives the container ordinary outbound access (a bridge network): the project's code can then reach the whole internet, although nothing secret is inside the container to send. Allowing only some registries needs a proxy, which this tool does not provide.
- **Python.** In the container a project's virtual environment can see the image's own pytest, because the container is the isolation and may have no network. On the host it sees nothing of the machine.
- **Without Docker it refuses** (exit 2, nothing is run) and says the two ways forward: install Docker, or, for code you wrote or fully trust, add `--run-on-host --i-trust-this-repo`. Both flags are needed; the tool prints a red warning and asks you to type the repository name. With `CI=true` it does not ask. It never runs on the host silently.
- **Already in a container** (`/.dockerenv`, or `GS_CHECK_IN_CONTAINER=1`, which gs-check sets for itself inside its own container): it runs directly, because that is the isolation you asked for.
- **Not covered.** A container is not a virtual machine: a kernel or runtime escape is possible in principle, and Docker Desktop shares a kernel with its VM. `--allow-network` removes the network wall. A hostile project can still use up the CPU and memory limits for the time limit, and it can lie to the checker (a report is only as honest as the code that ran). For really hostile code use a throwaway virtual machine.
- **Library use.** `import { run } from './gs-check.mjs'` does no isolation: the caller chooses (this repository's own tests do, on projects they build themselves). Reports say `isolation: container`, `host-trusted`, `already-in-container` or `library`.

`gs demo` (gs-demo) runs none of the project's code: it reads files and runs `git log` and the tool's own `gs-lock` on a copy, with every git setting that names a program to run switched off (a test plants such a setting and other canaries, and none fires).

## Migration checks (`--migration`)

For a project migrated with the migration method (see https://genspec.dev) (existing code became a recovered spec and a characterization suite, then a greenfield substrate), `--migration` adds nine items after E01 to E12. The exit code is 0 only if all twenty-one are `PASS`. The suite is black-box: it runs the system through `GS_SUT_CMD` from `GS_SUT_ROOT` and never imports its code, so the checker can run the same suite against a checkout of the base commit (the original) and against the current code.

| Item | What it establishes | How |
|---|---|---|
| M01 | manifest `docs/migration/equivalence.json` (base commit, suite command, how to invoke original and current) and a characterization suite of at least 5 tests that does not import the system's source | JSON, `git merge-base --is-ancestor`, static scan of the suite |
| M02 | the suite passes on the **original** (a checkout of the base commit) and **fails on an empty system** | two runs of the suite command with `GS_SUT_ROOT` changed |
| M03 | the suite passes on the migrated code | one run |
| M04 | the suite is an **oracle**: a few comparison operators, booleans, signs and numbers are flipped one at a time (deterministic selection, up to 12 per tree, `--mutants N`), in the original and in the new code; the suite must refuse at least 60 percent | mutation probe; survivors are listed (they are the unpinned behavior) |
| M05 | every characterization test cites a criterion id that the recovered spec defines | static |
| M06 | every criterion (except `N-` ids) is cited by a characterization test, or is deferred | static |
| M07 | the inventory (`docs/migration/inventory.md`, columns element, where in the code, claimed by, decision, reason): every row has `keep`, `drop` or `defer`; a kept row claims criteria that exist and are tested and is not `UNCLAIMED`; a dropped or deferred row has a reason | static |
| M08 | the public surface found in the **original code** by pattern matching (routes, commands, flags, environment variables) appears in the inventory (at least 90 percent): a check that does not depend on the assistant's own list | heuristic; `UNDETERMINABLE` when it recognises nothing |
| M09 | `docs/deferred.md` exists and gives every dropped or deferred element a reason | static |

Limits: M04 samples (12 mutants), so a small suite can pass by luck and a large one can fail by equivalent mutants; M08 is blind to routes built dynamically; none of it sees timing, ordering or side effects outside what the suite observes. Controls `MG1` to `MG13` (`test/migration.test.mjs`) pin each outcome.

## E10 and E11 verified for real

When the project carries the reference tool (`tools/gs-lock/`, see its README), E10 and E11 run the tool itself in the throwaway clone, **and** probe the same behavior through the project's own hooks:

| Probe | What it plants | What must happen |
|---|---|---|
| E10 drift | one sentence written **inside** a tagged heading section of a spec file | `gs-lock check` exits non-zero and names STALE; the same edit, committed, is refused by a commit or push hook |
| E10 twin (control) | a **new spec file** next to it (never inside a locked section) | `check` exits 0 and the commit is accepted: a hook that refuses every spec edit is not a lock |
| E10 ratify | `ratify --all` without a reason, then with one | refused and the lock unchanged; then `check` exits 0 and `docs/ratifications.md` has the line |
| E10 commit-check | the ratified state staged, then staged without the record | accepted, then refused |
| E11 uncited / cited | a source change with `feat:` and no id; the same citing an id; the same staging a doc | refused; accepted; accepted |
| E11 refactor (isolated) | with **only the project's commit-msg hook active**: a `refactor:` that breaks the parent's tests with a test edited in the same commit; and a comment-only `refactor:` | refused; accepted (a failing test gate at pre-commit cannot be the cause) |
| E11 refactor (direct) | the same two changes given straight to `gs-cochange` in the clone | exit 1 naming NOT A REFACTOR; exit 0 (so a proof that cannot run the project's tests is not credited) |

Without the reference tool (an ad hoc lock) E10 falls back to the behavioral drift and twin probes through the hooks; E11 to the commit-msg and refactor probes. A refactor exemption without a proof reads PARTIAL.

## Tests

```
node --test tools/gs-check/test/unit.test.mjs                 # 10 helper tests, seconds
node --test tools/gs-check/test/controls.test.mjs             # the controls (53 tests): about 20 minutes on Windows, 4 minutes in the Linux container
FX1_ONLY=G1,GS1 node --test tools/gs-check/test/controls.test.mjs
node --test tools/gs-check/test/smoke-cli.test.mjs            # the verify formula command on 3 known-good and 8 broken projects (11 tests)
node --test tools/gs-check/test/migration.test.mjs            # the migration checks on a migrated legacy script and 12 broken variants (MG1 to MG13)
```

The controls build a hand-made project from `test/fixtures/` (node `good`, python `good-py`, and `good-gs`, which is `good` wired to the reference lock tool, copied from `tools/gs-lock/` and never stored twice) and variants with one element removed or broken, and compare every item with its declared expectation. A variant with a `strict` key is checked a second time in strict mode. `test/Dockerfile` builds the Linux image used to run them (Node 22, python3 with pytest, git, bash).

## What it cannot see

Server-side CI results, branch protection and required review (a clone cannot show them); `git commit --no-verify`; whether a spec is right or a test is good; whether a derived document is true of the code; anything an agent can fake with a file. See "What this repository cannot show" in the top-level README.
