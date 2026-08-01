---
title: "K5: Epic-Canvas & Planungs-Workflow"
ticket_id: T002464
domains: [cockpit, frontend, daemon]
status: active
---

# Implementation Plan

**Ticket:** T002464
**Branch:** `feature/sdlc-cockpit-k5-epic-canvas-T002464`
**Spec:** `openspec/changes/epic-canvas-k5/design.md`

## File Structure

```
.lavish/kit/
├── canvas-store.js           # [NEW] IndexedDB Canvas-Store
├── panel-epic-canvas.html    # [NEW] Epic-Canvas Panel (HTML-Skeleton)
├── panel-epic-canvas.js      # [NEW] Panel-Logik
├── panel-epic-canvas.css     # [NEW] Panel-Styles
├── adapter.js                # [MOD] epics() + epicChangesSince() (E1)

.lavish/kit/daemon/
├── sources/epics.ts          # [NEW] Datenbeschaffung (ohne hono, damit testbar)
├── routes/epics.ts           # [MOD] Hono-Schicht darüber
└── server.ts                 # [MOD] Routen registrieren

tests/
├── spec/sdlc-cockpit/k5-epic-canvas.bats  # [NEW] Routen + E1 + K4-Grenze
└── unit/cockpit-epics.test.ts             # [NEW] argv-Bau, Parsing, Zeitstempel
```

## Partials

| p1 | tasks.d/p1-canvas-store.md | implementation | .lavish/kit/canvas-store.js |
| p2 | tasks.d/p2-epics-route.md | implementation | .lavish/kit/daemon/routes/epics.ts |
| p3 | tasks.d/p3-epic-panel.md | implementation | .lavish/kit/panel-epic-canvas.html, .lavish/kit/panel-epic-canvas.js, .lavish/kit/panel-epic-canvas.css |

## Nachträge zum ursprünglichen Plan

Die erste Umsetzung der Partials lag bereits auf dem Branch, war aber nicht
lauffähig. Was zusätzlich nötig war und warum:

1. **`exec()`-Signatur.** Der Code rief die Shell-String-Form auf, die T002505
   ersetzt hat. Seither nimmt `exec()` `bin` plus argv-ARRAY. Der gesamte
   Kommandostring landete als Programmname.
2. **`scripts/ticket.sh list`.** `--json` existiert dort nicht (list.sh gibt
   ohnehin `json_agg` aus), `--brand` ist Pflicht, und `--type` vergleicht auf
   Gleichheit — `project,feat` matchte nichts.
3. **Registrierung.** `routes/epics.ts` war in `server.ts` nie eingehängt und
   damit toter Code.
4. **D13.** `catch { return [] }` machte einen Datenbankausfall ununterscheidbar
   von "keine Epics".
5. **E1.** Panel und Store riefen `fetch()` direkt — mit *relativen* Pfaden, die
   von `file://` aus nie den Daemon auf 127.0.0.1:49152 erreicht hätten.
6. **Export.** Der Button rief `POST /api/cockpit/epics/export` auf, eine Route,
   die es nicht gibt, und schluckte den Fehlschlag per `catch { /* silent */ }`.
   Der Export läuft jetzt clientseitig als Datei-Download: Schreibpfade ins
   Dateisystem gehören hinter die Auth, die erst K4 entwirft, und ein blinder
   Voll-Überschreib von `openspec/changes/` ist genau der Datenvernichter, vor
   dem OF1 warnt.

**Offen für K4:** der schreibende OpenSpec-Export (Eigentumsgrenze pro
Artefaktteil, OF1 Punkt 1) braucht den Auth-Entwurf aus K4 und ist hier bewusst
nicht vorweggenommen.

## Verify

> Der ursprüngliche Verify-Schritt lautete
> `npx -y html-validate … || true` — durch das `|| true` konnte er **per
> Konstruktion nie fehlschlagen**. Genau deshalb blieb unbemerkt, dass die
> Route nicht registriert war.

Der Daemon muss laufen. Läuft bereits einer aus einem **fremden Worktree** auf
dem Standardport, misst die Suite dessen Code — dann einen eigenen Port nutzen:

```bash
# Daemon aus DIESEM Checkout
COCKPIT_DAEMON_PORT=49155 npx tsx .lavish/kit/daemon/server.ts &

# Routen, E1, K4-Grenze
COCKPIT_DAEMON_PORT=49155 COCKPIT_DAEMON_REQUIRED=1 \
  tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit/

# argv-Aufbau, Parsing, Zeitstempel-Validierung
npx vitest run tests/unit/cockpit-epics.test.ts
```

Erwartung: alle Tests grün, insbesondere
`T002464 GET /api/cockpit/epics ist registriert und antwortet` (schlägt fehl,
solange `server.ts` die Route nicht einhängt).
