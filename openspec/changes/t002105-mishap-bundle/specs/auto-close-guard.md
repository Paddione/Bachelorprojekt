# auto-close-guard Specification Delta

## MODIFIED Requirements

### Requirement: Multi-partial Auto-Close Guard
The software factory auto-close hook MUST NOT auto-close a ticket on PR merge if the staged OpenSpec plan has remaining incomplete partial tasks.

#### Scenario: Auto-close blocked on incomplete partial plan
- GIVEN a ticket T002105 with a staged multi-partial plan
- WHEN a PR merges covering only partial p1
- THEN the auto-close hook MUST skip auto-closing ticket T002105 as done.
