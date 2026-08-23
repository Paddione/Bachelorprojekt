---
ticket_id: null
plan_ref: null
status: active
date: 2026-08-23
---

# Design: collabora-runasnonroot

_Ticket: T014549 · SA-GR-06 Rest-Scope_

## Entscheidungen

| # | Frage | Entscheidung | Begründung |
|---|-------|--------------|------------|
| D1 | Scope: nur collabora oder alle 8 gefundenen Deployments? | **Nur collabora** | Lastenheft-Lock (`requirements_list`) nennt genau 5 Ziele; 4 sind durch T014553/Bestand erledigt. Erweiterung würde den Lock verletzen. Die 7 weiteren Deployments → Follow-up-Ticket. |
| D2 | `allowPrivilegeEscalation: false` mitsetzen? | **Nein, dokumentierte Ausnahme** | Setcap-Design: forkit braucht effektive SETUID/SETGID-File-Caps beim exec für uid_map/gid_map; `no_new_privs` bricht die Per-Document-Jails. Ticket-Klausel „wo die Images es erlauben". |
| D3 | Nur Assertion oder auch `runAsUser` pinnen? | **Nur `runAsNonRoot: true`** | Image definiert USER bereits non-root (`cool`); UID-Pin würde bei Image-Änderungen brechen. Assertion ist das Sicherheitsversprechen. |
| D4 | Test-Placement | `tests/spec/collabora-integration.bats` (flache Datei, bestehende Konvention) | SSOT-Mapping des Spec-Slugs; Datei existiert als Stub. |
| D5 | Plan-Form | **Single-Partial** (kein `tasks.d/`) | 2 Dateien, Red-Green ehrlich innerhalb eines Executors; STRUCT-PARTIAL greift nicht ohne tasks.d/. |
| D6 | Rollout-Verifikation | `task workspace:validate` (Kustomize dry-run) + BATS | Live-Rollout gehört in dev-flow-execute/Post-Merge, nicht in den Plan-Verify. |

## Befund-Evidenz

- PR #5137 [T014553] hardenete sessions-server, llm-gpu, hbbs, hbbr (git log).
- nextcloud.yaml: alle Container `runAsNonRoot: true` + `runAsUser: 33`;
  einziger Root-Container ist Init `fix-data-perms` (chown-Pflicht, APE:false).
- collabora.yaml:40-58 — Kommentar dokumentiert Non-root-by-Design
  („coolwsd refuses to start as root").
- Repo-Scan 2026-08-23: 8 Deployments ohne runAsNonRoot (davon 7 out of scope).
