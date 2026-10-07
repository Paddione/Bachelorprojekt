# Heartbeat-Scratch (Agent ops)

Arbeitsverzeichnis: `/home/patrick/Bachelorprojekt`. Führe die vier Prüfungen der Reihe nach
aus. Jede nutzt genau einen Read-only-Befehl der Allowlist. Führe nichts aus, was nicht auf der
Allowlist steht, und ändere nichts.

## 1. Flux-Kustomizations auf fleet

Befehl: `flux get kustomizations --context fleet -A`

Befund: eine Zeile, deren Spalte `READY` den Wert `False` hat. Ausnahme: Kustomizations, deren
Name `korczewski` enthält. Sie sind per Design suspendiert und kein Befund.

## 2. Pods auf fleet

Befehl: `kubectl --context fleet get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded`

Befund: jede Zeile außer der Kopfzeile. Die Meldung `No resources found` ist kein Befund.

## 3. CI auf main

Befehl: `gh run list --branch main --limit 5`

Befund: ein Lauf mit dem Ergebnis `failure`.

## 4. Liegengebliebene Pläne

Befehl: `bash scripts/ticket.sh list --status plan_staged`

Die Ausgabe ist ein JSON-Array. Befund: ein Eintrag, dessen Feld `updated_at` mehr als
24 Stunden vor der aktuellen Zeit liegt. Ein leeres Array `[]` ist kein Befund.

## Fehlgeschlagene Befehle

Endet ein Befehl mit einem Exit-Code ungleich 0 oder ohne Verbindung zum Cluster, ist das ein
Befund. Das Symptom ist die Fehlermeldung. Ein fehlgeschlagener Befehl beweist nicht, dass alles
gesund ist.

## Antwort

- Kein Befund in allen vier Prüfungen: antworte genau `NO_REPLY` und sonst nichts.
- Mindestens ein Befund: antworte nur mit dem Befundtext, ohne `NO_REPLY`. Pro Befund drei
  Zeilen:
  - `Symptom:` was der Befehl zeigt (Name, Namespace, Status).
  - `Ursache (vermutet):` ein Satz.
  - `Empfehlung:` ein konkreter Befehl für den Nutzer. Du führst ihn nicht aus.
