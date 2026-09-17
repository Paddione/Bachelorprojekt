---
ticket_id: T900115
plan_ref: openspec/changes/devmesh-grand-consolidation/tasks.md
status: active
date: 2026-09-17
---

# Design: devmesh-grand-consolidation

_Ticket: T900115 · Ziel-SSOT: `openspec/specs/local-dev-mesh.md` (MODIFIED) · wiederverwendet, nicht neu geplant: `openspec/changes/rbac-exec-least-privilege/` (T900110, gemergt #5537)_

## Kontext

Prior-Art (alle auf `main`, verifiziert per `git log --grep` + Guard-Läufen):

| Ticket | Stand | Beleg |
|---|---|---|
| T900110 RBAC | gemergt #5537, Guards GREEN | `workload-exec-rbac.bats` 10/10, `cluster-admin-audit.bats` 4/4, `tick-http-wakeup.bats` ok |
| T900116 SP-1 | gemergt #5563, Guards GREEN | `tailnet-policy.bats` + `tailnet-check.bats` 12/12 |
| T900119 SP-4 | gemergt #5578, Change archiviert #5580, Guards GREEN | `dev-machine-onboarding/*.bats` 13/13 |
| T900142/T900144 | Ausführungs-Tickets für SP-1/SP-4 (geschlossen) | Commits 538228ae9, 181b3e6bd |
| T900181/T900113/T900120 | keine Commits — echt offen | `git log --grep` leer |

## Entscheidungen

1. **Ein Change, drei Partials.** Disjunkte `target_files` (P1: `scripts/devmesh/longhorn-*` +
   `longhorn-storage.bats`; P2: `docker/dev-shell/Dockerfile` + git-crypt-Runbook/Keys +
   `git-crypt-gpg.bats`; P3: k3d-Switch + Ausführung). Keine zwei Partials fassen
   dieselbe Datei an.
2. **T900110 wird wiederverwendet, nicht neu geplant.** Der Change
   `rbac-exec-least-privilege` bleibt wo er ist; dieser Change referenziert ihn nur
   als erfüllte Vorbedingung für P2 (Threat-Modell aus T900113: entsperrter Clone
   unter `/home/dev` wäre sonst für die Website-Identität lesbar — seit #5537
   geschlossen).
3. **Longhorn startet mit drei Knoten.** T900180 (gpu-cluster-3-Join, blockiert durch
   NOPASSWD-sudo) ist kein Gate: RF=3 ist mit gpu-metal/gpu-cluster/gpu-cluster2
   erfüllt; der vierte Knoten ist dokumentierter Follow-up.
4. **Kapazität wird gemessen, nicht geschätzt.** Roh ca. 2,9 TB; nutzbar hängt von der
   Replika-Verteilung ab (Ticket T900181) — Zahl gehört in den P1-Abschlussbericht,
   nicht in den Plan.
5. **P3 läuft zuletzt.** Erst wenn P1-Storage und P2-Clone-Verfahren GREEN sind und
   `acceptance.sh` auf devmesh besteht, wird `k3d-mentolder-dev` abgebaut. Kein
   Point of no Return vor grüner Abnahme.
6. **Bestehende Guards werden nicht umgeschrieben.** P0 führt sie nur aus; schlägt ein
   GREEN-Guard fehl, wird das Partial blockiert statt der Guard angepasst.

## Reihenfolge

P0 (Gate, dateilos) → P1 + P2 (parallel, disjunkte Files) → P3 (nach P1/P2-Abnahme).
P2 darf erst nach bestandenem P0-RBAC-Re-Check starten.
