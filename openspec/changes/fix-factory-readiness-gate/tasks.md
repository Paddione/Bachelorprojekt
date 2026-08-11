---
title: Readiness-Gate vor dem Factory-Launch aufhängen
ticket_id: T003773
domains: [bachelorprojekt-test, bachelorprojekt-infra]
status: plan_staged
---

# Readiness-Gate vor dem Factory-Launch aufhängen — Implementation Plan

## File Structure

| Datei | Art | Zeilen jetzt | nach Change (geschätzt) | S1-Budget (.sh = 500) |
|---|---|---|---|---|
| `tests/spec/software-factory/readiness-gate-before-launch.bats` | neu, bereits committet | 90 | 90 | n/a (Testdatei) |
| `scripts/factory/dispatcher-bridge.sh` | geändert | 160 | ~175 | 325 frei |
| `scripts/factory/opencode-exec.sh` | geändert | 154 | ~166 | 334 frei |
| `openspec/changes/fix-factory-readiness-gate/specs/software-factory.md` | Delta | — | — | n/a |

Keine Datei nähert sich ihrem Budget; ein Modul-Split ist nicht erforderlich.

## Partials

- **p1 (tests + implementation):** ein einziges Partial. Der Change berührt zwei
  Skripte mit einem gemeinsamen Guard-Aufruf; eine Aufteilung würde die beiden
  Verteidigungslinien voneinander trennen, die genau zusammen geprüft werden.

---

## Task 1 — Failing Test (bereits rot, expected: FAIL)

Der Test ist im Stage-Commit dieses Plans enthalten und läuft rot. Verifiziert
am 2026-08-11 gegen `origin/main`:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/readiness-gate-before-launch.bats
# expected: FAIL — 1 ok (Positiv-Anker), 3 not ok
```

Belegter Ist-Zustand dieses Laufs:

```
ok 1     T003773: Launch-Zeile mit existierendem Branch UND Plan wird gelauncht
not ok 2 T003773: planlose Launch-Zeile (branch/plan_path="null") wird NICHT gelauncht
not ok 3 T003773: der Skip nennt den Readiness-Grund, statt still zu verschwinden
not ok 4 T003773: ein Branch ohne die Plan-Datei wird als no_plan_on_branch abgelehnt
```

Test 1 ist der Positiv-Anker nach T002356-M1: er ist grün und belegt, dass der
Test den Launch-Pfad überhaupt erreicht. Ohne ihn bestünden 2–4 auch dann, wenn
`dispatcher-bridge.sh` gar nichts mehr launchte.

## Task 2 — Readiness-Guard in `dispatcher-bridge.sh` aufhängen

In der Launch-Schleife (`scripts/factory/dispatcher-bridge.sh`, nach dem Lesen
von `branch`/`plan_path`/`wt_path`, **vor** dem Budget-Guard) den bestehenden
Guard sourcen und aufrufen:

```bash
source "$HERE/readiness-check.sh"
readiness_json="$(check_ticket_readiness "$branch" "$plan_path")" || {
  reason="$(printf '%s' "$readiness_json" | jq -r '.reason // "unknown"')"
  echo "dispatcher-bridge: $ext_id not ready (readiness=$reason) — skipping launch" >&2
  BRAND="$brand" bash "$REPO/scripts/factory/release-slot.sh" "$ext_id" "$brand" 2>/dev/null || true
  continue
}
```

Bedingungen:

- Der Aufruf steht **vor** `budget-guard.sh`, damit ein planloses Ticket kein
  Budget und keinen Gang-Slot verbraucht.
- Die Meldung nennt Ticket **und** Grund. Ein stiller Skip ist der Defekt, den
  T003269 für die Prep-Datei bereits einmal beheben musste — das Fließband stand
  daraufhin wochenlang ohne Fehlermeldung.
- Keine eigene `"null"`-Normalisierung an dieser Stelle: `readiness-check.sh:11`
  behandelt den Literalstring bereits als `missing_args`. Eine zweite Prüfung
  wäre die Duplikation, die das MODIFIED-Requirement ausdrücklich untersagt.
- `release-slot.sh` ist best-effort (`|| true`): ein fehlgeschlagener
  Slot-Release darf den Tick nicht abbrechen, sonst blockiert ein einzelnes
  Ticket die gesamte Schleife.

Prüfen, dass `release-slot.sh` die erwartete Signatur hat, bevor der Aufruf so
geschrieben wird — `bash scripts/factory/release-slot.sh --help` bzw. der Kopf
der Datei. Weicht sie ab, wird die Aufrufform angepasst, nicht das Skript.

## Task 3 — Zweite Verteidigungslinie in `opencode-exec.sh`

In `scripts/factory/opencode-exec.sh` direkt nach dem Einlesen der Positionals
(Zeile 14 ff.):

```bash
[[ "$BRANCH"    == "null" ]] && BRANCH=""
[[ "$PLAN_PATH" == "null" ]] && PLAN_PATH=""
if [[ -z "$BRANCH" || -z "$PLAN_PATH" ]]; then
  phase_event blocked orchestrator all 0 2
  echo "opencode-exec: $EXT_ID ohne Branch/Plan — Abbruch statt Lauf im Haupt-Checkout" >&2
  exit 2
