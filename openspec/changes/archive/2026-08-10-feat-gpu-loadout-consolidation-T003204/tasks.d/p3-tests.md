# P3 — Tests: Rotphase, Schema, Drift-Guard

**Rolle:** tests · **Zieldateien:** `tests/spec/local-llm-proxy/loadout-enabled-flag.bats`,
`tests/spec/local-llm-proxy/opencode-agent-model-drift.bats`,
`scripts/llm-proxy/loadouts.test.mjs` · **depends_on:** P1

**Prüfmodus** (Header-Konvention T002448-M4): ERGEBNIS-basiert. Die Tests rufen
`parseLoadouts` und `isLoadoutEnabled` **auf** und bewerten deren Rückgabe — dieselben
Funktionen, die der Proxy vor jedem Start befragt. Ein `grep` auf das Feld in der JSON-Datei
belegte nur, dass dort Text steht; ob der Start dadurch tatsächlich abgelehnt wird, sagt allein
die Funktion. Die Drift-Prüfung in Punkt 3 ist Konfigurationsabgleich zwischen zwei Dateien und
damit der dokumentierte Grep-Fall.

## Tasks

- [x] **RED zuerst: `tests/spec/local-llm-proxy/loadout-enabled-flag.bats`.** Der Test lädt ein
      Fixture-Dokument mit `"enabled": false` durch `parseLoadouts` und erwartet, dass es
      **akzeptiert** wird und `isLoadoutEnabled` `false` liefert. Heute rot: `LOADOUT_KEYS` kennt
      das Feld nicht, `parseLoadouts` scheitert mit „unbekanntes Feld 'enabled'".

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/loadout-enabled-flag.bats
# expected: FAIL (rot — das Feld existiert im Schema noch nicht)
```

      **Positiv-Anker im selben Test** (T002356-M1): davor prüft derselbe `@test`, dass das
      unveränderte Fixture **ohne** das Feld durch `parseLoadouts` läuft. Ohne ihn wäre ein
      Fehlschlag nicht von „Fixture kaputt" oder „Modul nicht ladbar" zu unterscheiden.

      Keine externe Abhängigkeit: `parseLoadouts` liest einen String, kein Dateisystem, kein
      Netz, kein laufender Proxy. Der Test läuft in CI regulär und braucht keinen Skip-Guard.

- [x] **Default-Verhalten festhalten.** Eigener `@test`: ein Loadout ohne `enabled` liefert
      `isLoadoutEnabled === true`. Das ist die Rückwärtskompatibilität, an der alle elf
      bestehenden Einträge hängen — sie ist wichtiger als der Negativfall und darf nicht nur
      implizit in einem anderen Test mitlaufen.

- [x] **Typprüfung.** `"enabled": "false"` (String) muss `parseLoadouts` scheitern lassen. Ein
      truthy String wäre sonst „abgeschaltet" in der Datei und „läuft" im Verhalten — der
      schlimmste Ausgang, weil er wie Erfolg aussieht.

- [x] **`scripts/llm-proxy/loadouts.test.mjs` erweitern.** Die Datei prüft bereits
      Schema-Grenzfälle (`fit.enabled=false` ohne `ctx` …). Die drei Fälle oben gehören
      zusätzlich dorthin, weil sie dort ohne BATS-Rahmen laufen und in
      `proxy-tests-registered.bats` bereits erfasst sind.
      **Nicht** `isLoadoutEnabled` doppelt prüfen — ein Ort pro Aussage.

- [x] **Drift-Guard erweitern** (`tests/spec/local-llm-proxy/opencode-agent-model-drift.bats`).
      Neue Zusicherung: kein `model`-Wert in `.opencode/agent-models.jsonc` und kein Eintrag der
      Orchestrator-Permission-Liste darf auf ein Loadout zeigen, das in `loadouts.json`
      deaktiviert ist. Fehlermeldung nennt **Agent und Loadout**, nicht nur „drift".

      **Positiv-Anker:** zuerst prüfen, dass die Kandidatenmenge nicht leer ist — mindestens ein
      `llamacpp-local/`-Modell wird gefunden und mindestens ein Loadout gelesen. Ohne ihn wäre
      „kein Agent zeigt auf ein deaktiviertes Loadout" trivial erfüllt, sobald ein Pfad sich
      ändert und der Parser ins Leere greift. Genau diese Falle beschreibt T002356-M1.

- [x] **Semantik statt Darstellung** (T002716). Die Zusicherungen hängen am **Ergebnis** —
      Rückgabewert von `isLoadoutEnabled`, Vorhandensein eines Slugs in der Kandidatenmenge,
      Exit-Status von `parseLoadouts`. Nicht am Wortlaut einer Fehlermeldung und nicht an
      Zeilenankern über Tabellenspalten; beides bricht, sobald jemand eine Meldung umformuliert,
      und meldet dann einen Defekt, den es nicht gibt.

- [x] **Syntaxprüfung.** Nicht `bash -n` — `@test "…" { … }` ist keine gültige Bash-Syntax und
      erzeugt eine irreführende Meldung:

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/local-llm-proxy/loadout-enabled-flag.bats
```

- [x] **Lokal beide Formen prüfen.** Sammeldatei und Verzeichnis sind gleichzeitig gültig:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy*
node --test scripts/llm-proxy/loadouts.test.mjs
```
