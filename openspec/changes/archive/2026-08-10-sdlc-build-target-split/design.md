---
ticket_id: T002624
plan_ref: openspec/changes/sdlc-build-target-split/tasks.md
status: active
date: 2026-08-03
---

# Design: SDLC-Build-Target-Split (ADR-006 Etappe 1)

## Kontext

Etappe 1 von [ADR-006](../../../docs/adr/ADR-006-sdlc-isolation-dev-host.md) — Ticket T002624,
Epic T002623.

Heute triggert `.github/workflows/build-website.yml` auf `paths: ['website/**']`. Ein Commit an
einer SDLC-Seite wie `website/src/pages/admin/cockpit.astro` baut das Website-Image neu und rollt
es auf mentolder.de und korczewski.de aus. Ein Fehler in der Entwicklungsfläche kann damit die
Kundenseite kippen — das ist der schwerwiegendste der drei im ADR benannten Schmerzpunkte.

Diese Etappe beseitigt ausschließlich diese Kopplung. Sie zieht **keine** Daten um, baut **keine**
neue Infrastruktur und nimmt der Produktion **keine** Funktion weg; alle SDLC-Routen bleiben nach
E1 zunächst weiterhin erreichbar. Damit ist E1 vollständig reversibel.

## Messung: Wie stark sind die Flächen verflochten?

Erhoben am 2026-08-03 über die `$lib`- und Relativ-Importe aller Seiten unter `website/src/pages`:

| Größe | Wert |
|---|---|
| SDLC-Dateien (Seiten + API-Routen) | 154 |
| Geschäfts-Dateien | 418 |
| `lib`-Module ausschließlich von SDLC benutzt | 53 |
| `lib`-Module ausschließlich vom Geschäft benutzt | 93 |
| **`lib`-Module von beiden benutzt** | **18 (11 %)** |

Die 18 geteilten Module sind zum größeren Teil legitime Infrastruktur — `auth`, `db-pool`,
`logger`, `identity`, `rate-limit`, `audit-log`, `website-db`, `logging/error-log-store` — und
zum kleineren Teil echte fachliche Überschneidungen: `provider-config`, `llm-models-probe` und
`ki-catalog` werden auch vom **Coaching** benutzt (`api/admin/coaching/ki-config/models.ts`,
`api/admin/coaching/sessions/[id]/complete.ts`, `api/demo/coaching-sim.ts`), dazu `knowledge-db`,
`messaging-db`, `questionnaire-db`, `questionnaire-display`, `native-billing` und
`systemtest/feature-flag`.

**Folgerung:** Die Verflechtung ist gering genug, dass ein Verzeichnis-Schnitt ohne Auflösung
gemeinsamer Module möglich ist. Die 18 geteilten Module bleiben, wo sie sind; Änderungen an ihnen
lösen weiterhin beide Builds aus. Das ist korrekt — sie sind tatsächlich gemeinsam.

Eine erste Messrunde hatte `factory-floor` und `k8s` fälschlich als geteilt ausgewiesen. Ursache
war eine unvollständige SDLC-Liste: die 23 losen `.ts`-Dateien direkt unter `pages/api/admin/`
waren nicht erfasst. Davon sind `factory-control`, `deployments`, `monitoring`, `backup-status`,
`qa-criteria`, `qa-queue`, `qa-reviews` (an `tickets.qa_reviews`), `ai-quality`,
`delivery-metrics`, `test-results` und `test-runs` SDLC; `art-library`, `assets`, `generate-3d`,
`brand-starter`, `clients-list`, `customers`, `customers-list`, `inbox` und `messages` sind
Geschäft. Nach der Korrektur liegen `factory-floor` und `k8s` sauber auf der SDLC-Seite.

## Entscheidungen

**D1 — Physische Verzeichnistrennung statt Laufzeit-Schalter.** SDLC-Code zieht nach
`src/pages/sdlc/`, `src/lib/sdlc/` und `src/components/sdlc/`. Ein Laufzeit-Schalter (Middleware,
die SDLC-Routen in Prod mit 404 beantwortet) wäre billiger, löst den Blast Radius aber nicht: der
Build würde weiterhin ausgelöst und das Image weiterhin ausgerollt. Nur die physische Trennung
erlaubt einen Pfad-Filter auf Workflow-Ebene.

**D2 — Negativer Pfad-Filter im Build-Workflow.** `build-website.yml` bekommt
`paths: ['website/**', '!website/src/**/sdlc/**', …]`. Damit löst ein Commit, der ausschließlich
SDLC-Verzeichnisse berührt, den Produktions-Build nicht mehr aus. Änderungen an den 18 geteilten
Modulen lösen ihn weiterhin aus — beabsichtigt.

