# Proposal: ci-speed

_Ticket: T001216_

## Why

Die CI-Pipeline hat aktuell 6 Jobs. Analyse zeigt zwei strukturelle Ineffizienzen:

1. **Doppelter Install-Overhead**: `vitest-website` und `bundle-budget` führen beide einen
   vollständigen `pnpm install --frozen-lockfile` aus — unabhängig voneinander, ohne
   Artifact-Sharing. `bundle-budget` baut zusätzlich die Website. Das kostet ~2–3 Minuten
   reine Wartezeit pro Run.

2. **`apt-get`-Bloat**: `offline-tests` installiert `jq`, `curl`, `python3-pip` via apt —
   `jq` und `curl` sind auf `ubuntu-latest` bereits vorinstalliert. Der apt-Update-Block
   kostet ~20–30s mit Netzwerklatenz.

Zusätzlich fehlt ein dedizierter Cache-Key für `scripts/factory/package-lock.json`
(zweiter `npm ci` in `offline-tests` ohne eigenen Cache-Slot → kein Cache-Hit möglich).

Keine der Änderungen berührt Produktverhalten — ausschließlich CI-Infrastruktur.

**Constraint (T001149-M3):** Path-Filter auf required-check-Jobs sind nicht anwendbar.
Ein naiver `paths-ignore` auf Docs/Markdown blockiert die 5 required checks bei
docs-only-PRs und erzeugt `BLOCKED` mergeStateStatus → Path-Filter werden nicht implementiert.

## What

Drei implementierte Maßnahmen + zwei dokumentierte Optionen:

### 1. apt-get-Bloat reduzieren
In `offline-tests`: `jq` und `curl` aus der apt-Liste entfernen. Prüfen ob
`python3-pip` wirklich gebraucht wird — falls nein, `apt-get update` ganz entfernen.

### 2. Factory-npm-Cache-Key ergänzen
In `offline-tests`: `actions/setup-node` mit `cache-dependency-path: scripts/factory/package-lock.json`
vor dem `npm ci --prefix scripts/factory` ergänzen, damit der zweite npm-Install
einen eigenen Cache-Slot bekommt.

### 3. Website-Build als Artifact teilen (Kernoptimierung)
`vitest-website` übernimmt Install + Test + Build und lädt `website/dist` als
GitHub Actions Artifact hoch. `bundle-budget` hängt via `needs: [vitest-website]` ab,
downloaded das Artifact und führt nur noch `check-bundle-size.mjs` aus — kein eigenes
Install oder Build. Eliminiert ~2–3 Minuten Parallelarbeit.

### 4. Path-Filter (nicht implementiert — dokumentiert)
Für required-check-Jobs (offline-tests, brett-typescript, vitest-website, bundle-budget,
security-scan) nicht anwendbar ohne einen "pass-through"-Dummy-Job. Mehr Aufwand als Gewinn.

### 5. Größerer Runner (nicht implementiert — dokumentiert)
`runs-on: ubuntu-latest-4-core` (GitHub Team/Enterprise) verdoppelt Vitest-Parallelismus
bei ~243 Test-Dateien. Separates Infrastruktur-Ticket erforderlich.

## Entscheidungsmatrix

| Maßnahme | Status | Erwarteter Gewinn |
|----------|--------|-------------------|
| apt-bloat reduzieren | ✅ implementiert | ~20–30s |
| factory-npm-cache | ✅ implementiert | ~30–60s |
| Website-Artifact-Sharing | ✅ implementiert | ~2–3 min |
| Path-Filter | ❌ nur Doku | kollidiert mit T001149-M3 |
| Größerer Runner | 📄 nur Doku | ~30–50% Vitest-Speed |
