---
title: "embed-skip-visibility — Implementation Plan"
ticket_id: T002546
domains: [bachelorprojekt-ops]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# embed-skip-visibility — Implementation Plan

_Ticket: T002546_

## File Structure

```
scripts/openspec-embed.mjs                                 (362 → ~410 Zeilen; S1 .mjs=800, nicht gebaselined)
scripts/openspec-embed-local.sh                            (85 → ~95 Zeilen; S1 .sh=800)
tests/spec/local-llm-proxy/embed-skip-visibility.bats       (liegt bereits auf dem Branch, RED)
```

Wirksame Schwelle ist in beiden Fällen das Limit (keine der Dateien steht in
`docs/code-quality/baseline.json`). Restbudget nach der Änderung rund 390 bzw.
705 Zeilen — kein Verkleinerungsschritt nötig.

## Zuschnitt: was hier NICHT drin ist

Das Ticket beschrieb ursprünglich auch die Serverkonfiguration (`ctx`,
`parallel`, KV-Typ der bge-Loadouts). **Das ist hier bewusst nicht enthalten.**

Betreibervorgabe 2026-08-02: bge verschwindet komplett vom GPU-Host und läuft
künftig im Cluster; die Migration ist **T002551** (`in_progress`, Plan gestaged).
Den lokalen Loadout zu reparieren hieße, an einer Datei zu arbeiten, die
verschwinden soll. Die Messwerte und die dort zu treffenden Entscheidungen
(`ctx/parallel >= 8192`, KV `q4_0`, und die offene Frage, ob ein Encoder-Modell
überhaupt nennenswert KV allokiert) stehen als Kommentar an T002551; die Tickets
sind verlinkt.

Was hier bleibt, gilt **unabhängig davon, wo bge läuft**: die Lücke sichtbar und
abbaubar machen.

## Kontext: die Lücke ist bereits messbar, nur nicht benannt

Beim Stagen von T002544 brach der Hook ab mit:

```
input (2251 tokens) is larger than the max context size (2048 tokens). skipping
```

Non-fatal — der Commit ging durch, der Plan fehlte im Index.

Beim Stagen von T002543 in derselben Sitzung meldete das **bereits vorhandene**
completeness gate (`scripts/openspec-embed.mjs:319`):

```
WARN: completeness gate — collection has 121 docs but 141 local active plans
```

**Das sind 20 fehlende Dokumente** — genau die Zahl, die das Ticket als
„ungemessen" führte. Zwei Dinge fehlen dem Gate trotzdem:

1. Es zählt nur die **Differenz**, nennt keinen **Grund**. „20 fehlen" ist nicht
   handlungsleitend; „18 wegen Kontextgrenze, 2 wegen Parse-Fehler" wäre es —
   die beiden brauchen verschiedene Maßnahmen.
2. Es läuft nur als Nebenprodukt eines Schreibvorgangs. Es gibt keinen Weg, die
   Lage zu erfragen, ohne den Index anzufassen.

**Für die Nachindizierung existiert bereits `task openspec:embed:backfill`**
(dokumentiert in `scripts/openspec-embed.mjs:6`). Der Plan muss ihn also nicht
bauen — aber er wird im Skip-Pfad nirgends genannt, und er läuft ins Leere,
solange die Kontextgrenze steht (siehe Aufgabe 3).

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die BATS-Datei liegt auf diesem Branch; alle
      fünf Tests sind rot, weil `--count-skipped` nicht existiert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/embed-skip-visibility.bats
# expected: FAIL — 5 not ok, solange scripts/openspec-embed.mjs kein --count-skipped kennt
```

## 1. Zählmodus im Embed-Skript

- [ ] **1.1** `scripts/openspec-embed.mjs` um `--count-skipped` erweitern: zählt,
      **ohne den Index zu verändern**. Ein Modus, der schreibt, taugt nicht zum
      Nachsehen — genau deshalb blieb die Lücke unsichtbar.

- [ ] **1.2** Die Ausgabe nennt eine **Zahl** und den **Grund** getrennt, nicht
      „es gab Probleme". Mindestens unterschieden: Kontextüberschreitung gegen
      alles Übrige.

- [ ] **1.3** `--help` listet den neuen Modus. Dient im Test als Positiv-Anker.

- [ ] **1.4** Die Ausgabe nennt `task openspec:embed:backfill` als Weg, die Zahl
      abzubauen. Wer sie sieht, soll nicht suchen müssen — der Task existiert
      bereits, wird aber im Skip-Pfad nirgends erwähnt.

## 2. Wrapper meldet die Gesamtlage

- [ ] **2.1** `scripts/openspec-embed-local.sh` ruft nach dem Indizieren den
      Zählmodus und gibt die Zahl aus. Bisher erscheint pro Commit nur eine
      Zeile zum **Einzelfall**; die Gesamtlage ist beim Commit nicht erkennbar.

- [ ] **2.2** Der Wrapper bleibt **non-fatal**, wenn nur die Zählung meldet.
      Ein Commit an einem großen Plan zu blockieren, weil der Index hinterher
      hinkt, wäre die falsche Strenge — sichtbar machen genügt.

      Der bestehende harte Fehlerpfad bei einem *fehlgeschlagenen* Embedding
      (Zeile 84, „FEHLER: Embedding wurde NICHT indiziert") bleibt unverändert.

## 3. Bestand nachziehen — nach T002551

- [ ] **3.1** **Reihenfolge beachten, sonst ist der Lauf wirkungslos:**
      `task openspec:embed:backfill` überspringt dieselben Dokumente erneut,
      solange die Kontextgrenze bei 2048 steht. Der Backfill gehört **nach** der
      Kontexterhöhung aus T002551.

- [ ] **3.2** Vor dem Backfill die Ausgangszahl mit `--count-skipped` festhalten,
      danach erneut messen. Beide Werte ins Ticket — sonst ist nachher nicht
      belegbar, dass der Lauf etwas bewirkt hat.

- [ ] **3.3** Bleibt nach dem Backfill eine Restzahl, ist das ein eigener Befund
      (Dokumente über dem Modellkontext von 8192, oder ein anderer Grund) und
      gehört als Ticket erfasst — nicht als Rundungsfehler abgetan.

## 4. Verifikation

- [ ] **4.1** `tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/` —
      alle grün, insbesondere die fünf aus `embed-skip-visibility.bats`.

- [ ] **4.2** Gegenprobe am echten Bestand: `--count-skipped` liefert eine Zahl,
      die zur Meldung des completeness gate passt. Weichen sie ab, zählen die
      beiden Verschiedenes — dann ist die Ursache zu klären, bevor der Wert als
      Kennzahl taugt.

- [ ] **4.3** Abschluss:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
