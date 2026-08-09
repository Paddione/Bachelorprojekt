---
title: "sdlc-build-target-split — Implementation Plan"
ticket_id: T002624
domains: [website, ci-cd, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# sdlc-build-target-split — Implementation Plan

_Ticket: T002624 · Epic T002623 · ADR-006 Etappe 1_

Ziel: Ein Commit, der ausschließlich SDLC-Code berührt, löst den Produktions-Website-Build nicht
mehr aus. Dieser Nachweis ist der einzige Zweck des Vorgangs — er wird in Task 6 belegt, nicht
behauptet.

## File Structure

```
NEU
  website/src/integrations/build-target.mjs             Astro-Integration, Route-Filter
  website/src/integrations/build-target.test.mjs        Vitest — Route-Filter-Verhalten
  website/src/pages/sdlc/                                12 Seiten (aus pages/admin/)
  website/src/pages/sdlc/api/                            ~142 API-Routen (aus pages/api/**)
  website/src/lib/sdlc/                                  53 Module (aus src/lib/)
  website/src/components/sdlc/                           FactoryFloor*, components/factory/*
  .github/workflows/build-sdlc-console.yml               Build des SDLC-Images
  tests/spec/sdlc-isolation/build-target-split.bats      Pfad-Filter- und Struktur-Guards

GEÄNDERT
  website/astro.config.mjs                               Integration einhängen (Ist 33 · Budget 767)
  website/src/middleware/redirect-map.ts                 /admin/<x> → /sdlc/<x> (Ist 36 · Budget 864)
  .github/workflows/build-website.yml                    negativer paths-Filter
  website/package.json                                   Build-Skripte je Target
  website/src/data/test-inventory.json                   regeneriert
```

## Task 1 — Astro-Integration `build-target` (RED → GREEN)

Die Integration liest `BUILD_TARGET` und entfernt im Hook `astro:routes:resolved` die Routen der
jeweils anderen Fläche. Ist die Variable nicht gesetzt, bleiben alle Routen erhalten, damit die
lokale Entwicklung unberührt bleibt.

Zuerst den Test schreiben, der das Verhalten festlegt und auf dem aktuellen Stand fehlschlägt,
weil die Integration noch nicht existiert:

```bash
cd website && npx vitest run src/integrations/build-target.test.mjs
# expected: FAIL (rot — src/integrations/build-target.mjs existiert noch nicht)
```

Der Test deckt die drei Fälle aus der Delta-Spec ab: `BUILD_TARGET=prod` entfernt jede Route,
deren `component` unter einem `sdlc/`-Verzeichnis liegt; `BUILD_TARGET=sdlc` behält die
SDLC-Routen und entfernt die reinen Geschäftsrouten; ohne gesetzte Variable bleibt das Manifest
unverändert.

Danach `website/src/integrations/build-target.mjs` implementieren und in `astro.config.mjs`
eintragen. Der Filter arbeitet auf dem `component`-Pfad der Route, nicht auf der URL — die URL
folgt dem Dateipfad, aber der Dateipfad ist die verlässlichere Quelle.

Ergebnis: derselbe Vitest-Lauf ist grün.

## Task 2 — `lib`-Module und Komponenten verschieben

Die 53 ausschließlich von der SDLC-Fläche benutzten Module nach `website/src/lib/sdlc/`
verschieben — mit `git mv`, damit die Historie erhalten bleibt. Dazu gehören die `factory-*`-,
`tickets/*`-, `systemtest/*`- und `openspec/*`-Module sowie `platform-db`, `codesearch-db`,
`planning-office`, `k8s`, `ticket-graph`, `ticket-triage`, `qa-ingest`, `prompt-library-db`,
`llm-proxy-db`, `ki-config-db`, `github-ci`, `delivery-metrics` und `test-runner`.

Die 18 geteilten Module bleiben unangetastet: `auth`, `db-pool`, `logger`, `identity`,
`rate-limit`, `audit-log`, `website-db`, `logging/error-log-store`, `browser-logger`,
`provider-config`, `llm-models-probe`, `ki-catalog`, `knowledge-db`, `messaging-db`,
`questionnaire-db`, `questionnaire-display`, `native-billing`, `systemtest/feature-flag`.

Die zugehörigen `*.test.ts` wandern mit ihrem Modul. Anschließend die Importe in den
verbleibenden Dateien anpassen; der `$lib`-Alias deckt die Alias-Importe ab, die Relativ-Importe
verschieben sich um eine Ebene.

Im selben Zug die Komponenten: `FactoryFloor.svelte`, `FactoryFloorLane.svelte` und das
Verzeichnis `components/factory/` nach `website/src/components/sdlc/`. Der Vorgang ist derselbe —
`git mv` plus Importkorrektur — und lässt sich nicht sinnvoll von den Modulen trennen, weil die
Komponenten genau diese Module importieren.

Prüfen mit `cd website && npx tsc --noEmit` — der Typcheck ist hier das aussagekräftige Gate,
weil ein übersehener Importpfad sich als Auflösungsfehler zeigt und nicht als fehlschlagender
Test.

## Task 3 — Seiten und API-Routen verschieben

Die 12 SDLC-Seiten nach `website/src/pages/sdlc/` verschieben: `cockpit`, `pipeline`,
`observability`, `repohealth`, `software-history`, `architektur`, `platform`, `app-catalog`,
`prompts`, `ki-konfiguration`, `systemtest/board`, `tickets/[id]`. Die Weiterleitungsseite
`admin/bugs.astro` zeigt bereits per 301 auf die Ticketliste und zieht mit.

Die API-Routen nach `website/src/pages/sdlc/api/` verschieben: die Verzeichnisse `ops`,
`cockpit`, `tickets`, `tests`, `ki`, `systemtest`, `llm-proxy`, `cluster`, `platform`,
`evidence`, `prompt-library`, `deployments`, `testdata`, `openspec`, `planungsbuero` aus
`pages/api/admin/`, die losen Dateien `factory-control`, `deployments`, `monitoring`,
`backup-status`, `qa-criteria`, `qa-queue`, `qa-reviews`, `ai-quality`, `delivery-metrics`,
`test-results`, `test-runs` ebenda, sowie aus `pages/api/` die Verzeichnisse `factory`,
`factory-floor`, `tickets`, `openspec`, `planning-office`, `cluster` und die Dateien
`factory-budget.ts`, `factory-metrics.ts`, `factory-model-slots.ts`, `factory-observability.ts`,
`factory-floor.ts`, `codesearch.ts`.

`assets`, `asset-generation`, `art-library` und `generate-3d` bleiben in dieser Etappe unter
`admin`: sie erzeugen Material für die Kundenwebsite und ziehen erst mit Etappe 2 um, wenn
ComfyUI lokal angebunden ist.

## Task 4 — Redirect-Map

`website/src/middleware/redirect-map.ts` um die Abbildung `/admin/<seite>` → `/sdlc/<seite>` für
die zwölf verschobenen Seiten erweitern (Ist 36 · Budget 864). Die Einträge sind befristet: mit
Etappe 4 verschwinden die Routen aus dem Produktions-Image und die Redirects laufen ins Leere;
ein Kommentar im Kopf der Datei hält das fest.

Bestehende Vitest-Tests in `website/src/middleware/redirect-map.test.ts` um je einen Fall
erweitern: eine verschobene Seite wird umgeleitet, eine Geschäftsseite wie `/admin/rechnungen`
nicht.

## Task 5 — Build-Workflows

`.github/workflows/build-website.yml`: den `paths`-Block um die Ausschlüsse
`'!website/src/pages/sdlc/**'`, `'!website/src/lib/sdlc/**'` und
`'!website/src/components/sdlc/**'` ergänzen und `BUILD_TARGET=prod` an den Build-Schritt
durchreichen.

`.github/workflows/build-sdlc-console.yml` neu anlegen: baut mit `BUILD_TARGET=sdlc` das
Console-Image und triggert komplementär auf `website/src/**/sdlc/**` plus die geteilten Module.

`website/package.json`: je ein Build-Skript pro Target, das `BUILD_TARGET` setzt.

## Task 6 — Nachweis, dass der Produktions-Build nicht mehr auslöst

Der Guard gehört nach `tests/spec/sdlc-isolation/build-target-split.bats` — ein Verzeichnis pro
SSOT-Spec, eine Datei pro Vorgang.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/build-target-split.bats
# expected: FAIL vor Task 5, grün danach
```

Der Test prüft drei Aussagen. Erstens: `build-website.yml` enthält die drei negativen
Pfad-Muster — eine reine Konfigurationsaussage, für die `grep` das angemessene Mittel ist, weil
sich das Ergebnis ausschließlich im Quelltext manifestiert. Zweitens, als Positiv-Anker gegen
einen vakuos bestehenden Negativtest: `website/src/pages/sdlc/` existiert und enthält mindestens
eine `.astro`-Datei — fehlt der Umzug, wird der Test rot, statt trivial durchzulaufen. Drittens:
unter `website/src/pages/admin/` liegt keine der zwölf verschobenen Seiten mehr.

Zusätzlich der Wirknachweis am realen Werkzeug: `act` oder die GitHub-API mit einer
Änderungsliste, die ausschließlich `website/src/pages/sdlc/cockpit.astro` enthält, gegen den
`paths`-Filter auswerten und im Task-Ergebnis festhalten, dass kein Build ausgelöst wurde.

## Task 7 — Abschließende Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Dazu `task test:inventory`, weil in Task 1 und Task 6 neue Testdateien entstanden sind, und
`website/src/data/test-inventory.json` mitcommitten. Die `any`-Zählung darf nicht steigen:

```bash
bash -c "count=\$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"
```
