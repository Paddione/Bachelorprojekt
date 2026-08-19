# p1 — Harness-Enum erweitern

**Rolle:** impl · **Ziel-Dateien:** `scripts/agent-guide/validate.mjs` (Budget 630 Zeilen),
`docs/agent-guide/registry/tools.yaml`, `docs/agent-guide/maps/tools-map.md`

Der Zwei-Harness-Vertrag aus `openspec/specs/harness-workflow-split.md` wird bewusst erweitert.
Die Delta-Datei `specs/harness-workflow-split.md` dieses Changes hält die neue Fassung.

- [ ] **1.1 Enum erweitern.** In `scripts/agent-guide/validate.mjs` die zulässigen
      `harness`-Werte um `dsh` und `all` ergänzen. Die Prüfung sitzt bei `HARNESS_VALUES`
      (Aufruf in Zeile 101–102: `req(HARNESS_VALUES.includes(t.harness), ...)`). Die
      Fehlermeldung nennt weiterhin die vollständige Werteliste, damit ein Tippfehler die
      erlaubten Werte anzeigt.

- [ ] **1.2 Bedeutung von `both` festhalten.** Ein Kommentar direkt an der Konstante hält fest:
      `both` heißt weiterhin „Claude Code und opencode", `all` heißt „alle erklärten Harnesses
      inklusive dsh". Ohne diese Notiz liest ein späterer Bearbeiter `both` als „alle" und
      erweitert 9 bestehende Einträge stillschweigend um eine Zusage, die niemand geprüft hat.

- [ ] **1.3 Registry-Einträge setzen.** In `docs/agent-guide/registry/tools.yaml` nur die
      Einträge anfassen, die unter dsh tatsächlich erreichbar sind. Die bestehenden 9 `both`-,
      7 `claude`- und 4 `opencode`-Werte bleiben unverändert — dieser Vorgang fügt einen Wert zur
      Auswahl hinzu, er stuft keine bestehende Zusage um.

- [ ] **1.4 Karte regenerieren.** `bash scripts/vda.sh oracle 'regenerate the agent guide maps'`
      ausführen und das Ergebnis in `docs/agent-guide/maps/tools-map.md` übernehmen. Die Datei ist
      generiert; ein Handeintrag wird beim nächsten Lauf überschrieben.

- [ ] **1.5 Validator läuft.** `node scripts/agent-guide/validate.mjs` (bzw. der Task, den das
      Orakel dafür nennt) meldet `ok`.
