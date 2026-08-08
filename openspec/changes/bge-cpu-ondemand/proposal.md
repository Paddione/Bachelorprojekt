# Proposal: bge-cpu-ondemand

## Why

The two bge-CPU loadouts share an `exclusiveGroup` that serializes them without a VRAM reason, and selectorless cluster Services in `workspace-korczewski` point at shut-down Windows processes.

## What

Remove the group, fix the guard anchor, delete the Flux orphans, document the gotcha.

_Ticket: T002729_
