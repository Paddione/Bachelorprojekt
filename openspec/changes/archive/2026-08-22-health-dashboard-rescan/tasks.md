---
title: "health-dashboard-rescan — Implementation Plan"
ticket_id: T013306
domains: [website, sdlc, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# health-dashboard-rescan — Implementation Plan

_Ticket: T013306_

Das Repo Health Dashboard bekommt Checkboxen, einen Rescan-Button und einen Ticket-Button.
Spec-Delta: `openspec/changes/health-dashboard-rescan/specs/health-goals.md` ·
Proposal: `openspec/changes/health-dashboard-rescan/proposal.md`

Tragende Entscheidung: der Rescan ist **read-only gegenüber der SSOT**. Er misst über die
vorhandene CLI und liefert die Werte an den Browser zurück, ohne `.claude/lib/goals.md` oder
`components/website/src/lib/sdlc/goals-data.generated.json` anzufassen (REQ-HEALTH-GOALS-011).

## File Structure

| Datei | Änderung |
|---|---|
| `scripts/health-goals-scan.sh` | NEU — Wrapper um `health-goals-check.sh --only=…` mit `HG_VALUES_FILE`; validiert die IDs gegen das generierte Artefakt und gibt JSON auf stdout aus. Ein nicht gemessenes Ziel erscheint als `measurable: false`, nicht als fehlender Eintrag. |
| `components/website/src/lib/sdlc/repo-root.ts` | NEU — `findRepoRoot()`, aus `openspec/proposal.ts` hierher gezogen, damit Scan und OpenSpec-Routen dieselbe Wurzel bestimmen |
| `components/website/src/lib/sdlc/openspec/proposal.ts` | Lokale `findRepoRoot()`-Kopie durch Import aus `repo-root.ts` ersetzen (52 Zeilen → ca. 42) |
| `components/website/src/lib/sdlc/health-scan.ts` | NEU — spawnt den Wrapper mit Argument-Array, parst dessen JSON, Timeout, typisiertes `ScanResult` |
| `components/website/src/lib/sdlc/health-scan.test.ts` | NEU — Vitest: Parse-Vertrag, unbekannte ID abgelehnt, `measurable: false` bleibt erhalten |
| `components/website/src/lib/sdlc/health-goal-tickets.ts` | NEU — Titel-Präfix, Beschreibung mit Mess-Provenienz, Dedup gegen offene Tickets, Anlage über `scripts/ticket.sh create` |
| `components/website/src/lib/sdlc/health-goal-tickets.test.ts` | NEU — Vitest: Dedup überspringt, Beschreibung trägt ID/Ist/Soll/Messbefehl/Quelle |
| `components/website/src/pages/sdlc/api/health-goals/rescan.ts` | NEU — `POST { ids }` → Scan-Ergebnisse; Admin-Guard, 401 ohne Session |
| `components/website/src/pages/sdlc/api/health-goals/tickets.ts` | NEU — `POST { ids }` → `{ created, skipped }`; Admin-Guard |
| `components/website/src/components/sdlc/GoalsDashboard.svelte` | Checkbox je Ziel, filterstabile Auswahl, Aktionsleiste mit beiden Buttons, Overlay-Anzeige des frischen Werts mit Drift-Kennzeichnung (349 Zeilen → ca. 540) |
| `tests/spec/health-goals/dashboard-rescan.bats` | NEU — BATS: Wrapper-Ausgabe, SKIP-Sentinel als `measurable: false`, unbekannte ID abgelehnt, SSOT bleibt nach einem Lauf byte-gleich |
| `components/website/src/data/test-inventory.json` | regeneriert nach Test-Änderungen |

### Zeilenbudgets (S1)

`docs/code-quality/gates.yaml` → Limits `.sh` 800, `.ts` 900, `.svelte` 1100. Keine der
betroffenen Dateien steht in `docs/code-quality/baseline.json`, es gilt also jeweils das Limit als
wirksame Schwelle.

| Datei | jetzt | erwartet | wirksame Schwelle | Budget danach |
|---|---|---|---|---|
| `scripts/health-goals-scan.sh` | 0 | ca. 130 | 800 | ca. 670 |
| `components/website/src/lib/sdlc/repo-root.ts` | 0 | ca. 25 | 900 | ca. 875 |
| `components/website/src/lib/sdlc/openspec/proposal.ts` | 52 | ca. 42 | 900 | ca. 858 |
| `components/website/src/lib/sdlc/health-scan.ts` | 0 | ca. 95 | 900 | ca. 805 |
| `components/website/src/lib/sdlc/health-goal-tickets.ts` | 0 | ca. 135 | 900 | ca. 765 |
| `components/website/src/pages/sdlc/api/health-goals/rescan.ts` | 0 | ca. 60 | 900 | ca. 840 |
| `components/website/src/pages/sdlc/api/health-goals/tickets.ts` | 0 | ca. 65 | 900 | ca. 835 |
| `components/website/src/components/sdlc/GoalsDashboard.svelte` | 349 | ca. 540 | 1100 | ca. 560 |

Kein Budget liegt nahe null; ein Verkleinerungsschritt ist nicht erforderlich.

## Partials

| id | Plan | Rolle | target_files | depends_on |
|---|---|---|---|---|
| p1 | `tasks.d/p1-scan-wrapper.md` | impl | `scripts/health-goals-scan.sh` | p6 |
| p2 | `tasks.d/p2-scan-client.md` | impl | `components/website/src/lib/sdlc/repo-root.ts`, `components/website/src/lib/sdlc/openspec/proposal.ts`, `components/website/src/lib/sdlc/health-scan.ts`, `components/website/src/lib/sdlc/health-scan.test.ts` | p1 |
| p3 | `tasks.d/p3-ticket-creation.md` | impl | `components/website/src/lib/sdlc/health-goal-tickets.ts`, `components/website/src/lib/sdlc/health-goal-tickets.test.ts` | |
| p4 | `tasks.d/p4-api-routes.md` | impl | `components/website/src/pages/sdlc/api/health-goals/rescan.ts`, `components/website/src/pages/sdlc/api/health-goals/tickets.ts` | p2, p3 |
| p5 | `tasks.d/p5-dashboard-ui.md` | impl | `components/website/src/components/sdlc/GoalsDashboard.svelte` | p4 |
| p6 | `tasks.d/p6-tests.md` | tests | `tests/spec/health-goals/dashboard-rescan.bats`, `components/website/src/data/test-inventory.json` | |

`p6` hat keine Vorbedingung und läuft zuerst: sein BATS-Test beschreibt den Vertrag von
`scripts/health-goals-scan.sh` und ist rot, solange das Skript fehlt. `p1` hängt deshalb an `p6`.
`p2` hängt an `p1`, weil der TypeScript-Client das JSON-Format des Wrappers parst. `p4` braucht
beide Bibliotheken, `p5` braucht die Routen. `p3` ist unabhängig und kann parallel laufen.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** `p6` legt `tests/spec/health-goals/dashboard-rescan.bats` an.
      Der Test ruft `scripts/health-goals-scan.sh` auf und prüft dessen Ausgabe. Auf dem aktuellen
      Branch existiert das Skript nicht, der Test schlägt fehl.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/dashboard-rescan.bats
# expected: FAIL (rot — scripts/health-goals-scan.sh existiert noch nicht)
```

- [ ] **Implementierung (GREEN).** `p1` bis `p5` umsetzen. Danach ist derselbe BATS-Lauf grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/dashboard-rescan.bats
# expected: PASS
```

- [ ] **Bestehende Health-Goal-Guards bleiben grün.** Die Änderung darf die vorhandenen
      Invarianten dieser Spec nicht verletzen — insbesondere nicht die Messintegrität:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/
```

- [ ] **Website-Unit-Tests.** Die beiden neuen Vitest-Dateien laufen mit. Läuft der Aufruf im
      Worktree in die bekannte Symlink-Falle, wird er im Haupt-Checkout unter
      `components/website` wiederholt — eine Skip-Meldung zählt nicht als grün:

```bash
cd components/website && pnpm vitest run src/lib/sdlc/health-scan.test.ts src/lib/sdlc/health-goal-tickets.test.ts
```

- [ ] **SSOT-Invariante von Hand gegenprüft.** Nach einem Rescan-Lauf dürfen die beiden
      Wert-Dateien keinen Diff zeigen:

```bash
git diff --stat -- .claude/lib/goals.md components/website/src/lib/sdlc/goals-data.generated.json
# expected: leer
```

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
