# Proposal: branch-reaper-sweep-empty-answer

## Why

**Symptom (belegt, repo-hygiene-Lauf 2026-08-15):** Der Sweep-Modus von
`scripts/branch-reaper.sh` bricht unter `set -euo pipefail` still mit Exit 1 ab, sobald er einen
Branch erreicht, dessen Ticket-ID nicht in der DB existiert. Folge: 10 REAP-Kandidaten wurden
entschieden, aber kein einziger Delete lief — ohne jede Meldung. Die Ausgabe endet unvermittelt am
letzten erfolgreich geprüften Branch.

**Hypothese aus dem Ticket:** `ticket.sh get --id T004396` liefere rc=0 mit leerer Ausgabe, der
`|| echo '{}'`-Fallback greife nicht, und die Status-Extraktion sterbe an grep Exit 1 unter
pipefail.

**Ursachen-Verifikation (T002448-M5, Reproducer ausgeführt am 2026-08-15):**

```bash
bash scripts/ticket.sh get --id T004396 2>/dev/null   # rc=0, stdout Länge 0 — bestätigt
bash -c 'set -euo pipefail
ticket_json=""
status="$(printf "%s" "$ticket_json" | grep -o '"'"'"status"[[:space:]]*:[[:space:]]*"[^"]*"'"'"' | head -1 | sed '"'"'s/.*:[[:space:]]*"//; s/"$//'"'"')"
echo "after-status"'  # rc=1, "after-status" wird NIE erreicht — bestätigt
```

Damit ist beides belegt: (a) die leere Antwort bei rc=0, (b) der stille Abbruch an der
Status-Extraktion. Der `""`-Zweig im `case` („Ticket-Status nicht ermittelbar") ist dadurch
unerreichbarer Dead Code. Die Trennung Symptom/Ursache ist eindeutig: das Symptom ist der stille
Exit 1, die Ursache ist die ungesicherte grep-Pipeline bei leerer Eingabe.

## What

Die Status-Extraktion in `scripts/branch-reaper.sh` gegen leere `ticket_json`-Antworten
absichern, sodass ein nicht existierendes Ticket als „Status nicht ermittelbar" → `KEEP` mit
Begründung gewertet wird, statt den gesamten Sweep still zu beenden. Der bestehende `""`-Zweig
des `case` wird damit erreichbar (kein neuer Ausgabevertrag, keine neue Meldung). Der Fix heilt
Sweep- und Einzel-Ticket-Lauf gleichermaßen, da beide dieselbe Code-Stelle nutzen.

Der Fix wird durch einen BATS-Test rot-grün abgesichert
(`tests/spec/ci-cd/branch-reaper-empty-answer.bats`), der gegen ein Fixture-Repo mit
`TICKET_SH`-Stub (leere Antwort bei rc=0 für die Problem-ID) die Durchlauf-Semantik prüft
(Output-Verifikation, Positiv-Anker).

_Ticket: T006329_
