# Proposal: t001360-dep02-major-deps

## Why

Major-dependency updates (semver major jumps) carry breaking changes and require careful sequencing. Two of the three G-DEP02 update slots are already occupied; this plan covers the remaining work.

## What

Audit all outdated major-level dependencies, define a conflict-free update order, and execute the upgrades with per-step test validation.

_Ticket: T001360_
