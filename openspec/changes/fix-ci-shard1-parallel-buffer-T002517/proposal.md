# Proposal: fix-ci-shard1-parallel-buffer-T002517

## Why

CI Shard 1 scheitert reproduzierbar: GNU parallel (von `bats -j` genutzt) kann keine
Ausgabepuffer nach `/tmp` schreiben (`Cannot append to buffer file in /tmp`).
0 statt 454 Tests ausgeführt. Shards 2-4 laufen sauber durch. Der fail-closed
Aggregator blockiert dann den Merge.

Die Diagnose wurde bereits auf dem Branch ergänzt (df, du, Schreibprobe). Die
Wahrscheinliche Ursache: ein Prozess auf dem Shard-1-Runner füllt `/tmp` oder
`TMPDIR` ist nicht gesetzt und `/tmp` ist auf dem spezifischen Runner ausgelastet.

## What

1. **TMPDIR auf `$RUNNER_TEMP` setzen** — GitHub Actions stellt pro Job ein
   eigenes, bereinigtes Temp-Verzeichnis bereit. GNU parallel puffert dann dorthin
   statt ins gemeinsam genutzte `/tmp`.
2. **Diagnose-Schritt erhalten** — als dauerhaften Health-Check (kein Fehlschlag),
   um `/tmp`-Probleme früh zu erkennen.
3. **Test:** CI-Workflow-YAML validieren.

_Ticket: T002517_
