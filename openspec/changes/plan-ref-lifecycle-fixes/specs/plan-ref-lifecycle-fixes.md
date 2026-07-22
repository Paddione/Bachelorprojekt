## ADDED Requirements

### Requirement: Plan-ref pre-flight validation
dev-flow-execute MUST verify the FACTORY-PLAN-REF referenced file exists in git history before proceeding with execution.

#### Scenario: Missing plan file detected
- GIVEN a ticket with FACTORY-PLAN-REF pointing to a nonexistent file
- WHEN dev-flow-execute runs
- THEN it should exit with error code 1 and a message indicating the plan file is missing

### Requirement: Superseding FACTORY-PLAN-REF pattern
stage-plan.sh MUST always INSERT a new FACTORY-PLAN-REF comment, superseding any previous one.

#### Scenario: Re-staging overwrites previous ref
- GIVEN a ticket with an existing FACTORY-PLAN-REF comment
- WHEN ticket.sh stage-plan is run with a new plan path
- THEN a new FACTORY-PLAN-REF comment is inserted
- AND the old comment remains in history

### Requirement: Specs delta dir in plan template
The dev-flow-execute plan template MUST document the mandatory `openspec/changes/<slug>/specs/*.md` and `.ticket` files.
