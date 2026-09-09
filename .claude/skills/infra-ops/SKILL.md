---
name: infra-ops
description: 'Explicit-invoke-only infrastructure runbook — DO NOT auto-trigger. Use when the user explicitly asks for: cluster setup or reset, workspace deploy (task workspace:setup/deploy/post-setup), host node networking (Hetzner, WireGuard wg-fleet, UFW), Pocket ID / SSO / OIDC client seeding, LLM pipeline and GPU host (task llm:*), secret and SealedSecret rotation (task env:seal, env:fetch-cert), or database migrations and backup/restore (task recovery:*).'
---

# This skill's canonical implementation lives at: .opencode/skills/infra-ops/SKILL.md
