# Proposal: exclude-latest-images

## Why

To prevent non-deterministic behavior during deployments, we need to ensure that `:latest` images are excluded from all deployment lists and instructions. Using `:latest` tags can lead to inconsistent environments because the underlying image can change without notice.

## What Changes

- Update `CLAUDE.md` to explicitly exclude `:latest` images from all deployment-related lists and instructions.
- Standardize deployment instructions to favor specific version tags or digests.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- None

## Impact

Affected documentation (`CLAUDE.md`) and deployment workflows.
