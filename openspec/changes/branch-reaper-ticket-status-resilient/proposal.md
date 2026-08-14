# Proposal: branch-reaper-ticket-status-resilient

## Why

`scripts/branch-reaper.sh` bricht im Sweep-Modus mit Exit 1 ab, sobald eine aus dem
Branch-Namen extrahierte Ticket-ID im Tracker nicht existiert. Der gesamte Sweep stirbt dann
ohne eine einzige REAP-/KEEP-Zeile — alle nachfolgenden Branches bleiben ungeprüft. Das
verwandelte einen belegbaren KEEP-Fall in einen stummen Abbruch.

## Brainstorming (schriftlich)

### Symptom (reproduziert, Fakt)

Minimaler Reproducer: bare Remote, ein Branch `chore/plan-T004396` (ID existiert nicht im
Tracker), ticket.sh-Stub mit Exit 1 (wie `ticket.sh get --id <unbekannt>`), gh-Stub ohne
offene PRs:

```
$ TICKET_SH=<stub-exit-1> bash scripts/branch-reaper.sh --sweep --dry-run
(keine Ausgabe)
EXIT=1
```

Belegt: **Sweep bricht mit Exit 1 ab, keine REAP-/KEEP-Zeile.** (Reproducer-Lauf,
2026-08-14, Bash 5.2.21.)

### Ursachen-Hypothese (aus der Ticket-Beschreibung — WIDERLEGT)

> "Im Subshell bricht set -e vor der inneren Alternative ab" (Zeile
> `ticket_json="$(bash "$TICKET_SH" get --id ... 2>/dev/null || echo '{}')"`).

Isolierter Test (gleiche Shell, gleiche Optionen):

```bash
set -euo pipefail
ticket_json="$(bash stub.sh 2>/dev/null || echo '{}')"   # stub.sh: exit 1
echo "weiter: $ticket_json"                              # -> weiter: {}
```

Läuft durch, Exit 0. Die OR-Liste fängt den Fehler korrekt ab; `set -e` greift dort nicht
(Kommando vor dem finalen `||` ist geschützt). **Die genannte Zeile ist nicht die Ursache.**

### Belegte Ursache (per Trace + Gegenprobe, Fakt)

`bash -x`-Trace des realen Sweeps mit demselben Stub zeigt den Abbruchpunkt in der Zeile
DANACH, der Status-Extraktion:

```bash
status="$(printf '%s' "$ticket_json" \
    | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')"
```

Mechanismus: `ticket_json='{}'` (der Fallback aus der vorigen Zeile, die korrekt greift)
enthält kein `"status"`-Feld → `grep -o` findet keinen Treffer → Exit 1 → mit
`pipefail` ist das der Exit der Pipeline → die Command-Substitution in der Zuweisung
liefert Exit 1 → `set -e` beendet das Skript **bevor** der `case ""`-KEEP-Fallback
("Ticket-Status nicht ermittelbar") erreicht wird. Der KEEP-Fallback ist damit toter Code.

Gegenprobe (Patch in /tmp, `|| true` am Ende der Pipeline): Sweep läuft durch, Exit 0,
Ausgabe `KEEP chore/plan-T004396 — Ticket-Status nicht ermittelbar`.

### Fix-Entscheidung

Die Status-Pipeline wird mit `|| true` abgesichert. Damit greift der bereits vorhandene
`case ""`-Zweig: nicht ermittelbarer Status → KEEP mit Begründung, Sweep läuft weiter.

**Verworfen:** `set +e` in der Subshell der `ticket_json`-Zeile (Ticket-Hypothese) — die
Zeile funktioniert nachweislich; ein Eingriff dort adressiert die Ursache nicht. Ebenso
verworfen: explizite `if`-Prüfung vor dem Lookup — der vorhandene KEEP-Fallback leistet
genau das, was die Prüfung erzwingen würde, und ein größerer Umbau ist für eine
Ein-Zeilen-Ursache unverhältnismäßig.

### Edge-Cases

- `ticket.sh` exit 1 ohne stdout → `ticket_json='{}'` → Status leer → KEEP (Fix-Fall).
- `ticket.sh` exit 0 mit leerer Ausgabe → `ticket_json=''` → Status leer → KEEP (durch
  denselben Fix abgedeckt, vorher ebenfalls Abbruch).
- Status `done`/`archived` → REAP (bestehendes Verhalten, unverändert).
- Status `in_progress`/anderer → KEEP (bestehendes Verhalten, unverändert).
- Einzel-Ticket-Lauf (`--ticket`) durchläuft dieselbe Code-Stelle — Fix deckt beide Modi.

## What

- `scripts/branch-reaper.sh`: Status-Extraktion robust gegen fehlenden `"status"`-Treffer
  machen (`|| true`), damit der vorhandene KEEP-Fallback greift statt des `set -e`-Abbruchs.
- Neue Testdatei `tests/spec/ci-cd/branch-reaper-ticket-status.bats` (Muster
  `tests/spec/ci-cd/branch-reaper-sweep.bats`): Sweep mit nicht-existentem Ticket endet
  Exit 0 und verschont den Branch (KEEP), mit Positiv-Anker REAP für ein existierendes
  done-Ticket im selben Lauf (T002356-M1).

_Ticket: T004892_