**D3 — Route-Filterung über `astro:routes:resolved`.** Astro 7.1.6 stellt diesen
Integrations-Hook bereit. Eine kleine Integration entfernt anhand von `BUILD_TARGET=prod|sdlc`
die jeweils fremden Routen aus dem Manifest, bevor gebaut wird. Damit enthält das
Produktions-Image die SDLC-Routen ab E4 gar nicht mehr — Abschaltung durch Abwesenheit statt
durch eine Laufzeitprüfung, die man vergessen oder umgehen kann.

**D4 — URLs ziehen mit, `/admin/*` bekommt Redirects.** In Astro bestimmt der Dateipfad die
Route; aus `pages/admin/cockpit.astro` wird `pages/sdlc/cockpit.astro` und damit `/sdlc/cockpit`.
Die bestehende `src/middleware/redirect-map.ts` nimmt die Abbildung `/admin/<x>` → `/sdlc/<x>`
auf, solange die Routen noch im Produktions-Image liegen (bis E4). Die Alternative — URLs über
eine Umschreibung künstlich erhalten — wurde verworfen: sie entkoppelt Dateipfad und URL
dauerhaft, was in Astro unüblich ist und jede spätere Navigation im Code erklärungsbedürftig
macht.

**D5 — Zwei Images statt eines.** Aus derselben Codebase entstehen zwei Artefakte: das bestehende
Website-Image (`BUILD_TARGET=prod`) und ein SDLC-Console-Image (`BUILD_TARGET=sdlc`). Ein
gemeinsames Image mit Laufzeit-Umschaltung widerspräche D3.

**D6 — Tests wandern mit ihrem Modul.** `*.test.ts` liegt neben der Datei, die es prüft, und zieht
mit ihr um. Der Pfad-Filter erfasst sie dadurch automatisch.

## Zielstruktur

```
website/src/
├── pages/
│   ├── admin/          # nur noch Geschäft (Rechnungen, Kunden, Coaching, …)
│   └── sdlc/           # NEU: Cockpit, Pipeline, Tickets, Observability, Repo-Health,
│       └── api/        #      Architektur, Platform, App-Catalog, Systemtest, Prompts,
│                       #      KI-Konfiguration, Assets/Asset-Generierung
├── lib/
│   ├── sdlc/           # NEU: 53 Module (factory-*, tickets/*, systemtest/*, platform-db,
│   │                   #      codesearch-db, planning-office, k8s, …)
│   └── …               # 93 Geschäfts-Module + 18 geteilte bleiben unverändert liegen
└── components/
    └── sdlc/           # NEU: FactoryFloor*, components/factory/*
```

## Trade-offs und Risiken

- **Import-Pfade brechen breit.** 154 Dateien ändern ihre Position; jeder relative Import auf
  `../../lib/x` verschiebt sich um eine Ebene. Der `$lib`-Alias in `astro.config.mjs` federt einen
  Teil ab, aber nicht die Relativ-Importe. Das ist mechanische, aber umfangreiche Arbeit — der
  TypeScript-Check ist hier das entscheidende Gate, nicht die Testsuite.
- **E2E- und Unit-Tests referenzieren `/admin/*`-Pfade.** Sie müssen mit den Redirects zusammen
  angepasst werden; ein Test, der einem 301 folgt, bemerkt die Änderung sonst nicht und verliert
  seine Aussagekraft.
- **S1-Budget.** `astro.config.mjs` und `build-website.yml` wachsen. Vor dem Schreiben des Plans
  ist je Datei die wirksame Schwelle gegen `docs/code-quality/baseline.json` zu prüfen.
- **Der Nachweis ist die eigentliche Leistung.** Dass der Produktions-Build nicht mehr auslöst,
  muss belegt werden — nicht behauptet. Ohne diesen Nachweis ist die Etappe wertlos, weil genau
  diese Eigenschaft ihr einziger Zweck ist.

## Offene Punkte

- Die verbleibenden zwei E1-Messungen (Windows-RAM-Bedarf bei laufendem llama.cpp/ComfyUI;
  Anteil der fleet-Last aus Admin-Requests) sind noch nicht erhoben. Sie blockieren E1 nicht,
  aber ihr Ergebnis geht als Baseline in E2 (`.wslconfig`) und E4 (Lastvergleich) ein.
- Ob `assets` / `asset-generation` in E1 schon mitziehen oder erst mit E2 (wenn ComfyUI lokal
  angebunden ist), wird beim Schreiben des Plans entschieden — die Seiten sind SDLC, ihre
  Ergebnisse aber Material der Kundenwebsite.
