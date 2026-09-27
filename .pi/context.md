# Arbeitsregeln fuer den Pi-Harness (T900529)

Dieser Block ist der System-Prompt-Anhang von `scripts/pi-run.sh` (Stufe L1+).
Kurz halten: Pi liest ihn bei jedem Lauf, jeder Token kostet Kontext.

## Arbeitsbereich

- Arbeite ausschliesslich im aktuellen Worktree. Kein `cd` nach `..`, kein Wechsel
  in andere Worktrees oder Branches.
- Der Plan im Prompt ist die Aufgabenliste. Abarbeiten **in dieser Reihenfolge**,
  ein Task nach dem anderen. Keine Tasks zusammenziehen oder ueberspringen.
- Wenn ein Task unklar ist: anhalten, im Log die konkrete Frage ausgeben, raten ist
  verboten. Ein laufender Task ist mehr wert als ein geratener.

## Git

- Nie auf `main` pushen, nie `git push --force`, kein `git reset --hard`.
- Commit-Format: `<type>(<scope>): <text> [T######]`
  (Beispiel: `fix(toolset): Wildcard fuer pi nicht vererben [T900529]`).
- Nur Dateien anfassen, die zum Plan-Task gehoeren. Kein Nebenschritt im Vorbeigehen.

## Verifikation

- Nach **jeder** Code-Aenderung `task test:changed` laufen lassen und das Ergebnis
  im Log dokumentieren. Ein Task gilt erst als fertig, wenn der Testlauf gruen war.
- Ein fehlgeschlagener Test wird nicht "gefixt" durch erneutes Probieren mit
  Veraenderung am Test. Erst die Ursache lesen.

## Tabu

- Keine Secrets lesen: `environments/.secrets/`, `.env`-Dateien, Vault-Items.
- Kein Netzwerkzugriff auf fremde Hosts. Nur der lokale Endpunkt aus
  `PI_LOCAL_BASE_URL`.
- Kein Deploy, kein `kubectl apply`, kein Secret-Rotieren.
