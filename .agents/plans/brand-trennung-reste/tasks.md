---
title: "brand-trennung-reste — mentolder-Restdateien (Secrets/Certs/Sealed/k3d) entfernen"
domains: [infra]
status: staged
goal: brand-trennung
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [brand-trennung]
---

# brand-trennung-reste — Implementation Plan

Zweck: Goal `brand-trennung`, Nächster Schritt 4 („Reste entfernen"). Der Haupt-Plan
`brand-trennung` (p5/p8) löscht Manifeste und `environments/{fleet-,}mentolder.yaml`.
Dieser Plan deckt nur die Reste ab, die dort bewusst ausgeklammert sind.

Hintergrund: Der Fleet-Cluster existiert nicht mehr (Eigner-Entscheidung: PARKEN).
Es gibt also keinen Flux-Prune und keine Cluster-Wirkung durch das Löschen im Repo.

## Entscheidungen des Eigners (VOR Task 2, sonst STOPP)

| ID | Frage | Quelle |
|---|---|---|
| E1 | `environments/sealed-secrets/fleet-mentolder.yaml` (123 Keys): löschen? Inventar sagt „BLEIBT (Daten-Grenze)". | `docs/agent-guide/brand-separation-inventory.md:81,153` |
| E2 | `k3d/mentolder-web.yaml` + Eintrag in `k3d/kustomization.yaml`: löschen? Inventar sagt „BLEIBT (Lokal-/Alt-Stack)". | Inventar `:154` |
| E3 | Git-crypt-Datei `environments/.secrets/fleet-mentolder.yaml` aus Git entfernen: Werte sind mentolder-eigen. Vorher Sicherung/Übergabe an mentolder? | `.gitattributes` (`filter=git-crypt`) |

Ohne E1 bis E3 wird nichts gelöscht (Daten-Grenze aus Haupt-Plan p5 bleibt bindend).

## File Structure

| Datei | Aktion | Gate |
|---|---|---|
| `environments/.secrets/fleet-mentolder.yaml` | LÖSCHEN | E3, `git-crypt status` = entschlüsselt (nur zum Prüfen, nie lesen/ausgeben) |
| `environments/certs/fleet-mentolder.pem` | LÖSCHEN | — |
| `environments/sealed-secrets/fleet-mentolder.yaml` | LÖSCHEN | E1 |
| `k3d/mentolder-web.yaml` | LÖSCHEN | E2 |
| `k3d/kustomization.yaml` | Eintrag `mentolder-web` streichen | E2 |
| `k3d/ingress.yaml` (Z. 84) | mentolder-web-Ref streichen | E2 |
| `environments/schema.yaml`, `environments/staging.yaml` | `fleet-mentolder`-Refs prüfen/streichen | — |
| `tests/py/spec/native_ported/spec/fleet-operations/test_legacy_secrets_fleet.py`, `test_secrets_deploy_automation.py`, `test_env_seal_singleline_values.py`, `tests/py/spec/test_fleet_operations.py` | Fixtures/Assertions auf korczewski-only | Tests grün, kein Skip-Schlupf |
| `docs/runbooks/{sealed-secrets-service-mapping,credentials-finden,gitlab-restore}.md`, `docs/superpowers/references/secrets-architecture.md` | mentolder-Zeilen entfernen | — |
| `docs/agent-guide/brand-separation-inventory.md` | „BLEIBT"-Zeilen (`:81,153,154`) auf Ist-Stand | — |
| `docs/code-quality/repo-index.json` | regenerieren, nicht von Hand | — |

Nicht anfassen: `docs/superpowers/specs/*` (historisch), `docs/handover/mentolder-gekko/*` (Übergabe an mentolder), `.agents/training/*`, `tmp/*`.

## Tasks (Worker-Dispatch)

Jeder Task ist eigenständig dispatchbar. Reihenfolge: T1 → (E1–E3) → T2 → T3 → T4. T1 darf sofort laufen.

### Task 1: Referenz-Inventar (read-only, dispatchbar)

Target: `docs/agent-guide/brand-separation-inventory.md` (nur Abschnitt „Reste")

- `git grep` aller Treffer für die sechs Zieldateien, getrennt nach Code, Tests, Docs, historisch.
- Je Treffer vermerken: entfernen, umschreiben oder bleibt.
- Verify: Liste vollständig gegen `git grep -c`; keine Dateiänderung außerhalb des Inventars.

### Task 2: Löschungen nach Freigabe (E1–E3)

Targets: die LÖSCHEN-Zeilen oben, nur die freigegebenen.

- `git rm` je Datei. Secret-Dateien nie lesen oder ausgeben.
- Verify: `git status` zeigt nur freigegebene Pfade als gelöscht.

### Task 3: Tests und Docs nachziehen

Targets: Tests und Docs aus der File-Structure-Tabelle.

- Fixtures auf `fleet-korczewski` umstellen. Fehlt ein Wert dort: STOPP, nichts erfinden.
- Verify: `python3 -m pytest tests/py/spec/test_fleet_operations.py tests/py/spec/native_ported/spec/fleet-operations -q` grün; `task workspace:validate` grün (Bachelorprojekt-Runner).

### Task 4: Verifikation und PR

- `git grep -nE 'fleet-mentolder|mentolder-web\.yaml'` außerhalb der Nicht-anfassen-Liste: leer.
- Repo-Index regenerieren (Task des Repos), PR gegen `main` (Bachelorprojekt-Flow: Ticket-Pflicht, Squash).
- Danach `brand-trennung`/`PROGRESS.md` Schritt 4 abhaken.

## Risiken

- `tests/py/spec/*` prüfen heute die Parität `fleet-mentolder` ↔ `fleet-korczewski`. Reines Löschen bricht CI (siehe p8 im Haupt-Plan, gleiche Mechanik).
- `environments/.secrets/*` ist git-crypt-verschlüsselt. Ein Löschen ohne Entschlüsselung ist möglich, der Commit-Hook scannt trotzdem auf Secrets.
- Löschen nimmt die Werte nicht aus der Git-Historie. Rotation/Purge ist eigene Entscheidung (Nicht-Ziel).
