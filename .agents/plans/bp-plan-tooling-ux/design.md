# Design: bp-plan-tooling-ux

## Entschiedene Fragen

1. STRUCT2-Fehlermeldung: Dateibezug + Regeltext in jede FAIL-Zeile.
   Dateibezug ist der repo-relative Pfad der geprueften Datei (Single-Modus
   der Plan selbst, Partial-Modus das Tests-Partial ueber `STRUCT2_FILE`),
   ausserhalb des Repos der Basisname. Regeltext zitiert die zwei
   unterscheidenden Saetze aus `--rules`: echte Runner-Alternative und
   Final-Verify-Ausschluss (`does NOT count`). Kein neuer Parser, nur
   Meldungsbau an den zwei bestehenden `hard`-Stellen.
2. T002453-C-Fehlermeldung: behaelt Datei, Token und Limit und zitiert zusaetzlich
   den kanonischen Regelsatz (`~28000 chars`, `split the slot otherwise`), damit
   der naechste Fan-out-Dispatch das Budget vor dem Schreiben kennt. Die
   Pruefung bleibt post-hoc (Datei muss existieren); die Vorab-Wirkung entsteht
   ueber die Meldung, nicht ueber einen neuen Pre-Write-Hook.
3. Schritt-7-Status: drei Ausgaenge statt zwei. `completed` bleibt Skip,
   aktiv-Zustaende (`active|plan_staged|in_progress|planning`, genau ein
   Vorkommen im Hauptskript) bleiben Markieren+Commit. Jeder andere Status
   (`draft`, `staged`, Tippfehler) ist `ERROR: Schritt 7` mit Statusnennung,
   Exit 1, Worktree erhalten. Begruendung: fail-closed; ein unbekannter Status
   ist kein Beleg fuer Abschluss. `_plan_frontmatter_state` meldet dafuer
   `completed`, `stale` oder nichts (Exit 1 ohne Ausgabe).
4. Unaufloesbarer Plan im Worktree bei vorhandenem Worktree: `ERROR: Schritt 7`
   statt `[warn]`, Exit 1. Idempotenz bleibt: korrekter erneuter Aufruf mit
   `--plan` oder `--no-plan` laeuft durch.
5. `plan_stage`/`plan_lint`: `repo`-Argument (Pfad oder Alias wie bei
   `context_for_task`) ins Input-Schema, Aufloesung ueber `resolveRepo` plus
   Pruefung (Verzeichnis vorhanden und Git-Repo, sonst Fehler mit `repo` im
   Text) vor jeder Worktree-Anlage. `planStage` beharrt zusaetzlich auf einem
   Git-Repo als Ziel. Gilt fuer beide Tools (gleiche Ursache, zwei Aufrufe).
6. Cross-Repo: die `server.mjs`/`plan-stage.mjs`-Aenderung landet per eigenem
   Commit im mcp-servers-Checkout; der Beleg (erweiterte
   `test_plan_stage.py`) laeuft im Bachelorprojekt gegen `MCP_SERVERS_HOME`.

## Nicht entschieden (braucht keine Entscheidung)

- Reihenfolge der Manifest-Pruefung (STRUCT-PARTIAL vor STRUCT2) bleibt.
- Exit-Codes und Idempotenz des Finalizers bleiben.
