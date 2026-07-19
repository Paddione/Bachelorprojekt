# secrets-drift — Delta-Spec

## Purpose

Re-seal workspace-secrets with correct prod DB passwords and sync DB passwords.
No spec changes — infrastructure-only operation on existing secrets pipeline.

## ADDED Requirements

### Requirement: SECRET-DRIFT-001 — Prod secrets contain real credentials

After execution, all `environments/.secrets/*.yaml` prod files contain
real database passwords instead of dev placeholders. SealedSecrets are
re-sealed with the corrected plaintext values.
