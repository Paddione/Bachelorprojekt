# p6 — Web-Oberfläche starten und sichtbar machen

**Rolle:** impl · **Ziel-Dateien:** `scripts/dsh/web-up.sh`, `taskfiles/Taskfile.dsh.yml`,
`Taskfile.yml` · **hängt ab von:** p2, p3, p4

Der Nachweis am laufenden Produkt. Die Oberfläche wird nicht als undokumentierter Prozess auf
einem Port gestartet, sondern als Sitzung registriert — die Registry aus
`openspec/specs/active-sessions-hub.md` führt genau dafür Buch.

- [ ] **6.1 Startskript.** `scripts/dsh/web-up.sh` prüft zuerst den Build und bricht bei
      fehlendem Build mit einer Ursachenmeldung ab. Ohne diese Prüfung scheitert der Start später
      als Portbindungs- oder Modulfehler, und die Ursache steht nicht in der Meldung.

- [ ] **6.2 Bundle laden.** Die Oberfläche wird mit dem Repo-Bundle als Overlay gestartet, damit
      Bridge und natives Plugin aktiv sind. Der Port ist konfigurierbar mit Vorgabe 3080.

- [ ] **6.3 Im Session-Hub registrieren.** Nach erfolgreichem Start
      `bash scripts/session-hub.sh register` mit Typ und Titel aufrufen; `reap` entfernt den
      Eintrag wieder, sobald der Prozess endet. Die Registrierung ist idempotent je Slug.

- [ ] **6.4 Aufgaben.** `taskfiles/Taskfile.dsh.yml` mit `dsh:build`, `dsh:web` und `dsh:doctor`
      anlegen; `dsh:doctor` meldet Klon vorhanden, Build vorhanden, CLI antwortet. In `Taskfile.yml`
      den `includes`-Eintrag ergänzen — dieselbe Form wie die vorhandenen Einträge unter
      `taskfiles/`.

- [ ] **6.5 Vorführung.** Die Oberfläche starten und den Guard-Pfad zeigen: In einer Sitzung mit
      einem Worktree als Arbeitsverzeichnis einen Schreibzugriff auf einen Pfad außerhalb
      anfordern. Erwartet ist eine sichtbare Ablehnung mit Begründung. Beide Wege einzeln
      belegen — nur Bridge aktiv, dann nur natives Plugin aktiv —, damit die Aussage „beide
      setzen dieselbe Regel durch" gemessen und nicht behauptet ist.
