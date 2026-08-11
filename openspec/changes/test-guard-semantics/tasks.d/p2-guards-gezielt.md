# p2 — Drei Guards reparieren

**Dateien (disjunkt):** `tests/spec/openspec-workflow/ticket-file-required.bats`,
`tests/spec/sdlc-cockpit/redesign-struktur.bats`, `tests/spec/local-llm-proxy.bats`
**Deckt:** T002934, T003615, T003291

- [ ] **T002934 — `ticket-file-required.bats` auf den PR-Diff scopen.** Zeile 30 iteriert heute
      ueber den Gesamtbestand:

      ```bash
      for d in "$REPO"/openspec/changes/*/; do
      ```

      Folge: fehlt EINE `.ticket`-Datei auf `main`, faellt der Guard in JEDEM gleichzeitig offenen
      PR — auch in solchen, die OpenSpec nicht beruehren. Belegt am 2026-08-09: zwei fehlende
      Dateien faerbten #3963, #3961 und #3957 rot, keiner dieser PRs beruehrte die betroffenen
      Changes.

      Umbauen auf: die gegen `origin/main` geaenderten Change-Verzeichnisse pruefen; laeuft der
      Test auf `main` selbst (kein Diff), den Vollbestand pruefen. Damit bleibt der Merge-Gate-Wert
      erhalten, ohne fremde PRs zu treffen.

      **Der teure Teil ist nicht der Fehler, sondern die Behebung:** nach dem Fix-Merge muss jeder
      betroffene PR EINZELN per `gh pr update-branch` nachgezogen werden. #3961 fiel deshalb zweimal
      am selben Guard, weil sein erstes `update-branch` vor dem Merge lag. Der Fehler faechert ueber
      die Zahl der offenen PRs auf, die Behebung ebenso — das ist der eigentliche Grund fuer das
      Scoping.

      Beide Richtungen zusichern: PR ohne Change-Beruehrung bleibt gruen, `main` mit Luecke wird rot
      und nennt das Verzeichnis.

- [ ] **T003615 — `redesign-struktur.bats` auf Import-Statements einschraenken.** Test 242 ("keine
      verwaisten Importe auf entfernte Komponenten") sucht per `grep -rF` den nackten
      Komponentennamen ueber alle `.svelte`/`.astro`/`.ts` und trifft damit **Kommentare**, die den
      Namen nur historisch erwaehnen. PR #4209 war deshalb rot: `DispatchLogPanel.svelte` trug im
      Kopfkommentar "WICHTIG (wie PipelinePanel, E22)" — kein Import, nur String-Match. Der Autor
      musste die historische Referenz aus dem Kommentar loeschen, damit CI gruen wurde.

      Auf Import-Statements matchen (`import … from '…PipelinePanel…'`) statt auf den blossen Namen.

      **Positiv-Anker Pflicht:** Der Test muss weiterhin rot werden, wenn ein echter verwaister
      Import existiert. Erst diesen Fall zusichern, dann den Kommentarfall als Negativaussage — ohne
      den Anker ist die leere Kandidatenliste trivial erfuellt (T002356-M1).

- [ ] **T003291 — Slot-Header ueber einen echten Request pruefen.** `tests/spec/local-llm-proxy.bats`
      (Zeilen um 451) sichert "response includes x-llm-proxy-slot header when slot present" per
      `grep -q "x-llm-proxy-slot" scripts/llm-proxy/server.mjs` zu. Das belegt nur, dass die
      Zeichenkette in der Datei steht — der Test bliebe gruen, wenn der Header in einem nie
      erreichten Zweig gesetzt wird oder nur in einem Kommentar vorkommt.

      **Der Fall ist nicht theoretisch:** derselbe Vorgang hat gezeigt, dass der korrespondierende
      Eingang `x-slot-id` von KEINEM Aufrufer gesetzt wird. Der Test hat die Wirkungslosigkeit der
      Funktion nicht bemerkt, weil er das Verhalten nie ausfuehrt.

      Umbauen: echten Request gegen ein Fake-Backend absetzen und den Antwort-Header pruefen. Die
      dafuer noetige Testinfrastruktur ist mit T003277 (`done · shipped`) vorhanden — vor dem Umbau
      pruefen, welche Helfer sie bereitstellt, statt eine zweite zu bauen.

      Diese Datei ist die **Sammelform** `tests/spec/local-llm-proxy.bats`. Sie wird geaendert, nicht
      erweitert; neue `@test`-Bloecke gehoeren nach `tests/spec/local-llm-proxy/` (T002416). Nicht mit
      `tests/spec/local-llm-proxy/loadout-env-property.bats` verwechseln — die gehoert zu p3.
