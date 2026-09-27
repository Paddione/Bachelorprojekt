# F4 — Replay T900250 (areas-csv-trim / backfill-id-sequence)

## Was war die Anfrage
Zwei BATS-Dateien raeumen ihre Testzeilen per `teardown` wieder auf. Der CI-Lauf war gruen,
die Datenbank wuchs trotzdem: die Testrows blieben liegen. „Mach den Test gruen" war die
Anfrage — der Teardown war es bereits.

## Richtige Entscheidung
Nicht nur den Default angleichen, sondern den Erfolg des Teardowns **am Ort belegen, an dem
`ticket.sh` tatsaechlich schreibt**:

- `CTX="${FACTORY_CTX:-devmesh}"` → `CTX="${TICKET_CTX:-fleet}"`.
  `scripts/vda/ticket/_ticket-core.sh:11` loest den Kontext selbst als
  `CTX="${TICKET_CTX:-fleet}"` auf. Vorher stand im Test eine **andere Variable mit anderem
  Default**: `ticket.sh create` schrieb nach `fleet`, der Teardown loeschte gegen `devmesh`
  — Erfolg gemeldet, nichts getroffen.
- Zusaetzlich ein Anker-Test, der `real_ctx="${TICKET_CTX:-fleet}"` setzt, eine echte Testrow
  anlegt, `teardown` laufen laesst und dann per `psql` in genau diesem Kontext nachzaehlt.
  Ohne diesen Test winkt derselbe Defekt beim naechsten Refactor wieder durch.

## Was ging schief
Die erste Fassung des Fixes hat **nur** die Kontextzeile angeglichen. Damit ist der Test
wieder „gruen" — aber der Defekt ist nur unsichtbar, nicht behoben: die Verankerung, die den
Fehler kuenftig sichtbar haelt, fehlt. Genau diese halbe Fassung ist in
`checks/diffs/seeded-1.diff` als Seed abgelegt.

## Check-Design (offline, kein Cluster)
`checks/run.sh` prueft **nur die zwei Dateien des Fixes** — ein globales `grep` nach
`FACTORY_CTX` waere falsch, die Variable ist an vielen legitimaten Stellen noch im Repo
(`scripts/worktree-list.sh`, `scripts/vda/ticket/_devmesh-guard.sh`,
`tests/lib/factory-test-fixtures.sh`, diverse BATS-Dateien). `TARGET` ist per Default die
Repo-Wurzel (Hochlaufen bis `Taskfile.yml`), ueberschreibbar mit `BENCH_TARGET` — damit laesst
sich der Vorzustand aus `replay.json` ausserhalb des Repos in `/tmp` auslegen.

`checks/expected.json` gibt die erwarteten Anker-Textstellen an, damit der Check nicht an
Zeilennummern haengt.

## Grün/Rot-Nachweis (2026-09-27, manuell gefahren, Exit-Codes gemessen)

`replay.json`: Implementierung `4540444c002d48ac6d50adcf2673cd342b81abde` (Squash-Merge
PR #5786), Vorzustand `69edfe901f53582152216b2e1571e32f6921f674` (Parent),
`change_path` `openspec/changes/archive/2026-09-20-areas-csv-trim-testdata-leak`,
Ticket T900250, Diff exakt 2 BATS-Dateien.

| Zustand (`BENCH_TARGET`) | Exit | ausgeloeste Invarianten |
|--------------------------|------|---------------------------|
| Repo-Wurzel (= Referenz, volle Reparatur) | **0** | — |
| `/tmp` aus `git show <parent>:<pfad>` (Ausgangszustand) | **1** | 7 FAILs: CTX nicht angeglichen (beide Dateien), FACTORY_CTX-Default steht noch (beide), Anker fehlt, beide `absent[]`-Textstellen stehen noch |
| `/tmp` mit der **halben** Reparatur (CTX angeglichen, Anker fehlt) | **1** | 2 FAILs: `anker fehlt`, `seeded defect aktiv` |

Der dritte Lauf ist der eigentliche Replay-Gewinn: die halbe Reparatur ist grün im
CI-Sinne, aber der Fall bleibt rot, weil genau die Verankerung fehlt, die den Defekt
künftig sichtbar hält.

`checks/expected.json` wird mit einem Regex ausgewertet, der escaped Quotes mitnimmt
(`"([^"\]|\.)*"`). Mit einem naiven `"[^"]*"` wird der Wert `CTX="${TICKET_CTX:-fleet}"`
nach `CTX=\` abgeschnitten — der Check vergleicht dann die halbe Textstelle und
behauptet "nicht vorhanden wie erwartet". Leere Extraktion ist deshalb ein FAIL, damit
eine kaputte Extraktion nie als bestandene Invariante durchlaeuft.
