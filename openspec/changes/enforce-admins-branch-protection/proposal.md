# Proposal: enforce-admins-branch-protection

## Why

The live `main` protection policy currently reports `enforce_admins.enabled=false`, so
administrators can bypass required checks and the review gate with a direct push. The audit
script identifies this state, but the apply script preserves it instead of repairing it.

## What

Make the idempotent protection payload explicitly enable administrator enforcement, add a
regression assertion for that payload contract, and apply the corrected policy to GitHub after
the implementation is merged. Keep existing status-check and approval behavior unchanged.

_Ticket: T900126_
