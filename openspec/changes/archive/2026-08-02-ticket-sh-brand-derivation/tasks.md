---
title: ticket-sh-brand-derivation
ticket_id: T002280
domains: [db, test]
status: plan_staged
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ticket-sh-brand-derivation — Implementation Plan

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/ticket.sh` | 870 | sanctioned exception (S1-ignore, `docs/code-quality/gates.yaml`) — kein Zeilenlimit |
| `scripts/vda/ticket/create.sh` | 115 | 385 (nicht gebaselined, Limit 500 für `.sh`) |
| `tests/spec/ticket-system.bats` | 67 | kein S1-Limit für `.bats` |

Root-Cause, Blast-Radius-Prüfung bestehender Aufrufer und die abgewogene
Fail-Closed-vs-Default-Entscheidung stehen in `openspec/changes/ticket-sh-brand-derivation/design.md`
— hier nur die konkreten Änderungsschritte.

**Scope-Abgrenzung (Merge-Konflikt-Vermeidung):** Dieser Plan rührt in `scripts/ticket.sh`
ausschließlich die BRAND/NS-Resolution (Zeilen ~20-45) sowie den `case "$BRAND"`-Block an.
Der `_pgpod`-Selektor (Completed- vs. Running-Pod-Auswahl, an anderer Stelle derselben
Datei) gehört zu T002307 (Welle 2) und wird hier **nicht** angefasst.

## Tasks

### Task 1 — Failing Test schreiben (RED)

Erweitere `tests/spec/ticket-system.bats` um einen neuen Abschnitt, der die
BRAND/NS-Resolution isoliert prüft — **ohne** echten Cluster-Zugriff. Dazu wird
die Resolution-Logik so extrahiert, dass sie unter einem Dry-Run testbar ist:
ein `--resolve-ns-only`-Testhook in `scripts/ticket.sh`, der nach der
BRAND/NS-Auflösung `NS=<wert>` auf stdout schreibt und **vor** jedem
`kubectl exec`/`psql`-Aufruf beendet (kein DB-Zugriff nötig für diesen Test).

```bash
# tests/spec/ticket-system.bats — neuer Abschnitt

@test "ticket.sh: Freitext im --title beeinflusst NS-Auflösung nicht (T002280)" {
  run bash scripts/ticket.sh --resolve-ns-only create --type bug \
    --title "korczewski-home E2E test regression" --description "irrelevant"
  [ "$status" -eq 0 ]
  [[ "$output" == *"NS=workspace"* ]]
  [[ "$output" != *"workspace-korczewski"* ]]
}

@test "ticket.sh: explizites --brand gewinnt gegen widersprüchlichen Freitext (T002280)" {
  run bash scripts/ticket.sh --resolve-ns-only create --type bug --brand korczewski \
    --title "mentolder rollout notes" --description "irrelevant"
  [ "$status" -eq 0 ]
  [[ "$output" == *"NS=workspace-korczewski"* ]]
}

@test "ticket.sh: ungueltiger --brand-Wert wird abgelehnt (T002280)" {
  run bash scripts/ticket.sh --resolve-ns-only create --type bug --brand acme --title "x"
  [ "$status" -eq 2 ]
}

@test "ticket.sh: kein Signal -> Default mentolder bleibt unveraendert (T002280)" {
  run bash scripts/ticket.sh --resolve-ns-only update-status --id T000001 --status done
  [ "$status" -eq 0 ]
  [[ "$output" == *"NS=workspace"* ]]
}
```

**Testrunner-Aufruf (RED erwartet, da `--resolve-ns-only` noch nicht existiert):**
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
# expected: FAIL — `--resolve-ns-only` ist noch kein bekanntes Flag, Tests schlagen fehl
```

### Task 2 — Freitext-Scan aus `scripts/ticket.sh` entfernen, `--resolve-ns-only` Testhook einbauen

In `scripts/ticket.sh`, Zeilen ~20-45 (BRAND/NS-Resolution-Block):

