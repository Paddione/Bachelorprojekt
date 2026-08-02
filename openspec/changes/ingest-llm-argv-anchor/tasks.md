---
title: "ingest-llm-argv-anchor — Implementation Plan"
ticket_id: T002537
domains: [test, brain]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ingest-llm-argv-anchor — Implementation Plan

_Ticket: T002537_

Design und Ursachen-Beleg: `openspec/changes/ingest-llm-argv-anchor/design.md`.

Kurzfassung: Der Test `T002533 der Schluessel steht nicht in argv (per ps lesbar)` misst einen
~35 ms kurzen Prozess durch Abtastung, in die nur 2–4 Stichproben passen. Das erzeugt zwei
Defekte — sporadisch falsch-rot auf CI (belegt: Run `30730373962` **Attempt 1**, Shard 3) und
still falsch-grün, wenn die Messung den `curl`-Kindprozess verpasst, in dessen argv ein Leck
überhaupt erst sichtbar wäre. Der Fix ersetzt Abtastung durch Synchronisation: der Stub hält den
Request offen, der Test misst währenddessen.

Der Fix berührt **keinen** Produktionscode. Das Transform-Skript verhält sich korrekt — belegt
durch `rc = 0` in Zeile 132 desselben CI-Logs, in dem der Test scheiterte. Der Defekt liegt
ausschließlich im Messverfahren des Tests.

## File Structure

```
tests/spec/brain-foundation/ingest-llm-endpoint.bats   (geändert — einzige Code-Datei)
openspec/changes/ingest-llm-argv-anchor/design.md      (neu — Design und Ursachen-Beleg)
openspec/changes/ingest-llm-argv-anchor/tasks.md       (neu — dieser Plan)
openspec/changes/ingest-llm-argv-anchor/proposal.md    (neu — OpenSpec-Skeleton)
openspec/changes/ingest-llm-argv-anchor/specs/brain-foundation.md (neu — Delta-Spec)
website/src/data/test-inventory.json                   (regeneriert)
```

**S1-Zeilenlimits:** `.bats` steht weder in `s1.limits` in `docs/code-quality/gates.yaml` noch
mit einem Eintrag in `docs/code-quality/baseline.json`. Für diese Datei gibt es folglich keine
S1-Schwelle und kein Zeilenbudget zu wahren. Gegenprobe mit bereits angewandtem RED-Umbau
(170 → 210 Zeilen): `node scripts/code-quality/check.mjs` meldet `0 blocking`.

