# Design: branch-reaper-sweep-empty-answer

## Root-Cause

`scripts/ticket.sh get --id <id>` liefert für nicht existierende Tickets **rc=0 mit leerer
stdout** (kein JSON, kein Fehlertext). In `scripts/branch-reaper.sh` Zeile 204–207:

```bash
ticket_json="$(bash "$TICKET_SH" get --id "$branch_ticket_id" 2>/dev/null || echo '{}')"
status="$(printf '%s' "$ticket_json" \
  | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' \
  | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')"
```

- `|| echo '{}'` greift nur bei Exit ≠ 0 — rc=0 mit leerer Ausgabe lässt `ticket_json` leer.
- Leere Eingabe in die Pipeline → `grep` endet mit 1 → unter `set -euo pipefail` wird der
  Pipeline-Exit 1 der Command-Substitution → das Skript stirbt **still** (kein Fehlertext,
  kein KEEP). Exakt im Reproducer verifiziert (rc=1, nachfolgende Zeile unerreichbar).

## Fix-Ansatz (Entscheidung)

**Pipeline-Rest absichern statt Vorab-Check:** das Ende der Status-Extraktion mit `|| true`
abfangen, sodass `status=""` gesetzt wird. Der vorhandene `case`-Zweig

```bash
"") echo "KEEP $branch — Ticket-Status nicht ermittelbar"; continue ;;
```

wird damit erreichbar — die Semantik „nicht ermittelbar → verschonen" war bereits intendiert
(der Zweig existiert seit T003180) und ist der etablierte KEEP-Vertrag. Kein neuer Wortlaut,
keine neue Ausgabezeile, kein neues Verhalten außerhalb des Defekts.

Verworfen: Vorab-Prüfung auf `[ -n "$ticket_json" ]` — redundant, da der `case` den leeren
Status ohnehin als KEEP behandelt; ein zweiter Prüfpfad verdoppelt die Fehlerflächen.

## Betroffene Subsysteme

- `scripts/branch-reaper.sh` — einzige Code-Änderung (Zeile 205–207, Pipeline-Ende).
- Beide Aufruf-Modi betroffen und beide geheilt: `--sweep` und `--ticket <id>` teilen dieselbe
  Lookup-Stelle.
- `TICKET_SH`-Env-Override bleibt unverändert (Testbarkeit, bestehender Vertrag).

## Edge-Cases

- **Leere Antwort bei rc=0** (Ticket existiert nicht) → `status=""` → KEEP „nicht ermittelbar".
  Bewusst **kein** REAP: „leere Antwort ist kein Urteil" (T003074) — ein nicht auffindbares
  Ticket darf einen Branch nicht freigeben.
- **gültiges JSON mit status done/archived** → REAP (unverändert).
- **gültiges JSON mit anderem Status** → KEEP mit Status (unverändert).
- **Fehlerhafter ticket.sh-Aufruf (rc≠0)** → `|| echo '{}'` liefert `{}`, Extraktion findet
  kein status → KEEP „nicht ermittelbar" (unverändert).
- Die Absicherung greift nur am Pipeline-Ende; der `|| echo '{}'`-Fallback für rc≠0 bleibt
  bestehen.

## Test-Strategie

Neuer BATS-Test `tests/spec/ci-cd/branch-reaper-empty-answer.bats` (eigene Datei pro Vorgang,
T002416) gegen ein Wegwerf-Fixture-Repo mit `TICKET_SH`-Stub: Der Stub antwortet für die
Problem-ID mit **rc=0 und leerer stdout**, für andere IDs mit `{"status":"done"}`. Struktur
analog `branch-reaper-sweep.bats` (kein `cd`, absolute Pfade, `git -C`).

- Positiv-Anker (T002356-M1): Sweep über Branch mit done-Ticket → REAP-Zeile (Lauf funktioniert).
- Kernaussage: Sweep mit Branch, dessen ID leer antwortet → Exit 0, KEEP-Zeile für den Branch,
  und ein NACH ihm liegender Branch wird noch evaluiert (kein Abbruch).
- Output-Verifikation (T002448-M4): geprüft werden Exit-Code und Ausgabezeilen, nicht Source.