1. Ergänze VOR der bestehenden BRAND-Auflösung ein leichtgewichtiges
   Vorab-Parsing von `--brand <wert>` aus `"$@"` (exakter Flag-Match: nur wenn
   ein Argument literal `--brand` ist, wird das **nächste** Argument als Wert
   übernommen — kein Substring-Scan über beliebige Argumentwerte).
2. Ersetze die bestehende Ableitungs-Priorität durch:
   ```bash
   if [[ -z "${BRAND:-}" ]]; then
     BRAND="${_CLI_BRAND:-}"          # aus explizitem --brand-Flag (Schritt 1)
   fi
   if [[ -z "${BRAND:-}" && -n "${TICKET_NS:-}" ]]; then
     case "$TICKET_NS" in
       workspace)              BRAND="mentolder" ;;
       workspace-korczewski)   BRAND="korczewski" ;;
     esac
   fi
   BRAND="${BRAND:-mentolder}"
   ```
   Die alte `for arg in "$@"; do case "$arg" in korczewski*|...) ... esac; done`-
   Schleife (Freitext-Scan über ALLE Argumente inkl. `--title`/`--description`-
   Werte) wird **vollständig entfernt** — nicht nur eingeschränkt.
3. `--resolve-ns-only` als frühes Top-Level-Flag: wenn gesetzt, gib nach der
   BRAND/NS-Auflösung `NS=$NS` aus und `exit 0` (bzw. `exit 2` bei ungültigem
   `--brand`, bestehende `case "$BRAND"`-Fehlerbehandlung bleibt unverändert),
   **bevor** irgendein `kubectl exec`/`psql`-Aufruf erfolgt. Dies ist der reine
   Test-/Diagnose-Hook aus Task 1 — Produktionsaufrufe verwenden ihn nicht.
4. Stelle sicher, dass das bereits aufgelöste `BRAND` für die von `ticket.sh`
   gesourceten Subcommand-Skripte sichtbar ist, analog zu `NS`/`CTX`/`DB`/`USER`
   (bereits als normale Shell-Variablen im selben Prozess sichtbar, solange
   `create.sh` via `source` im selben Prozess läuft — beim Umsetzen verifizieren,
   ob `source` oder eine echte Subshell verwendet wird, und `export BRAND`
   ergänzen falls nötig).

### Task 3 — `scripts/vda/ticket/create.sh`: eigenen Brand-Default entfernen, Divergenz-Check einbauen

In `scripts/vda/ticket/create.sh`:

1. Ändere `local type="" title="" desc="" brand="mentolder" ...` so, dass
   `brand` **nicht** mehr hartcodiert `"mentolder"` defaultet, sondern aus dem
   von `ticket.sh` bereits aufgelösten `$BRAND` übernommen wird (Fallback nur
   falls `$BRAND` aus irgendeinem Grund leer ist — sollte nach Task 2 nicht
   mehr vorkommen, defensiv trotzdem behandeln mit einer klaren Fehlermeldung
   statt eines stillen zweiten Default-Layers).
2. Wenn `--brand <wert>` explizit an `create` übergeben wird UND dieser Wert
   vom bereits aufgelösten `$BRAND` (top-level) abweicht: `exit 2` mit
   Fehlermeldung, die beide Werte nennt (kein stiller Vorrang für eine der
   beiden Quellen — das war exakt die Lücke, die T002280 verursacht hat).
3. Stimmen beide überein (oder ist `--brand` nicht gesetzt), wird die
   `brand`-Spalte aus `$BRAND` befüllt (bisher: eigener lokaler Default).

### Task 4 — Doku-Hinweis in `scripts/ticket.sh`-Kopfkommentar

Ergänze im Nutzungskommentar am Dateikopf (`# Commands: ...`-Block) einen Satz:
`# BRAND resolution: --brand flag > BRAND env > TICKET_NS env > default mentolder.`
`# Never inferred from free-text --title/--description content (T002280).`

### Task 5 — Verifikation (STRUCT3, PFLICHT)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats   # jetzt GRÜN
task test:changed
task freshness:regenerate
task freshness:check
```

<!-- vitest: kein neuer Test nötig, weil die Änderung ausschließlich Bash-CLI-Logik betrifft (scripts/ticket.sh, scripts/vda/ticket/create.sh), keine website/src-Dateien -->
