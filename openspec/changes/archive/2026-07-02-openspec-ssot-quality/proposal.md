## Why

Die OpenSpec SSOT-Struktur hat seit der Einführung des Systems Drift angesammelt: Die
`config.yaml`-Komponentenliste (24 Einträge) ist gegenüber den tatsächlichen SSOT-Spec-Dateien
(63 Dateien) stark veraltet, ein Spec-File verletzt die Pflicht-Header-Konvention und lässt
`task test:openspec` mit FAIL enden, und zwei aktive Changes haben leere `specs/`-Verzeichnisse,
die ebenfalls zu CI-FAILs führen. Dieser Change bereinigt alle identifizierten Lücken in einem
gebündelten PR und ergänzt einen minimalen Drift-Check, der künftige Inkonsistenz frühzeitig
sichtbar macht.

## What Changes

- **Fix:** `openspec/specs/t001269-mishap-bundle-*.md` — fehlende `## Purpose` + `## Requirements` H2-Header ergänzen (CI-FAIL-Ursache)
- **Fix:** `openspec/changes/g-cd01-korczewski-ci-parity/specs/` — minimalen validen Delta-Stub anlegen (CI-FAIL-Ursache)
- **Fix:** `openspec/changes/g-dep01-npm-vuln/specs/` — minimalen validen Delta-Stub anlegen (CI-FAIL-Ursache)
- **Update:** `openspec/config.yaml` OpenSpec-Komponenten-Liste auf alle 63 aktuellen SSOT-Specs erweitern (alphabetisch sortiert)
- **Cleanup:** Archivierte Proposals in `openspec/changes/archive/` mit falschem `status:`-Feld auf `status: archived` korrigieren
- **Enhancement:** `scripts/openspec-validate.ts` — WARN-Level-Check: meldet SSOT-Specs, die nicht in der config.yaml-Komponentenliste stehen

## Capabilities

### New Capabilities

_(keine neuen Capabilities — reine SSOT-Qualitätsverbesserung)_

### Modified Capabilities

- `openspec-workflow`: Die Validierungslogik in `openspec-validate.ts` erhält einen neuen
  WARN-Level Drift-Check (SSOT-Specs vs. config.yaml-Liste). Kein FAIL, kein Breaking Change —
  additiver Check, der künftige Inkonsistenz in der CI-Ausgabe sichtbar macht.

## Impact

- **`scripts/openspec-validate.ts`** — additiver WARN-Check (kein Behavior-Breaking)
- **`openspec/config.yaml`** — Komponentenliste vollständig aktualisiert
- **`openspec/specs/t001269-mishap-bundle-*.md`** — H2-Header-Fix (Validation-Pass)
- **`openspec/changes/g-cd01-korczewski-ci-parity/specs/`** — neuer Stub-Delta
- **`openspec/changes/g-dep01-npm-vuln/specs/`** — neuer Stub-Delta
- **`openspec/changes/archive/*/proposal.md`** — Status-Feld-Cleanup
- **Kein Impact** auf Kubernetes-Manifeste, Website, CI-Workflows, Tickets, oder T001262-Scope
