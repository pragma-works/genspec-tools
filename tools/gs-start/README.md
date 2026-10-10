# gs-start: the hand-off to your own assistant

One file, `gs-start.mjs`. Node 18+, no dependencies, no model, no network. It is what `gs start` calls after the quick look and the L0 setup. MIT (see `../../LICENSE`).

```
node tools/gs-start/gs-start.mjs [--root <dir>] [--dry-run] [--json]     write .gs/inventory.json, .gs/inventory.md, .gs/start-prompt.md
node tools/gs-start/gs-start.mjs --verify-spec [--root <dir>]            do the FOUND IN CODE tags of docs/spec name a file and a line that exist?
node tools/gs-start/gs-start.mjs --clis                                  which of claude, copilot, codex, gemini are on the PATH
```

The usual way in is `gs start` (see the top-level README, section "gs start").

## What is deterministic and what is not

| Step | Who | Deterministic |
|---|---|---|
| walk the files (no symbolic links, no secret-looking files, no dependency or build folders), read manifests, count languages and tests, find entry points, find routes and command names by pattern, read the git history (read-only, with every git setting that names a program switched off) | this file | yes: the same state gives the same bytes; nothing of the project is run |
| decide the mode: greenfield (no code), brownfield (code, no real spec), continue (a draft spec), sync (a complete spec), documents (mostly not code) | this file | yes |
| write the prompt | this file | yes |
| read the code for intent, draft the spec, ask the questions | the person's assistant, started by the person | no |
| ratify | the person | not delegable |

The inventory is heuristic where it says so: a route or command found by pattern is a lead; a route not found is not proof that it does not exist. For a folder that is mostly not code (under 5 percent source files, or none, with more than three files) nothing is written by `gs start`, and the note is "this is mostly not code, it needs a different profile".

## The assistant commands, and where each flag was read

`gs start` prints, for each assistant CLI it finds on the PATH (a file lookup; nothing is executed), the command that hands it the prompt. Each flag was read from that CLI's own `--help` on 2026-10-09; a CLI not in this table gets the generic instruction ("open your assistant in this folder and say: follow .gs/start-prompt.md").

| CLI | Command | Read from |
|---|---|---|
| Claude Code 2.1.293 | `claude "<prompt>"` | `claude --help` on this machine: `Usage: claude [options] [command] [prompt]`, "starts an interactive session by default, use -p/--print for non-interactive output" |
| GitHub Copilot CLI 1.0.95 | `copilot -i "<prompt>"` | `copilot --help` in a `node:22` container: `-i, --interactive <prompt>  Start interactive mode and automatically execute this prompt` |
| Codex CLI 0.162.1 | `codex "<prompt>"` | `codex --help` in the same container: `Usage: codex [OPTIONS] [PROMPT]`, "Optional user prompt to start the session" |
| Gemini CLI 0.63.0 | `gemini -i "<prompt>"` | `gemini --help` in the same container: `-i, --prompt-interactive  Execute the provided prompt and continue in interactive mode` |

Not verified: that each CLI then reads the whole prompt file and follows it (that is the model's behaviour, not a flag); the behaviour of these CLIs on versions other than the four above; and that Copilot CLI reads `AGENTS.md` (it is only known to read `.github/copilot-instructions.md`, which `copilot init --help` names).

## Instruction files

| `--assistant` | Writes | Evidence for the name |
|---|---|---|
| `claude` | `CLAUDE.md` | Claude Code's own convention |
| `codex`, `agents` | `AGENTS.md` | the string is inside the Codex binary |
| `gemini` | `GEMINI.md` | the string is inside the Gemini CLI package (`AGENTS.md` is not) |
| `copilot` | `.github/copilot-instructions.md` | `copilot init --help` |
| `cursor` | `.cursor/rules/gs.mdc` (plus `AGENTS.md` as the sentinel) | Cursor's rules folder |
| `none` | only the neutral `AGENTS.md` | no assistant-specific file |

## What it cannot do

- It cannot make the proposal right. The assistant writes it; its quality depends on the model, and one run is not a rate.
- A `FOUND IN CODE` tag is a claim. `--verify-spec` checks that the file exists and the line is inside it; it does not check that the code does what the sentence says. That is for the person who ratifies, and for the tests that `gs check` looks for.
- It cannot stop an assistant that ignores the prompt from ratifying something; the prompt forbids it, and `gs-decide` does not count an entry made under an agent-suspected identity as approval. A person still reads what is committed.
