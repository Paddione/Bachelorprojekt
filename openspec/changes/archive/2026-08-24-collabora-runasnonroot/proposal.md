# Proposal: collabora-runasnonroot

## Why

SA-GR-06 (System-Audit 2026-08-23, T014549) fordert `runAsNonRoot` auf allen
Deployments. Der Zwischenstand bei Plan-Erstellung:

- **sessions-server, llm-gpu, rustdesk hbbs/hbbr** — bereits durch T014553
  (PR #5137, `feat(infra): manifest hardening SA-GR-04/05/06`) gehardened.
- **nextcloud** — verifiziert vollständig gehardened (alle 6 Container
  non-root, einziger Root-Init-Container `fix-data-perms` mit dokumentierter
  Ausnahme `runAsUser: 0` + `allowPrivilegeEscalation: false`).
- **collabora** — letzter offener Posten des gelockten Lastenhefts: Der
  Container hat einen `securityContext` (Capabilities-Bounding-Set,
  AppArmor/Seccomp Unconfined), aber **keine explizite `runAsNonRoot: true`-
  Assertion**, obwohl das Custom-Setcap-Image (`collabora-code:…-setcap`)
  per Design als non-root `cool` läuft (coolwsd verweigert den Start als
  root; File-Capabilities machen die Jails auch non-root funktionsfähig).

Repo-weiter Scan (Deployments ohne pod-level UND ohne container-level
`runAsNonRoot`) fand zusätzlich 7 Deployments außerhalb des gelockten
Lastenhefts (janus, claude-code-mcp-monolith, brett-dev, sish, website-dev,
mentolder-web, website-staging) — diese sind bewusst **out of scope** und
werden als Follow-up-Ticket erfasst.

## What

1. `k3d/office-stack/collabora.yaml`: `runAsNonRoot: true` im Container-
   securityContext ergänzen.
2. Guard-Test in `tests/spec/collabora-integration.bats` (RED-first):
   assertiert `securityContext.runAsNonRoot == true` am collabora-Container.
3. Delta-Spec: MODIFIED Requirement „Custom Setcap Image" im SSOT
   `openspec/specs/collabora-integration.md`.

**Explizite Ausnahme:** `allowPrivilegeEscalation: false` wird bewusst NICHT
gesetzt — das Setcap-Design benötigt effektive File-Capabilities beim exec
(SETUID/SETGID für uid_map/gid_map nach dem User-Namespace-Unshare von
forkit); `no_new_privs` würde die Per-Document-Jails brechen. Das entspricht
der Ticket-Klausel „wo die Images es erlauben".

_Ticket: T014549_