fi
```

Bedingungen:

- Der Abbruch erfolgt **vor** dem `LAUNCH_DIR`-Fallback auf `$REPO`. Genau dieser
  Fallback führte am 2026-08-11 dazu, dass der T003740-Lauf im Haupt-Checkout
  einen fremden Branch rebasete und umbenannte.
- `phase_event` wird erst nach seiner Definition im Skript aufgerufen — die
  Funktion steht dort aktuell weiter unten, der Guard gehört also hinter die
  `phase_event`-Definition und vor `phase_event entered`.
- Exit 2, nicht 1: unterscheidbar vom „opencode-Binary nicht gefunden"-Pfad, der
  aus demselben Grund bereits 2 statt 127 verwendet. Beim Anpassen prüfen, ob
  die beiden Fälle im Journal unterscheidbar bleiben; falls nicht, einen
  eigenen Code wählen und im Skriptkopf dokumentieren.
- Das `detail`-JSON trägt `reason=no_plan`. `phase_event` baut `detail` derzeit
  aus fünf festen Feldern — die Signatur muss um den Grund erweitert werden,
  ohne bestehende Aufrufer zu brechen (Default leer).

## Task 4 — Grünlauf und Regression

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/readiness-gate-before-launch.bats
# expected: PASS — 4 ok

# Bestandstests der berührten Skripte dürfen nicht rot werden:
tests/unit/lib/bats-core/bin/bats tests/unit/factory-readiness.bats
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory*
```

Zusätzlich manuell gegen ein reales Prep-File verifizieren, dass eine Zeile mit
gültigem Branch und Plan weiterhin launcht — der Positiv-Anker deckt das im Test
ab, aber der Dry-Run zeigt die Meldungsform, die im Journal landet:

```bash
bash scripts/factory/dispatcher-bridge.sh <prep-file> --dry-run
```

## Task 5 — Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Nachlauf (nicht Teil dieses Changes, aber vor dem Merge zu bedenken)

Der Factory-Killswitch steht seit dem 2026-08-11 global auf `on`
(`ticket.sh factory-control set --key killswitch --value on`), damit während der
Arbeit an diesem Fix kein weiterer Lauf den Haupt-Checkout anfasst. Er muss nach
dem Merge bewusst zurückgesetzt werden:

```bash
bash scripts/ticket.sh factory-control set --key killswitch --value off
bash scripts/ticket.sh factory-control get --key killswitch   # erwartet: off
```

Solange er `on` steht, läuft die Factory nicht — auch nicht für die 8 Tickets mit
gestagtem Plan.
