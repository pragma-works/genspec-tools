# ADR 0001: run this project with Generative Specification, level L1

## Status

Proposed. Written by gs-init. The person who owns the project accepts it by changing this line to Accepted in a commit under their own name.

## Date

2026-10-09

## Context

An assistant writes code in this project. What was asked for, why, and what is off limits has to live in files the assistant reads and a program checks, not in a chat.

## Decision

Use the Generative Specification substrate at level L1: a sentinel that routes to the spec, decision records and open questions; ids on requirements and criteria; git hooks that refuse a bad commit, a ratchet floor that only goes up.

## Consequences

The spec is edited before the code. A commit that breaks a gate is refused until the cause is fixed; `--no-verify` skips the local hooks, so the shared branch needs the same checks in CI.
