# p4 — Audit-Log in die bestehende Zeitachse

**Rolle:** impl · **Ziel-Dateien:** `tools/dsh/plugins/audit-log.mjs`,
`scripts/dsh/session-audit.sh` · **hängt ab von:** p2

Das Sitzungs-Log von dsh ist append-only und die Quelle des Modellkontexts. Wir leiten daraus
Phasen-Ereignisse ab und schreiben sie in **denselben** Kanal, den `opencode-exec.sh` benutzt —
`scripts/ticket.sh phase` nach `tickets.factory_phase_events`. Eine eigene Tabelle würde die drei
Executor unvergleichbar machen.

- [ ] **4.1 Sitzungs-Ereignisse abonnieren.** Das Plugin hört auf den Sitzungs-Ereignisstrom und
      reagiert auf Turn-Grenzen (`turn/start`, `turn/end` sind durable Session-Events laut
      `docs/architecture.md`). Vor dem Schreiben die tatsächlichen Ereignisnamen und die
      Nutzlast-Form im Quellbaum prüfen.

- [ ] **4.2 Ohne Ticket-ID nichts schreiben.** Fehlt die Ticket-Kennung in der Umgebung, schreibt
      das Plugin nichts und meldet keinen Fehler. Sonst füllt jede beiläufige Sitzung die
      Zeitachse mit Zeilen, die zu keinem Vorgang gehören — und die Zeitachse verliert genau die
      Eigenschaft, wegen der wir sie führen.

- [ ] **4.3 Schmaler Schreibpfad.** `scripts/dsh/session-audit.sh` kapselt den Aufruf von
      `scripts/ticket.sh phase` und baut das `detail`-JSON mit `jq -cn`, wie es
      `opencode-exec.sh` in seiner `phase_event()`-Hilfsfunktion vormacht. Das Feld `executor`
      trägt den Wert `dsh`.

- [ ] **4.4 Schreibfehler dürfen den Lauf nicht anhalten.** Ein fehlgeschlagener Schreibvorgang
      wird protokolliert und verworfen (`|| true`, wie im Vorbild). Ein Audit-Eintrag, der eine
      Sitzung abbricht, kostet mehr als er belegt.

- [ ] **4.5 Beleg.** Eine Sitzung mit gesetzter Ticket-Kennung erzeugt mindestens eine Zeile,
      deren `detail`-JSON `executor` = `dsh` trägt. Der Abfragebefehl wird im Vorgang notiert,
      damit die Messung nachstellbar bleibt.