<!-- vitest: kein neuer Test nötig, weil ausschließlich eine BATS-Testdatei geändert wird —
     keine Datei unter website/src/lib/** oder website/src/pages/api/** ist betroffen. -->

## Task 1 — RED bestätigen

Der umgebaute `@test`-Block ist bereits im Stage-Commit dieses Branches enthalten. Dieser Schritt
verifiziert, dass er aus dem **richtigen** Grund scheitert, bevor irgendetwas implementiert wird.

`start_stub` liest heute ausschließlich `$1`; ein zweites Argument wird stillschweigend ignoriert.
Die Gate-Datei `arrived` entsteht deshalb nie, das Warten läuft in seinen 10-Sekunden-Timeout, und
der Test scheitert an Anker 1.

```bash
tests/unit/lib/bats-core/bin/bats -f 'argv' \
  tests/spec/brain-foundation/ingest-llm-endpoint.bats
# expected: FAIL — "Stub hat den Request in 10s nie gesehen"
```

Prüfe die Fehlermeldung wörtlich mit. Scheitert der Test mit einem anderen Text, liegt eine
andere Ursache vor als die im Design belegte, und die Implementierung darf nicht beginnen.

Die übrigen fünf Tests der Datei müssen in diesem Zustand bereits grün sein — sie belegen, dass
der RED-Zustand allein am geänderten Block hängt:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation/ingest-llm-endpoint.bats
# expected: 5 ok, 1 not ok
```

## Task 2 — Gate im Stub implementieren (GREEN)

Zwei Änderungen in `tests/spec/brain-foundation/ingest-llm-endpoint.bats`, beide additiv.

**2a — `start_stub` reicht ein optionales Gate-Verzeichnis durch.** Die Funktion nimmt ein
optionales zweites Argument entgegen und übergibt es als fünftes `sys.argv` an `server.py`.
Fehlt das Argument, bleibt das Verhalten bitgenau wie bisher.

Diese Abwärtskompatibilität ist die eigentliche Anforderung des Schritts: drei weitere Tests
(`LM_API_KEY wird als Authorization-Header gesendet`, `leeres content …`,
`LM_DISABLE_THINKING=1 …`) rufen `start_stub` ohne Gate auf und dürfen sich nicht verändern.

**2b — `do_POST` hält den Request offen, wenn ein Gate gesetzt ist.** Nach dem Schreiben der
Header- und Body-Dateien (unveränderte Reihenfolge) legt der Handler `arrived` an und wartet auf
`release`, bevor er antwortet. Ohne Gate entfällt dieser Zweig vollständig.

Der Deadlock-Schutz ist bewusst asymmetrisch und gehört zur Anforderung: der Stub antwortet nach
60 Sekunden auch ohne `release`. Sein einziger Zweck ist, dass ein abgestürzter Test keinen
CI-Shard blockiert — deshalb großzügig. Die 10 Sekunden auf Testseite sind dagegen knapp, weil
ein ausbleibender Request ein echter Fehler ist und schnell auffallen soll.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation/ingest-llm-endpoint.bats
# expected: 6 ok — der geänderte Test grün, die fünf übrigen unverändert grün
```

## Task 3 — Determinismus belegen

Ein einzelner grüner Lauf beweist bei einem Flaky-Fix nichts. Der Nachweis muss die Bedingung
treffen, unter der der alte Test scheiterte: Ressourcenkonkurrenz.

```bash
# 20 Wiederholungen unbelastet
for i in $(seq 1 20); do
  tests/unit/lib/bats-core/bin/bats -f 'argv' \
    tests/spec/brain-foundation/ingest-llm-endpoint.bats >/dev/null || echo "FEHLSCHLAG in Lauf $i"
done
echo "unbelastet: fertig"
```

```bash
# 20 Wiederholungen unter Volllast (so viele Hogs wie Kerne)
for i in $(seq 1 "$(nproc)"); do (while :; do :; done) & done
HOGS=$(jobs -p)
for i in $(seq 1 20); do
  tests/unit/lib/bats-core/bin/bats -f 'argv' \
    tests/spec/brain-foundation/ingest-llm-endpoint.bats >/dev/null || echo "FEHLSCHLAG in Lauf $i"
done
kill $HOGS 2>/dev/null
echo "unter Last: fertig"
```

Erwartet: keine Zeile `FEHLSCHLAG`. Erscheint auch nur eine, ist der Fix unvollständig — dann
zurück zu Task 2, nicht die Wiederholungszahl senken.

**Anker gegen eine vakuose Messung:** Die Schleifen oben melden nur Fehlschläge. Läuft `bats`
gar nicht (falscher Pfad, fehlende Berechtigung), blieben sie ebenfalls still und sähen wie ein
Erfolg aus. Deshalb vorab belegen, dass der Runner überhaupt Tests findet:

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/brain-foundation/ingest-llm-endpoint.bats
# expected: 6 — eine kleinere Zahl bedeutet, dass die Schleifen oben nichts aussagen
```

## Task 4 — Abschließende Verifikation

Das Test-Inventar wird nach jeder Test-Änderung regeneriert und mitcommittet; CI vergleicht
`website/src/data/test-inventory.json` gegen den neu erzeugten Stand und schlägt sonst fehl.

```bash
task test:inventory
```

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Anschließend `openspec/changes/ingest-llm-argv-anchor/` und die geänderte Testdatei committen.
