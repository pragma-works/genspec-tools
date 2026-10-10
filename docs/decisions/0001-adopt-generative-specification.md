# ADR 0001: run this project with Generative Specification, level L1

## Status

Accepted by JC, who said so in chat on 2026-10-09. The assistant recorded it at his instruction as agent-recorded entry D-0001 in docs/decisions.log.md, which the log itself flags as needing a person to confirm. JC can countersign by adding his own entry or by changing this paragraph in a commit he makes himself.

## Date

2026-10-09

## Context

An assistant writes code in this project. What was asked for, why, and what is off limits has to live in files the assistant reads and a program checks, not in a chat.

## Decision

Use the Generative Specification substrate at level L1: a sentinel that routes to the spec, decision records and open questions; ids on requirements and criteria; git hooks that refuse a bad commit, a ratchet floor that only goes up.

## Consequences

The spec is edited before the code. A commit that breaks a gate is refused until the cause is fixed; `--no-verify` skips the local hooks, so the shared branch needs the same checks in CI.
