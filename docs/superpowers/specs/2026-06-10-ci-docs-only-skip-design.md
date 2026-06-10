# Spec: CI Auto-Skip bei Docs-only-Changes

**Ticket:** T000589  
**Branch:** feature/ci-docs-only-skip  
**Datum:** 2026-06-10  
**Status:** approved (offene_fragen_geklaert=true)

---

## Problem

Die CI-Pipeline (`ci.yml`) läuft bei **jedem PR und Push**, unabhängig davon ob nur Dokumentation geändert wurde. Ein PR der ausschließlich `docs/**` oder `*.md`-Dateien ändert, triggert alle 5 Jobs (offline-tests, security-scan, brett-typescript, vitest, commit-lint) — unnötige ~10 Minuten Wartezeit.

---

## Lösung

Native GitHub Actions `paths-ignore` auf Workflow-Ebene in `ci.yml`. Der Workflow triggert bei Docs-only-PRs nicht — spart CI-Minuten und reduziert Queue-Wartezeit.

**Keine externe Action** (dorny/paths-filter o.ä.) nötig.

---

## Scope

### In Scope
- `paths-ignore` zu beiden Triggern (`pull_request` + `push`) in `.github/workflows/ci.yml` hinzufügen
- Pfade: `docs/**` und `*.md` (Repo-Root)

### Out of Scope
- Andere Workflows (build-website, build-brett etc.) — haben bereits eigene path-Filter
- `e2e.yml` — läuft cron-based gegen Prod, kein PR-Trigger
- Granulares per-Job-Skipping (nicht nötig — Workflow-Level reicht)

---

## Implementierung

### Änderung: `.github/workflows/ci.yml`

```yaml
on:
  pull_request:
    branches: [main]
    paths-ignore:
      - 'docs/**'
      - '*.md'
  push:
    branches:
      - main
      - 'release-please--branches--main'
    paths-ignore:
      - 'docs/**'
      - '*.md'
```

Das ist die **einzige Dateiänderung**.

---

## Warum nicht dorny/paths-filter?

`paths-ignore` auf Workflow-Ebene ist einfacher und wartungsärmer. Die einzige Gefahr — generated JSON-Dateien (test-inventory.json, agent-guide.generated.json) werden irrtümlich als docs behandelt — tritt in der Praxis nicht auf, weil:

1. Generated files liegen unter `website/src/data/` und `website/src/lib/`, nicht unter `docs/` oder als `*.md`
2. Wer nur `docs/` ändert, ändert keine generated JSONs

---

## Grenzfälle

| Szenario | Verhalten | Korrekt? |
|----------|-----------|----------|
| Nur `docs/my-doc.md` geändert | CI skipped komplett | ✅ |
| Nur `README.md` geändert | CI skipped | ✅ |
| `docs/` + `website/src/` geändert | CI läuft (kein match auf paths-ignore) | ✅ |
| `CLAUDE.md` geändert (root *.md) | CI skipped | ✅ intentional |
| `website/src/data/test-inventory.json` geändert | CI läuft | ✅ |
| Nur `.github/workflows/ci.yml` geändert | CI läuft | ✅ |

---

## Tests

Kein neuer Testcode nötig. Verifikation:
- Nach Merge: PR mit reiner `docs/`-Änderung öffnen → CI-Checks erscheinen nicht → PR mergebar (wenn branch protection required checks = nur nicht-geskippte)

**Achtung Branch Protection:** GitHub behandelt geskippte Required Checks als „bestanden" ab 2023 — keine Anpassung der Branch-Protection-Regeln nötig.

---

## Risiken

**Keins.** Reine CI-Konfigurationsänderung, kein Produktionscode berührt. Rollback = Revert des `paths-ignore`-Blocks.
