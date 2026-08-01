---
ticket_id: T002458
plan_ref: null
status: active
date: 2026-08-02
domains: [website, cockpit]
ticket_ids: [T002462, T002463, T002465, T002467]
---

# K3–K8 Cockpit — Planungsstand der offenen Kinder

_Epic: T002458 · Bindende Spec: `docs/superpowers/specs/2026-07-28-sdlc-cockpit-design.md`_

## Warum dieses Dokument hier liegt und nicht unter `openspec/changes/`

Der Epic-Branch trug für K3–K9 je ein Verzeichnis unter `openspec/changes/` —
Vorstufen mit Kernanforderungen, aber **ohne Delta-Spec**. Damit fiel
`openspec validate` fail-closed durch; der Branch hätte in dieser Form nie
mergen können.

Entscheidend ist aber ein anderer Befund: **K5 und K9 haben ihre Scaffolds bei
der Umsetzung gar nicht verwendet.** Es entstanden eigene, vollständige Changes
unter neuen Slugs (`epic-canvas-k5`, `k9-stil-datenbank`), während die Scaffolds
`k5-epic-canvas`/`k9-stil-datenbank` unberührt liegen blieben. Sie sind
Wegwerf-Vorstufen, keine Arbeitsgrundlage.

Der Planungsstand gehört deshalb hierher, neben die bindende Design-Spec.
`openspec/changes/` bleibt den Änderungen vorbehalten, die tatsächlich in Arbeit
sind — jedes Kind bekommt seinen Change, wenn seine Umsetzung beginnt, dann mit
Delta-Spec und Partial-Manifest wie K5 und K9.

## Stand

| Kind | Ticket | Stand |
|---|---|---|
| K3 Layout-Engine | T002462 | offen |
| K4 Steuerung | T002463 | offen |
| **K5 Epic-Canvas** | T002464 | **erledigt** — PR #3593, archiviert als `openspec/changes/archive/2026-08-01-epic-canvas-k5` |
| K6 Brain-Anbindung | T002465 | offen |
| **K7 Admin-Migration** | T002466 | **erledigt** — PR #3563, `website/src/pages/admin/cockpit.astro` liegt auf `main` |
| K8 Headed-Tests | T002467 | offen |
| **K9 Stil-Datenbank** | T002468 | **erledigt** — PR #3594, archiviert als `openspec/changes/archive/2026-08-01-k9-stil-datenbank` |

Offen sind damit **vier** Kinder: K3, K4, K6 und K8. K5, K7 und K9 stehen unten
weiterhin, aber nur noch als Abgleich zwischen dem, was geplant war, und dem,
was tatsächlich entstanden ist. Sie sind aus `ticket_ids` entfernt, damit die
Planungswerkzeuge sie nicht als offene Arbeit führen.

> **Dieses Dokument wird nicht automatisch in Agent-Prompts injiziert.**
> `scripts/plan-context.sh` durchsucht ausschließlich `openspec/changes/`
> (`CHANGES_DIR`, einzige Fundstelle). Wer eines der offenen Kinder beginnt,
> muss den Planungsstand von Hand heranziehen — der Verweis darauf steht als
> Kommentar an jedem Kind-Ticket. Die beiden Taskfile-Treffer auf
> `superpowers/plans` sind bloße Usage-Beispiele in Hilfetexten, keine
> Konsumenten. [T002527]

## K3 (T002462): Layout-Engine

Bindend: Design-Spec, Entscheidungen **E3, E4, E7**, Abschnitt 3. Hängt an K1.

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | layout-engine | impl | `.lavish/kit/`, `.lavish/opencode-cockpit.html` | K1 |

1. Fokus-Spalte + Arbeitsbereich (E3) — **keine Kachelwand**
2. Panel-Katalog mit Drag-and-Drop zwischen Katalog und Arbeitsbereich
3. Pop-out in eigenes Fenster
4. Canvas-Panel Vollfläche (E7)
5. Mobil: Fokus-Spalte → obere Leiste + Bottom-Sheet, Vollbild-Panels
6. Persistenz der Anordnung (localStorage oder Canvas-Store)

