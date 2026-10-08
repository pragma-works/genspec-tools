# gs-decide: the decisions log and its hook

Two files, Node 18+, no dependencies, no model, no network, MIT (see `../LICENSE`). Copy them into a project **unchanged**, side by side (`tools/gs-decide/`): `gs-decide-hook.mjs` imports `gs-decide.mjs`. It sits beside `gs-check` and `gs-lock` and reads gs-lock's record; it never duplicates it.

**Status: tested only by its own suites (38 + 19 tests, below); not yet used in a registered run on a model-written project.** It is the first implementation of the "ratification log with a required-marker hook" of the method described at https://genspec.dev.

## This is a tool, not a prompt

gs-decide is a **record plus a hook**: a file the program appends to and a script that refuses a commit. It is not an instruction to an assistant. The assistant may **propose** a decision (an instruction to the assistant can tell it to list what needs a decision and stop), but it never ratifies. The **named committer takes the responsibility**: the person runs `gs-decide add` under their own git identity, and the entry then carries their name, role, reason, scope and expiry. That is the whole mechanism: a named identity on the record, and a gate that refuses to move without it.

## What it records

Any human sign-off, not only spec changes: a spec section, a gate/hook/CI/linter change, a ratchet floor change, a waiver of a failing check, an accepted risk, a plain decision. One entry in `docs/decisions.log.md` (LF, append only, chained by hash):

```
## D-0003
when: 2026-10-08T10:00:00Z
who: Maria Ratifier <maria@example.com>      the git identity at the time
role: tech lead
via: human                                    agent-suspected when an agent environment variable is set or --agent is passed
kind: waiver                                  spec gate hook ci linter ratchet waiver risk decision baseline other
ref: docs/ratchet.json
covers: docs/ratchet.json
approves: 3fa0...64 hex...  docs/ratchet.json    the sha256 of the content approved (LF normalised), or "deleted"
scope: all services
why: floor waived while the vendor fixes the flaky suite
expires: 2026-11-01                           required for waiver and risk
prev: <hash of the previous entry>
entry: <hash of this entry>
```

## Commands

```
node tools/gs-decide/gs-decide.mjs add --kind <k> --role <r> --why "<15+ chars>" [--ref <what>] [--covers <path|dir/|glob>]... [--covers-protected]
                                       [--scope <s>] [--expires YYYY-MM-DD] [--closes D-0003] [--commit <rev>] [--agent]
node tools/gs-decide/gs-decide.mjs list [--json] [--open] [--all] [--last N]     --all adds gs-lock's docs/ratifications.md, read only
node tools/gs-decide/gs-decide.mjs verify [--json] [--require-ratified] [--against <rev>]
node tools/gs-decide/gs-decide.mjs protected [--json]
node tools/gs-decide/gs-decide.mjs export --format chronicle-jsonl [--out <file>] [--with-extras]       DRAFT, see the last section
node tools/gs-decide/gs-decide-hook.mjs --msg-file <file> | --commit <rev> | --range <base>..<head> | --pre-push
```

