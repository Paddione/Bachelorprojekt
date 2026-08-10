# P4 — Tests: Rotphase, Failover gegen Stubs, Lint-Erweiterung

**Rolle:** tests · **Zieldateien:** `scripts/llm-proxy/bge-routes.test.mjs`,
`tests/spec/local-llm-proxy/bge-role-routes.bats`,
`tests/spec/local-llm-proxy/gateway-consumer-lint.bats`, `Taskfile.yml`,
`.github/workflows/ci.yml` · **depends_on:** P1

**Prüfmodus** (Header-Konvention T002448-M4): Punkte 1–2 verifizieren **Kommandoausgabe und
Ergebnis** — HTTP-Status, Header, Body gegen laufende Stubs. Punkt 3 ist Source-Grep, die
dokumentierte Ausnahme: ob eine Datei einen verbotenen Port nennt, manifestiert sich
ausschließlich im Quelltext.

Geprüft wird gegen **Stub-Upstreams**, nicht gegen echtes bge. CI hat weder Cluster noch GPU noch
die bge-Modelldateien; ein Test gegen echtes bge misst dort die Ausstattung des Runners statt den
Zustand des Codes (T002716). Der entscheidende Fall — „nimmt die Verbindung an und antwortet
nie" — ist mit echtem bge kaum reproduzierbar, mit einem Stub trivial.

## Tasks

- [ ] **RED zuerst: `tests/spec/local-llm-proxy/bge-role-routes.bats`.** Der Test schickt
      `POST :18235/v1/embeddings` und erwartet `200` plus einen nichtleeren
      `x-llm-proxy-bge-upstream`-Header. Heute rot, weil die Route nicht existiert (der Proxy
      antwortet auf unbekannte Pfade nicht mit 200).

      **Positiv-Anker im selben Test** (T002356-M1): davor belegt ein `GET :18235/v1/models`,
      dass der Proxy überhaupt antwortet. Ohne ihn bestünde die Aussage vakuos, sobald der Proxy
      schlicht nicht läuft.

      **Erreichbarkeits-Guard in der Rotphase** (dev-flow-plan): ist `:18235` nicht besetzt,
      `skip` statt Fehlschlag — sonst misst der Test in CI die Ausstattung des Runners.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/bge-role-routes.bats
# expected: FAIL (rot — die Rollen-Routen existieren noch nicht)
```

      Beide Richtungen verifizieren: mit laufendem Proxy läuft der Test und ist rot; ohne
      laufenden Proxy skippt er sauber.

- [ ] **`scripts/llm-proxy/bge-routes.test.mjs` — Failover gegen Stubs.** Muster wie
      `server.test.mjs` / `local-only.test.mjs` im selben Verzeichnis. Vier Stub-Sorten:
      *verweigert* (Port ohne Lauscher), *schweigt* (nimmt an, antwortet nie), *fehlerhaft*
      (`500`), *ablehnend* (`400`). Fälle:

      1. erstes Glied verweigert, zweites antwortet → `200`, Header nennt das **zweite**
      2. erstes Glied schweigt → nach Ablauf des Timeouts antwortet das zweite (mit kurz
         gesetztem Timeout, damit der Test nicht 30 s braucht)
      3. erstes Glied liefert `400` → Antwort ist `400`, das zweite wird **nicht** kontaktiert.
         Der Nachweis hängt an einem Zähler im zweiten Stub, nicht an der Laufzeit — sonst
         belegt der Test nur, dass es schnell ging
      4. alle Glieder tot → `503`, und der Body nennt **je Glied** einen Grund (Anzahl der
         Gründe gleich Kettenlänge)
      5. Loadout-Glied startet nicht innerhalb des Budgets → die Kette rückt weiter, statt den
         Request zu verschlucken

- [ ] **Portwahl der Stubs.** Ephemere Ports vom Betriebssystem vergeben lassen (`listen(0)`),
      keine festen Nummern. Unter WSL2 sind Bereiche wie 49152–49251 von Hyper-V reserviert und
      liefern `EADDRINUSE` ohne sichtbaren Lauscher — ein fest verdrahteter Port erzeugt einen
      Fehlschlag, den es nur auf diesem Host gibt und den CI nie sieht.

- [ ] **`gateway-consumer-lint.bats` erweitern.** Verfolgten Satz um
      `scripts/bge-mcp/bge-mcp.service` und `scripts/openspec-embed-local.sh` ergänzen, verbotene
      Literale um `:8081`, `:8095`, `:8096`. Kommentarzeilen bleiben ausgenommen wie bisher.
      `scripts/llm/loadouts.json` wird **ausgenommen** — dort stehen die Adressen
      bestimmungsgemäß, genau wie die Registry-Seeds; ohne die Ausnahme verböte der Lint die
      Konfigurationsdatei, die dieser Change einführt.

      Der bestehende Guard „Lint schlägt fehl, wenn eine verfolgte Datei fehlt" muss die neuen
      Einträge mit abdecken, sonst liefe er über den erweiterten Satz vakuos.

- [ ] **Neue `.test.mjs` in beiden Runnern registrieren.** `Taskfile.yml` **und**
      `.github/workflows/ci.yml` nennen die Proxy-Testdateien handgepflegt;
      `tests/spec/local-llm-proxy/proxy-tests-registered.bats` erzwingt das. Ohne Eintrag läuft
      die neue Datei in keinem Job — genau der Zustand, den T002336 schon einmal reparieren
      musste.

- [ ] **Lokal beide Formen prüfen.** Sammeldatei und Verzeichnis sind gleichzeitig gültig; eine
      gezielte Suche nach der Sammeldatei findet nur die Hälfte:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy*
node --test scripts/llm-proxy/bge-routes.test.mjs
```

- [ ] **Syntaxprüfung der `.bats`-Dateien.** Nicht mit `bash -n` — `@test "…" { … }` ist keine
      gültige Bash-Syntax und erzeugt eine irreführende Meldung. Stattdessen:

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/local-llm-proxy/bge-role-routes.bats
```

- [ ] **Keine Formatzusicherungen.** Die Zusicherungen hängen an Status, Header-Wert und
      Body-Struktur, nicht an Wortlaut oder Zeilenanker einer Ausgabe (T002716). Eine
      Fehlermeldung darf umformuliert werden, ohne den Test rot zu färben.