## K4 (T002463): Steuerung, Bestätigungen und Audit-Log

Bindend: Design-Spec, **E5, E17, E21**, Abschnitte 2.3/2.4. Hängt an K2.

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | steuerung | impl | `.lavish/kit/daemon/`, `.lavish/kit/` | K2 |

1. **Harte** Trennung Lesen/Schreiben im Daemon (E17)
2. Audit-Log (JSON-Logdatei) als Strom-Panel
3. Abgestufte Bestätigung nach Umkehrbarkeit (D5/D6)
4. Aktions-Slot mit vier Zuständen: verfügbar · gesperrt · Bestätigung offen · läuft (D4)
5. Terminal-Panel via tmux, hinter Schreib-Token (E21)

> **K4 erbt zwei offene Enden aus K5.** Erstens den schreibenden
> OpenSpec-Export des Epic-Canvas (siehe unten) — er wurde bewusst
> zurückgestellt, weil er eine Browser-Auth braucht, die es noch nicht gibt.
> Zweitens die Write-Stubs `POST /api/cockpit/ticket-action` und
> `/agent-action`, die bis heute `{ ok: true, message: 'Write actions in K4' }`
> zurückgeben. Der Token liegt seit T002505 nur noch in einer 0600-Datei und ist
> für den Browser unerreichbar; CORS erlaubt Origin `null`, weshalb jeder
> HTTP-Weg zum Token als Hintertür taugt. Die Auth ist zu **entwerfen**, nicht
> nachzurüsten.

## K5 (T002464): Epic-Canvas — ERLEDIGT

_PR #3593 · archiviert als `openspec/changes/archive/2026-08-01-epic-canvas-k5`_

Geplant war:

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | epic-canvas | impl | `website/src/components/cockpit/`, `.lavish/kit/daemon/` | K1, K2 |

1. Canvas-Komponente (Panel + Vollfläche)
2. Workflow: Brainstorming→Grilling→Verfeinerung→OpenSpec→staged
3. Canvas-Store (CRUD, Export → ticket_fields + openspec/changes)
4. Fremde-Änderungs-Erkennung vor Export (OF1)

Abweichungen im Ergebnis — für K3/K4/K6/K7, die auf denselben Annahmen aufbauen:

- **Zielort ist `.lavish/kit/`, nicht `website/src/components/cockpit/`.** Das
  Kit ist die Stelle, an der Panels und Adapter tatsächlich liegen; die
  Admin-Fläche daneben stammt aus K7.
- **Der Export schreibt NICHT nach `openspec/changes/`.** Punkt 3 oben ist so
  nicht umgesetzt und war auch nicht umsetzbar: die Schreib-Endpunkte des
  Daemons sind bis K4 Stubs, und T002505 hat dem Browser die Schreibrechte
  entzogen. Der Export läuft clientseitig und erzeugt nur die Teile, die der
  Canvas selbst verfasst — alles andere wäre der Datenvernichter aus OF1.
  **Der schreibende Export bleibt damit offene Arbeit für K4.**
- **Punkt 4 ist konservativ gelöst:** wo keine verlässliche Aussage möglich ist,
  lautet die Antwort „geändert", nicht „unverändert".

## K6 (T002465): Brain-Anbindung — kontextuelle Wiki-Verknüpfung

Hängt an K2.

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | brain-anbindung | impl | `.lavish/kit/`, `.lavish/kit/daemon/` | K2 |

1. Brain-Wiki-Seiten indizieren (Liste aus `Paddione/brain`)
2. Kontext-Slot der Panels mit Brain-Verweisen befüllen — pro Panel/Epic
3. Auth-Hürde lösen: **Brain ist ein generiertes Wiki, keine API.** Der Zugang
   führt über oauth2-proxy-Session-Cookie oder einen eigenen Pocket-ID-Client

## K7 (T002466): Admin-Migration — ERLEDIGT

_PR #3563 · `website/src/pages/admin/cockpit.astro` liegt auf `main`_

Geplant war:

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | admin-migration | impl | `website/src/pages/admin/`, `website/src/components/admin/` | K2, K3 |

