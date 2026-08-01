---
title: "K9: Stil-Datenbank als Gestaltungsquelle"
ticket_id: T002468
domains: [design-system]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# K9: Stil-Datenbank als Gestaltungsquelle — Implementation Plan

**Ticket:** T002468
**Epic:** T002458 (Cockpit-Gesamtkonzept)
**Branch:** `feature/stil-datenbank-T002468`
**Spec:** `openspec/changes/k9-stil-datenbank/design.md`

## File Structure

```
openspec/changes/k9-stil-datenbank/
├── proposal.md          # Warum/Was (E14: Gestaltungsquelle für Modelle)
├── design.md            # Architektur: Datenebene + Beitragspfad + Zugriff
├── specs/sdlc-cockpit.md# Delta auf SSOT sdlc-cockpit (D14, E14)
├── tasks.md             # dieser Plan
└── tasks.d/
    ├── p1-datenebene.md # JSON-Schema + Beispiel-Einträge + index.json
    ├── p2-beitragspfad.md # Validierung + Verzeichnis/Index + Doku
    ├── p3-zugriff.md    # Adapter data.styles() + Daemon-Route /api/cockpit/styles
    └── p4-tests.md      # BATS: Schema/Beitragspfad/Route + Vitest: Adapter
```

## Partials

| Partial | File | Role | Files | Depends |
|---------|------|------|-------|---------|
| p1 | tasks.d/p1-datenebene.md | implementation | `.lavish/styles/schema.json`, `.lavish/styles/status-panel-akzent.json`, `.lavish/styles/rail-nav-tokens.json` | |
| p2 | tasks.d/p2-beitragspfad.md | implementation | `.lavish/styles/index.json`, `.lavish/styles/README.md` | p1 |
| p3 | tasks.d/p3-zugriff.md | implementation | `.lavish/kit/adapter.js`, `.lavish/kit/daemon/server.ts`, `.lavish/kit/daemon/routes/styles.ts`, `.lavish/kit/daemon/sources/styles.ts` | p1, p2 |
| p4 | tasks.d/p4-tests.md | tests | `tests/spec/sdlc-cockpit/k9-stil-datenbank.bats`, `tests/unit/cockpit-styles.test.ts` | p3 |

**Disjunktheit:** Keine Datei kommt in mehr als einem Partial vor (D1).

**Pipeline:** Partials werden in Reihenfolge p1→p2→p3→p4 gestaged und enqueued. p4 (Tests-Rolle) ist das letzte Partial.

## Partial Plans

- [p1] `tasks.d/p1-datenebene.md` — Stil-Datenbank-Dateien: JSON-Schema + 2 Beispiel-Einträge
- [p2] `tasks.d/p2-beitragspfad.md` — Verzeichnis/Index + README mit D14-Beitragsregeln
- [p3] `tasks.d/p3-zugriff.md` — Adapter `data.styles()` + Daemon-Route `GET /api/cockpit/styles`
- [p4] `tasks.d/p4-tests.md` — BATS (Schema, D14, Route) + Vitest (Adapter, D13)

## Quality Gates

- `bash scripts/plan-lint.sh openspec/changes/k9-stil-datenbank/tasks.md`
- `bash scripts/openspec.sh validate`
- BATS-Negativtests mit Positiv-Anker (T002356-M1)
- Kein Panel ruft `fetch()` direkt — nur Adapter-Methoden (E1)

## Abweichungen vom Plan — und warum

1. **`--lv-*`-Tokens gibt es nicht.** Der Plan verlangte Bezüge der Form
   `--lv-*`/`--color-*`. Ein `--lv-`-Präfix existiert im gesamten Repo nicht;
   `tokens.css` definiert `--color-*`, `--space-*`, `--radius-*`, `--text-*`,
   `--duration-*`, `--font-*`, `--ease-*`, `--leading-*` und `--weight-*`.
   Geprüft wird deshalb gegen die Namen, die `tokens.css` **tatsächlich**
   definiert — ein Test gegen eine erfundene Namensfamilie hätte entweder alles
   durchgelassen oder alles abgelehnt.

2. **Belegquelle ist `panel.css`, nicht `reference-board.html`.** Das
   Referenz-Board ist eine schlichte Dokumentseite ohne Panels und ohne Rail;
   die im Plan genannten Ausschnitte gibt es dort nicht. Beide Einträge stammen
   aus `.lavish/kit/panel.css`.

3. **Nur die token-reinen Regeln aufgenommen.** `.panel--rail` selbst enthält
   `max-height: 2.5rem` und wäre nach D14 Regel 2 regelwidrig. Aufgenommen
   wurden die Regeln desselben Blocks, die ausschließlich `var(--token)`
   verwenden. Das ist kein Umgehen der Regel, sondern ihr erster echter
   Anwendungsfall — und im README als solcher dokumentiert.

4. **Leselogik in `sources/styles.ts` statt in der Route.** Der Daemon zieht
   `hono`, das in keiner `package.json` deklariert ist; ein Test, der die Route
   importiert, wäre in CI nicht lauffähig. Gleiches Muster wie `sources/kubectl.ts`.

5. **Pfadauflösung über `import.meta.url`, nicht `process.cwd()`.** Der Daemon
   wird aus wechselnden Verzeichnissen gestartet. Mit cwd-basierter Auflösung
   fände er im falschen Verzeichnis schlicht nichts — und lieferte eine leere
   Sammlung statt eines Fehlers, also genau den stillen Fallback, den D13
   verbietet. `STYLES_DIR` bleibt als Override.

6. **Zusätzlich: Drift-Meldung.** Weicht `index.json` von den vorhandenen
   Dateien ab, meldet die Route das als `warnings`, statt stillschweigend die
   eine oder andere Hälfte auszuliefern. D14 Regel 3 ist eine Zusage an die
   Modelle — was im Kit liegt, steht auch im Verzeichnis.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Belegt: alle 9 BATS-Tests rot vor der
      Umsetzung (`not ok 1..9`), inklusive der Schema- und D14-Assertions.
- [x] **Fix-Step (GREEN).** p1–p3 umgesetzt; 9/9 BATS und 14/14 Vitest grün.
- [x] **Final Verification.** Gates gefahren, siehe unten.

Der Daemon muss laufen. Läuft bereits einer aus einem **fremden Worktree** auf
dem Standardport, misst die Suite dessen Code — dann einen eigenen Port nutzen:

```bash
COCKPIT_DAEMON_PORT=49156 npx tsx .lavish/kit/daemon/server.ts &

COCKPIT_DAEMON_PORT=49156 COCKPIT_DAEMON_REQUIRED=1 \
  tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit/
npx vitest run tests/unit/cockpit-styles.test.ts

task test:changed
task freshness:regenerate && task freshness:check
```

## Blockiert — aufgelöst

K2 (T002461, PR #3553) ist gemergt; `daemon/server.ts` und die Route-Struktur
existieren. Der Branch wurde vor p3 auf `main` rebased.
