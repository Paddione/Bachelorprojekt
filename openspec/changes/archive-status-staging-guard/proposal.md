# Proposal: archive-status-staging-guard

## Why

Zwei fremd erstellte Archiv-PRs trugen die regenerierte `website/src/data/openspec-status.json`
nicht im Archiv-Commit: **PR #4533** (T005958, freshness-regen-reaper) und **PR #4529**
(T005560, ticket-lock-stale-pass), beide vom 2026-08-15. In beiden PRs ist die Commit-Struktur
identisch (belegt per GitHub-API, `pulls/<n>/commits` + `commits/<sha>`):

- Commit 1 `chore(plans): archive <slug> → postgres + openspec/archive [T…]` — enthält nur die
  Archiv-Verschiebung (`openspec/changes/archive/…`, SSOT-Delta), **ohne** die JSON.
- Commit 2 `chore(plans): regenerate openspec-status after archive [T…]` — die manuelle
  Heilung mit ausschließlich `website/src/data/openspec-status.json`.

Der BATS/Freshness-Gate (T002252-Falle „regenerated but not staged") schlug in CI an, Auto-Merge
wartete, und beide Male war ein manueller Regenerate-Commit als Heilung nötig.

### Symptom vs. Ursache (T002448-M5)

**Symptom (Fakt, reproduzierbar):** Archiv-Commit ohne committete `openspec-status.json`,
obwohl `plan-archive-steps.md` Schritt 7 das explizite Staging verlangt und `cmd_archive`
(scripts/openspec.sh, T003136, gemergt 2026-08-11 PR #4255) die Datei seitdem selbst
regeneriert und staged.

**Hypothese (im Ticket):** Archiv-Läufe anderer Ausführer (Factory-Poller/gestorbene Sessions)
überspringen den Add-Block.

**Verifikation der Hypothese (Code-Evidenz):** Der T003136-Add-Block in `cmd_archive`
(scripts/openspec.sh:325-336) steht unter der Bedingung
`if [[ "${TICKET_OFFLINE:-0}" != "1" ]]` und ist auf beiden Zeilen best-effort (`|| true`).
`openspec-status-map.sh` ist ein **rein lokaler** Scan von `openspec/changes/` (kein Cluster,
kein Ticket-DB-Zugriff nötig — siehe Kopf der Datei: `git rev-parse --show-toplevel`, `jq`,
Dateisystem). Die Kopplung an `TICKET_OFFLINE` ist also ein Konstruktionsfehler: Läufe, die
offline arbeiten (kein k8s-Portforward → `TICKET_OFFLINE=1` gesetzt, wie von
`scripts/vda/ticket/_ticket-core.sh` dokumentiert), überspringen Regeneration **und** Staging
still. Genau diese Konstellation passt zu den beobachteten Ausführern.

Zusätzliche Bestätigung: Der aktuelle automatisierte Pfad `scripts/devflow-post-merge-finalize.sh`
Schritt 8 (seit 2026-08-15 01:09, PR #4539) führt `task freshness:regenerate >/dev/null 2>&1 || true`
aus und pusht den Archiv-Branch **ohne** `task freshness:check`-Verifikation vor dem Push —
ein fehlgeschlagener Regenerate oder ein übersprungener Add wird still durchgereicht, der PR
entsteht trotzdem. Genau das Muster, das #4529/#4533 erzeugte.

## What

Der Fix gehört in Ablauf **und** Guard (keine Änderung an `plan-archive-steps.md` — die härtet
die Parallelsession T006369, Koordination siehe design.md):

1. **`scripts/openspec.sh` `cmd_archive`:** Status-Map-Regeneration + Staging aus der
   `TICKET_OFFLINE`-Bedingung herauslösen und fail-closed machen (kein `|| true` mehr; die
   Status-Map ist lokal, `set -euo pipefail` bricht bei Fehler sauber ab). Damit kann kein
   Archiv-Lauf — egal ob online oder offline, egal welcher Ausführer — den Add überspringen.
2. **`scripts/devflow-post-merge-finalize.sh` Schritt 8:** `task freshness:regenerate` ohne
   stilles `|| true` ausführen und **vor** dem Push des Archiv-Branches `task freshness:check`
   verifizieren (bei Drift regenerierte Artefakte stagen + Archiv-Commit amenden, dann pushen).
   Das schließt die Lücke des automatisierten Factory-Pfads, der die beobachteten PRs erzeugt
   hat.
3. **Neuer BATS-Guard** in eigener Datei unter `tests/spec/openspec-workflow/` (T002416):
   Verhaltenstest, der `openspec.sh archive` mit `TICKET_OFFLINE=1` in der Sandbox ausführt und
   das Staging der JSON belegt (Output-Verifikation, T002448-M4) — heute rot, nach dem Fix grün.
4. **Delta-Spec** auf `openspec/specs/scripts.md` (Parent-SSOT für das Archiv-Verb-Verhalten).

_Ticket: T006371_