1. Cockpit wird Dachfläche im Admin-Menü
2. Bestehende Seiten (`cockpit.astro`, `pipeline.astro`) gehen als Panels auf
3. CSS-Schicht (`tokens.css`, `document.css`) bleibt geteilt
4. Adapter-Schnitt aus K1/K2 nutzen für den Base-URL-Wechsel

> **Offen geblieben:** Punkt 4. Der Adapter spricht weiterhin fest
> `http://127.0.0.1:49152` (`const BASE` in `.lavish/kit/adapter.js`). Im
> Admin-Kontext ist das ein anderer Ursprung — wer K3 oder K6 baut, sollte das
> nicht als gelöst voraussetzen.

## K8 (T002467): Optionale agentische Headed-Tests

Hing an K7 — **das ist erledigt**, K8 ist damit nicht mehr blockiert.

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | headed-tests | impl | `tests/e2e/`, `.github/workflows/e2e.yml` | K7 |

1. Playwright-Verifikation gegen die **live ausgelieferte** Anwendung
2. Agentisch gesteuert, kein starres Skript
3. **Optional — nicht im Pflicht-CI-Pfad**
4. Anknüpfungspunkte: Skill `dev-flow-e2e`, `.github/workflows/e2e.yml`,
   mmproj-Vision-Server auf `:8094`

## K9 (T002468): Stil-Datenbank — ERLEDIGT

_PR #3594 · archiviert als `openspec/changes/archive/2026-08-01-k9-stil-datenbank`_

Geplant war:

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | stil-datenbank | impl | `website/src/lib/styles/`, `.lavish/kit/` | K1 |

1. Stil-Sammlung mit Token-Bezügen
2. Ernte-Pipeline aus abgeschlossenen Prototypen (D14)
3. Beitragspfad: Beleg-Ausschnitt, Token-Bezüge, Herkunftsprojekt

Abweichungen im Ergebnis:

- **Zielort ist `.lavish/styles/`, nicht `website/src/lib/styles/`** — die
  Sammlung liegt neben dem Kit, dessen Tokens sie belegt.
- **Es gibt kein `--lv-*`-Token-Präfix.** Der Plan nannte es; `tokens.css`
  definiert `--color-*`, `--space-*`, `--radius-*`, `--text-*`, `--duration-*`,
  `--font-*`, `--ease-*`, `--leading-*`, `--weight-*`. Wer in K3/K4/K6/K7 gegen
  Tokens prüft, prüft gegen die Datei, nicht gegen eine Aufzählung.
- **D14 Regel 2 ist strenger, als sie klingt.** `.panel--rail` trägt
  `max-height: 2.5rem` und ist damit als Beleg-Ausschnitt regelwidrig;
  aufgenommen wurden nur die token-reinen Regeln desselben Blocks. Wer weitere
  Komponenten erntet, wird häufiger auf diesen Fall stoßen.

## File Structure

Für die noch offenen Kinder K3, K4, K6 und K8. Die Pfade sind gegenüber dem
ursprünglichen Entwurf korrigiert: K5 und K9 sind tatsächlich unter `.lavish/`
entstanden, nicht unter `website/src/`. Die Admin-Fläche existiert seit K7
(`website/src/pages/admin/cockpit.astro`), das Kit bleibt daneben der Ort für
Panels, Adapter und Daemon.

```
CHANGED:
  .lavish/kit/                          — K3, K4, K6
  .lavish/kit/daemon/                   — K4, K6
  .lavish/opencode-cockpit.html         — K3
  (K7 erledigt — website/src/pages/admin/cockpit.astro liegt auf main)
  .github/workflows/e2e.yml             — K8
NEW:
  tests/e2e/cockpit-verification/       — K8

ERLEDIGT (nicht mehr anzufassen, siehe Archiv):
  .lavish/kit/canvas-store.js           — K5
  .lavish/kit/panel-epic-canvas.*       — K5
  .lavish/kit/daemon/{routes,sources}/epics.ts — K5
  .lavish/styles/                       — K9
  .lavish/kit/daemon/{routes,sources}/styles.ts — K9
```
