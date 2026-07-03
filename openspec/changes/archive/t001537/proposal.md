# Proposal: t001537 — Rotate secrets after accidental transcript exposure

## Why

After an accidental transcript exposure (e.g., LLM conversation containing sensitive data), all secrets used in that session must be rotated immediately to prevent potential security breaches. The current system lacks automatic secret rotation triggered by such events.

## What

Implement a secret rotation mechanism that:
1. Detects when transcripts have been exposed or are about to be stored
2. Automatically regenerates all environment-specific secrets for affected environments
3. Re-seals the rotated secrets using existing infrastructure (env-generate.sh, env-seal.sh)
4. Updates Kubernetes SealedSecret resources via the existing deploy pipeline

**Ticket: T001537**
