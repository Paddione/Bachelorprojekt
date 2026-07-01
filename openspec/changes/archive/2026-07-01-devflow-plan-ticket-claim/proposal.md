# Proposal: devflow-plan-ticket-claim

## Why

`dev-flow-plan`s Feature-Pfad claimt in Schritt B.1 nur die `branch`-Scope über
`agent-lock.sh` — nie die `ticket`-Scope. Der Pre-Commit-Guard in Schritt 5 (eingeführt
durch T001268-M2) prüft aber `.git/agent-locks/ticket__$TICKET_EXT_ID.json`, eine Datei,
die im Feature-Pfad nie erzeugt wird. `jq -r '.branch' <fehlende-datei>` liefert (dank
`2>/dev/null`) einen leeren String; der nachfolgende Branch-Vergleich schlägt dadurch
mit einem irreführenden `FATAL: branch mismatch` fehl, obwohl die Session korrekt auf
ihrem eigenen, per Branch-Claim geschützten Branch arbeitet. Herkunft: Mishap aus
T001374 M2.

## What

Der Feature-Pfad erhält einen expliziten `agent-lock.sh claim ticket`-Schritt, platziert
dort, wo die Ticket-ID im Feature-Pfad tatsächlich zuerst bekannt ist:

- **Schritt B.1** — bedingter Claim, falls `TICKET_EXT_ID` bereits vorab (z. B. von
  `feature-intake`) übergeben wurde.
- **Schritt 4.5** — Claim direkt nach Ticket-Erzeugung/-Wiederverwendung, bevor
  Schritt 5 den Guard ausführt (Regelfall).

Zusätzlich wird der Guard-Check in Schritt 5 gehärtet: eine explizite
Lock-Datei-Existenzprüfung (`[ -f "$LOCK_FILE" ]`) mit dedizierter Fehlermeldung geht
der `jq`-Auswertung voran, damit "kein Claim vorhanden" nicht mehr mit "Branch weicht
ab" verwechselt wird.

Reiner Skill-Text-Fix in `.claude/skills/dev-flow-plan/SKILL.md` — keine Logikänderung
an `scripts/agent-lock.sh`, kein Verhaltenswechsel im Fix-Pfad (der bereits korrekt
beide Scopes in Schritt 2.5 claimt).

_Ticket: T001386_