- `add` records what is **approved now**: each `--covers` file is hashed as it is in the working tree. A waiver and a risk need `--expires` (at most 365 days) and a waiver needs an anchor (`--covers` or `--commit`). `--closes D-0003` ends a waiver or risk; a renewal is a new waiver that closes the old one. `--kind baseline --covers-protected` adopts the current state of every protected file when you start using the tool.
- `verify` exits 1 on `MALFORMED`, `CHAIN-BROKEN` (an entry edited, removed or reordered), `HISTORY-REWRITTEN` (the log no longer starts with its committed content: this is how a forged tail is caught, the chain alone cannot see it), `EXPIRED` (an open waiver or risk past its date), `WAIVER-NO-CHANGE` (the content or commit a waiver names exists in no commit and no file: it waives nothing), `RATIFICATIONS-EDITED` (gs-lock's record was not append only). Warnings: `AGENT-ENTRY`, `EXPIRING-SOON`, `EXPIRED-APPROVAL`, and `UNRATIFIED` (a protected file whose current content no valid entry approves; it fails with `--require-ratified`).

### The hook

It refuses a commit that touches a **protected path** unless the log, in the same commit or an earlier one, holds a valid entry that approves **that path with the content being committed**. Protected (see `protected`): the spec cascade root (sentinel files, spec files and folders, `docs/spec.lock`), gate/hook/CI/linter configuration and these tools, the ratchet floor file (the name rule of `gs-check` E06), the waiver list, and what `.gs.json` `decide.protect` adds. It also refuses: an edit or removal of an earlier log line, a new entry signed by an identity other than the committer's, a `Waiver:` line in the message (gs-cochange) with no waiver entry in the commit, and an AI-co-authored commit whose only approval is not a human entry. `docs/spec.lock` is also satisfied by a new line in gs-lock's `docs/ratifications.md`, or by additions only (`gs-lock init`), unless the commit has an AI co-author.

```sh
# .githooks/commit-msg  (committed executable)        # and .githooks/pre-push
node tools/gs-decide/gs-decide-hook.mjs --msg-file "$1"      node tools/gs-decide/gs-decide-hook.mjs --pre-push
# CI on the shared branch (fetch-depth: 0):  node tools/gs-decide/gs-decide-hook.mjs --range origin/main..HEAD   and   node tools/gs-decide/gs-decide.mjs verify
```

`--range` judges each commit with the log **as of that commit**, so an entry added later does not excuse an earlier commit.

### Optional roles

Without a policy file any named human identity may ratify. With `docs/decision-roles.json` (itself a protected path):

```json
{ "classes":    { "spec": ["product owner"], "gate": ["tech lead"], "ratchet": ["tech lead", "security"], "waiver": ["tech lead", "security"], "security": ["security"] },
  "paths":      { "security": ["src/auth/**"] },
  "identities": { "maria@example.com": ["product owner"], "bob@example.com": ["tech lead"] } }
```

the hook accepts an entry for a class only if the entry's role is allowed for that class **and** the signer's identity holds that role in `identities`; `add` refuses a role the identity does not hold (and uses the only role it holds as the default). `paths` adds protected paths under a class of your choosing. CODEOWNERS is not read (a possible later step). This is a policy over identities as the log records them; it authenticates nobody.

## What it cannot prove

- **That a human acted.** It proves that a *named git identity recorded a reason*. `git config user.name` is whatever the shell says; an agent that runs `add` under a person's identity writes a valid entry. Flags only: `via: agent-suspected` (an agent environment variable present), an AI co-author trailer, an AI-pattern name. A determined agent can lie.
- **That the decision was wise, or that the reviewer read the diff.** A ratification is a record of responsibility, not of understanding.
- **Anything after `git commit --no-verify`** locally. The `--range` check in CI on a protected branch (with CODEOWNERS on the log and the protected paths) is the enforcement; a clone cannot show server settings.
- **A forged tail on its own.** The chain detects an edit of any entry but the last one can be rewritten and rehashed; the committed copy (`HISTORY-REWRITTEN`), CI, and the chain head kept in each snapshot (`gs-snapshot`) are what catch it.
- **Paths not on the list.** A rename of the tools, a gate configured in `package.json` scripts, or a protected file under another name is invisible; extend `decide.protect`.
- **Concurrent branches.** Two branches that each append an entry fork the chain; the second to merge re-adds its entry (no union merge is configured, on purpose).

## Signed ratifications and their limits

Optional, off by default. The base mechanism proves that a *named git identity* recorded a reason. Signing adds **custody of a key**.

**Setup.** Each person makes an SSH key (`ssh-keygen -t ed25519`; a passphrase or a hardware key is better) and puts the **public** key in `docs/decision-roles.json` (a protected path) next to their role. A key listed under a role-`agent` identity belongs to an assistant.

```json
{ "identities": { "maria@example.com": ["tech lead"], "claude-agent@example.com": ["agent"] },
  "keys":       { "maria@example.com": ["ssh-ed25519 AAAA...maria"], "claude-agent@example.com": ["ssh-ed25519 AAAA...agent"] } }
```

and in `.gs.json`: `{ "decide": { "requireSigned": true, "requireSignedCommits": false } }`.

- `add --key ~/.ssh/id_ed25519 ...` (or `GS_DECIDE_KEY`, or `decide.signingKey`) signs the entry hash with `ssh-keygen -Y sign -n gs-decide` and appends `sigkey:` (fingerprint) and `sig:` (the armored signature on one base64 line) after the `entry:` line. The signature covers the whole entry, including `prev`, so it also pins the chain position.
- `verify` checks each signature with `ssh-keygen -Y verify` against the keys listed for the entry's e-mail: `BAD-SIGNATURE` (fails: edited entry, another key, no key listed), `UNSIGNED` (warning; fails with `--require-signed`), `AGENT-KEY` (warning).
- With `requireSigned`, the **hook** accepts a protected-path change only if a valid entry for that content is **signed, verifies, and its signer does not hold the role `agent`**. An entry made by an agent key, or unsigned, is a **note** and never ratifies. `verify --require-ratified` applies the same rule to the working tree.
- With `requireSignedCommits`, a commit that touches a protected path (judged by `--commit`, `--range`, `--pre-push`; not by the staged mode, the commit does not exist yet) must carry a good SSH signature by **git's own check** (`gpg.format=ssh`, with an allowed-signers file built from the same `keys`; needs git 2.34+) that is not an agent key.

**What a signature does not prove.**
- It proves custody of a private key, **not that a human intended the decision**. An agent running in a session where the person's key is unlocked (loaded in `ssh-agent`, or without a passphrase) can sign as that person. The kernel's rule that a person is accountable is a social rule; no tool replaces it.
- A key that needs a physical touch (a FIDO2 security key, `ed25519-sk`) raises the bar, since an agent cannot touch the device. Whether the touch requirement survives your workflow (agent forwarding, caching, a non-interactive signing helper) is **to be verified in practice**; it is not tested here.
- A local hook is skipped by `git commit --no-verify`. The same checks run server-side with `gs-decide-ci.mjs` (below); the repository must make that check required.
- The roles file lives in the repository: whoever can merge a change to it can add a key. It is a protected path (it needs a ratification entry), so the protection is only as strong as who may ratify the first time and the branch rules.
- Lost or leaked key: remove it from `keys` (a ratified change); old entries stay as records, and entries signed by a removed key will show `BAD-SIGNATURE` on `verify`, so close the gap by re-ratifying the protected files with a current key.

## Marking agent-made commits: `gs-attribution-hook.mjs`

Off by default; `.gs.json` `{ "attribution": { "enabled": true } }` turns it on (optional: `agents: [emails]`, `aiPattern`, `detectEnv: false`). It borrows the forms of the Linux kernel's `Documentation/process/coding-assistants.rst` (`Assisted-by: AGENT_NAME:MODEL_VERSION [TOOLS]`; an AI agent never adds `Signed-off-by`; a person is accountable) and of Claude Code's `Co-Authored-By` trailer. Apache and Fedora are reported to follow similar rules; that was seen only in search summaries and is not checked here.

| Rule | What it refuses |
|---|---|
| A1 | a `Signed-off-by:` whose identity is an agent (role `agent` in the roles file, `attribution.agents`, or an AI-looking name) |
| A2 | an `Assisted-by:` that does not read `AGENT:MODEL [TOOLS]`; an AI `Co-Authored-By:` that does not read `Name <email>` |
| A3 | a commit whose author or committer is an agent identity and has no marking |
| A4 | (commit-msg only, a heuristic) an agent environment variable is set (`CLAUDECODE` and the like) and the message has no marking |
| A5 | a marked commit that touches a protected path with no verified human ratification (gs-decide-hook's check, including signatures) |

```sh
# .githooks/commit-msg:  node tools/gs-decide/gs-decide-hook.mjs --msg-file "$1" && node tools/gs-decide/gs-attribution-hook.mjs --msg-file "$1"
# .githooks/pre-push:    node tools/gs-decide/gs-attribution-hook.mjs --pre-push      (reads git's stdin)
```

**Cannot be detected, said plainly:** an agent session that writes no marking, under a person's identity, with no agent environment variable, produces a commit that looks exactly like the person's. Nothing in a commit says who typed it. The hook catches the honest and the careless; the marking is a practice, and the guarantee that matters (a protected change needs a person's ratification) does not depend on it.

## CI: the server-side re-check

```
node tools/gs-decide/gs-decide-ci.mjs --base origin/main [--require-signed]
```

runs `verify --require-ratified`, `gs-decide-hook --range <base>..HEAD` and `gs-attribution-hook --range <base>..HEAD`, and exits 1 if any fails. A GitHub Actions job needs `actions/checkout` with `fetch-depth: 0`, then that command; make the job a **required status check** in the branch protection or ruleset of the shared branch. GitHub's branch protection also has a setting named **"Require signed commits"** (documented as: contributors and bots can only push commits that have been signed and verified); it works on GitHub's own notion of verified, so it complements the allowed-signers check here and does not replace the role mapping. Protect `.github/workflows/**` and `docs/decision-roles.json` with CODEOWNERS and required review: a contributor who can edit the pipeline on the branch can weaken it in the same change.

## Optional export

`export --format chronicle-jsonl [--out <file>] [--with-extras]` writes the entries as JSON lines in a draft event shape for an external append-only ledger. It is a **draft mapping**: the entry kinds map onto a ledger's event kinds where one exists (approved path changes, deviations), the fields with no equivalent (role, scope, expiry, the entry's own chain) are not exported unless `--with-extras` is given, and entries with no file (decision, other) are counted on stderr and left out. gs-decide works without it; the record is the repository file.

## Tests

```
node --test tools/gs-decide/test/decide.test.mjs tools/gs-decide/test/signed.test.mjs   # 38 + 19 tests, about 35 s on Windows
```

`T1` to `T38` run on throwaway git repositories without a model: the entry hash as a pinned vector, tamper detection (an edited entry, an edited and rehashed entry, a removed entry, a rewritten tail), CRLF and BOM, expired and unanchored waivers, the protected classes, the hook through its staged, commit, range and pre-push modes and through git's own commit-msg hook (with `--no-verify` caught by `--range`), the AI co-author rules, interoperation with a real gs-lock `ratify`, the roles policy, and the export. `test/vendor/` holds copies of gs-lock used only when `tools/gs-lock/` is not next to this tool; one test compares the protected lists with `gs-check`'s defaults when it is found (`GS_CHECK_JS=<path>` or side by side) and is skipped otherwise.

`test/signed.test.mjs` (19 tests, `S1` to `S11`, `A0` to `A7`) makes real `ssh-keygen` keys in temp directories: a signed entry verifies, an edited or rehashed one does not, a key the policy does not list for that person fails, an agent-key entry never ratifies, the hook refuses and accepts on a throwaway repository, a commit signed by git's own mechanism is checked, and each attribution rule has a red and a green case, plus one test that states the undetectable case (an unmarked agent session). It is skipped with a message when `ssh-keygen` or git 2.34 is absent. Windows 11 (Git for Windows 2.54, Node 24) and a Linux container (`node:22`, OpenSSH 9.2, git 2.39): 57 tests, 56 pass, 0 fail, 1 skipped (the gs-check comparison, which needs gs-check next to the tool) on both.
