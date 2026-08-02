---
title: Plan-Ref Lifecycle Fixes
ticket_id: T002044
status: planning
---

# plan-ref-lifecycle-fixes — Proposal

## Purpose

Fix three bugs in the plan_ref lifecycle that cause silent failures, stale references, and mid-flow validation errors.

## Problem

1. **dev-flow-execute trusts FACTORY-PLAN-REF without verifying the file exists** — if dev-flow-plan never ran or the file was deleted, execute silently fails.
2. **stage-plan.sh is a silent no-op when a stale FACTORY-PLAN-REF comment exists** — the NOT EXISTS guard prevents updating a broken plan_ref.
3. **dev-flow-execute/plan omits the specs/ delta dir from the plan template** — causing `task test:openspec` to fail mid-flow.

## Requirements

### REQ-1: Plan-ref pre-flight validation
dev-flow-execute must verify the referenced plan file exists in git before proceeding.

### REQ-2: Superseding FACTORY-PLAN-REF pattern
stage-plan.sh must always insert a new FACTORY-PLAN-REF comment (superseding any previous one) instead of silently skipping when one already exists.

### REQ-3: Specs delta dir documentation
Document the mandatory `openspec/changes/<slug>/specs/*.md` and `.ticket` file as part of the plan-staging step.

## Scenarios

### Scenario: Execute with missing plan file
GIVEN a ticket with FACTORY-PLAN-REF pointing to a nonexistent file
WHEN dev-flow-execute runs
THEN it should fail with a clear error message indicating the plan file is missing

### Scenario: Re-stage with existing FACTORY-PLAN-REF
 GIVEN a ticket with an existing stale FACTORY-PLAN-REF comment
WHEN ticket.sh stage-plan is run with a new plan
THEN it should INSERT a new FACTORY-PLAN-REF comment (most recent wins)
AND the old comment remains in history for audit
