# p6 — Tests (RED → GREEN)

**Rolle:** tests · **depends_on:** p1, p2, p3, p4, p5 · **target_files:**
`website/src/lib/bge-router.test.ts`, `website/src/lib/embeddings.test.ts`,
`website/src/lib/rerank.test.ts`, `tests/spec/llm-pipeline/dual-pair-failover.bats`

## Vorgaben

- **Verzeichniskonvention T002416.** Neue `@test`-Blöcke gehören in eine **eigene Datei** unter
  `tests/spec/llm-pipeline/`, nicht angehängt an die Sammeldatei `tests/spec/llm-pipeline.bats`.
  Genau dieses Anhängen ließ Parallelarbeit strukturell am Dateiende kollidieren. Der Runner
  erfasst mit `bats -r tests/spec/` beide Formen; die Bestandsdatei bleibt unverändert liegen.
- **`merge=union` für `.bats` ist keine Lösung** für Append-Konflikte und wird nicht gesetzt: es
  merged zeilenweise ohne Blockstruktur und liefert dabei keinen Konfliktmarker.
- **Positiv-Anker-Pflicht bei Negativtests.** Jeder Test der Form „X darf nicht vorkommen" braucht
  im selben Test einen Positiv-Anker, der bei fehlender Implementierung rot wird. Ohne ihn besteht
  der Test vakuos — fehlt die Funktion, ist die Kandidatenliste leer und die Negativ-Aussage gilt
  trivial. Reihenfolge: erst prüfen, dass der gültige Fall durchläuft, dann die Negativ-Aussage.
- **`$output`-Matching qualifizieren.** Niemals `[[ "$output" == *"<term>"* ]]` gegen den vollen
  stdout+stderr eines Skripts. Druckt das Skript `$0` in seiner Usage, kann der Verzeichnisname
  des Worktrees — hier `bge-dual-pair-T002426` — den Match erfüllen, obwohl die geprüfte Funktion
  gar nicht existiert. Zuerst auf die relevante Ausgabezeile einschränken.
- **CRLF-tolerante Anker bei `.ps1`.** Die PowerShell-Dateien sind durchgehend CRLF; ein auf `$`
  ankernder Regex matcht dort nicht. `[[:space:]]*$` verwenden, da `\r` zur POSIX-Klasse gehört.
- **`bash -n` taugt nicht als Syntax-Check für `.bats`.** Brauchbar ist
  `tests/unit/lib/bats-core/bin/bats --count <datei>`.
- **BATS-Runner-Pfad:** `tests/unit/lib/bats-core/bin/bats` (vendored), nicht der globale.

## Schritte

- [ ] **Failing-Test-Step (RED).** `tests/spec/llm-pipeline/dual-pair-failover.bats` anlegen mit
      den Assertions gegen die Existenz und Form der neuen Artefakte: beide Batch-Startskripte mit
      festem `-ngl 0` und den Ports 8085/8086, Watchdog- und Scheduled-Task-Abdeckung für beide,
      der Registry-Eintrag des MCP-Shims, die neuen Environment-Variablen in `schema.yaml` und
      allen sieben Environment-Dateien, die Gateway-Services in `k3d/llm-gpu.yaml`. Jeder
      Negativtest trägt seinen Positiv-Anker.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline/dual-pair-failover.bats
# expected: FAIL (rot — keines der Artefakte aus p1 bis p5 existiert zu diesem Zeitpunkt)
```

- [ ] `website/src/lib/bge-router.test.ts` anlegen: Umleitung bei rotem Health-Check in beide
      Richtungen; Umleitung bei Überlast trotz grünem Health-Check; Fehler statt Ersatzwerten,
      wenn beide Paare aus sind; Protokollierung jeder Umleitung als Warnung.
- [ ] `website/src/lib/rerank.test.ts` erweitern: primärer Reranker aus und Partner gesund liefert
      korrekt sortierte Ergebnisse vom Partner statt `score: 0`; beide aus oder Reranking
      deaktiviert liefert weiterhin `score: 0` ohne Fehler; beide Fälle protokollieren eine Warnung.
      Der bestehende Erfolgsfall bleibt unverändert bestehen.
- [ ] `website/src/lib/embeddings.test.ts` erweitern: `callRouter` bezieht seine Zieladresse vom
      Router; die öffentlichen Signaturen von `embedQuery` und `embedBatch` sind unverändert.
- [ ] **GREEN.** Nach Abschluss von p1 bis p5 läuft der BATS-Lauf oben grün, ebenso die drei
      Vitest-Dateien.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline/dual-pair-failover.bats
# expected: PASS
```

- [ ] `task test:inventory` regenerieren und `website/src/data/test-inventory.json` mitcommitten —
      CI vergleicht die committete Fassung und schlägt bei Abweichung fehl.
