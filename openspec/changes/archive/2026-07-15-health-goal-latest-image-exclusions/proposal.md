# Proposal: health-goal-latest-image-exclusions

## Why
To prevent non-deterministic behavior during deployments, we must ensure that images intentionally using the `:latest` tag are explicitly excluded from general "pinning" requirements. Currently, the exclusion list in `CLAUDE.md` is incomplete, which can lead to AI agents attempting to pin images that are designed to be rebuilt and re-imported on every release.

## What
Update `CLAUDE.md` to include the following components in the list of intentionally `:latest` images:
- Website
- Brett
- Docs
- Videovault
- Mediaviewer-Widget
- Mentolder-Web
- Downloads

This ensures that the Infrastructure and Dev workflows correctly identify these as "live" targets that do not require manual digest pinning.

_Ticket: T001775_
