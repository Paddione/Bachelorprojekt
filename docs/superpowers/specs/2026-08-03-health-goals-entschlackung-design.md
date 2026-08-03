---
title: Health Goals entschlacken und wahrheitsfähig machen
ticket_id: T002598
domains: [ci, docs, health-goals]
status: approved
date: 2026-08-03
---

# Health Goals entschlacken und wahrheitsfähig machen

## Problem

`.claude/lib/goals.md` führt **105 Ziele auf 987 Zeilen**. Die Datei spielt drei Rollen
gleichzeitig — Ziel-Register (was gilt), Mess-Spezifikation (wie geprüft wird) und
Änderungs-Chronik (was war). Daraus folgen drei Defekte:

**1. 35 Ziele werden nie gemessen.** `scripts/health-goals-check.sh` ist eine handgeschriebene
Liste von `row()`-Aufrufen und kennt nur 70 der 105 IDs. `scripts/gen-goals-data.mjs` misst
nichts — es *parst* die Markdown-Datei fürs Dashboard. Ein Ziel ohne `row()`-Aufruf zeigt daher
dauerhaft den Wert, den zuletzt jemand von Hand eingetragen hat. Niemand prüft, ob Register und
Messung übereinstimmen; genau so sind die 35 entstanden. Präzedenzfall im Repo: G-CD01 zeigte auf
einen gelöschten Workflow und lieferte falsches Grün, bis T001349 es korrigierte.

**2. Die Chronik wächst monoton.** ~195 Zeilen `Baseline-Update`-Einträge plus eine 39-zeilige
Ticket-Tabelle. Jeder Fix hängt einen Absatz an, keiner räumt einen ab.

**3. Strukturelle Defekte.** Zwei doppelt geführte Ziele (`G-AGENTIC09`, `G-IMG01` stehen in
Prio A/B *und* Prio C), eine Tabellenzeile ohne schließendes `|` (`G-SEC05`), eine Leerzeile
*innerhalb* der Prio-C-Tabelle, die sie in zwei Renderings spaltet. Zusätzlich vergibt die
SSOT-Spec `openspec/specs/health-goals.md` fünf REQ-IDs doppelt.

## Ziel

`goals.md` spielt nur noch **eine** Rolle: Ziel-Register. Messung liegt in `check.sh`, Chronik in
`docs/health-goals-history.md`. Ein bidirektionaler Paritäts-Guard erzwingt, dass Register und
Messung deckungsgleich bleiben.

## Architektur

```
.claude/lib/goals.md          Register: WAS gilt (~450 statt 987 Zeilen)
   │   ├─ Prio A/B: H2-Sektion je Ziel, Prosa auf "Was + Fallen" gekürzt
   │   ├─ Prio C:   Tabelle, eine Zeile je Ziel
   │   └─ Kopf:     **Zuletzt gemessen:** <ISO>   ← neu, gestempelt
   │
   ├──► docs/health-goals-history.md    Chronik: WAS WAR (voll, ab 2026-07-01)
   │                                    goals.md behält die letzten 3 Einträge
   │
   └──◄ scripts/health-goals-check.sh   Messung: WIE geprüft wird
            ▲
            └─ tests/spec/health-goals/id-parity.bats  ← neu, bidirektional
```

Das Markdown-Format der Ziele bleibt **unverändert** — H2-Sektionen für Prio A/B, Tabellenzeilen
für Prio C. Damit bleiben die vier Struktur-Tests in `tests/spec/health-goals.bats`
(`:72`, `:99`, `:116`, `:138`) gültig und `gen-goals-data.mjs` braucht keinen Parser-Umbau.

## Entscheidungen

### Streich-Kriterium: Verletzbarkeit

Ein Ziel überlebt nur, wenn sein Wert sich realistisch **verschlechtern kann** und die
Verschlechterung jemanden zum Handeln zwingt. Vier Ziele fallen durch:

| Ziel | Grund | Referenz-Risiko |
|---|---|---|
| `G-DOC04` ≥ 5 ADRs | Zahl kann strukturell nur steigen | nur Archiv-Dateien |
| `G-DOC06` ≥ 30 Skill-Dateien | dito | keine |
| `G-RH03` BATS/Spec-Quote | zählt `tests/spec/*.bats` **flach** und verfehlt seit T002416 die Unterverzeichnisse `tests/spec/<slug>/`; Target 23 % liegt zudem weit unter dem Ist | `coverage-gate.bats` nennt es nur in Titel und Kommentar — Streichung bricht ihn nicht |
| `G-RH05` plan_staged idle > 14d | Ticket-Ops-Signal, kein Repo-Gesundheitswert; braucht DB-Zugriff | keine |

`G-RH03` und `G-RH05` liegen in der als „stabile Anker" deklarierten Zone `G-RH01`–`G-RH07`. Die
Konvention verbietet **Umnummerierung**, nicht Streichung — die verbleibenden Anker behalten ihre
Nummern.

### Die übrigen 31 werden verdrahtet, mit ehrlichem SKIP

Der `row()`-Helfer in `check.sh` behandelt `actual="-"` bereits als SKIP (`n/a`, weder Grün noch
Rot). Dieser Pfad wird konsequent genutzt — das ist der Unterschied zwischen „ungemessen und grün"
und „ungemessen und sichtbar".

| Klasse | Ziele | Verhalten |
|---|---|---|
| offline + schnell (18) | `G-CQ06` `G-DOC01` `G-TEST01` `G-TEST03` `G-TEST04` `G-SPEC01` `G-SPEC02` `G-SPEC03` `G-SEC02` `G-SEC03` `G-SEC04` `G-DEP03` `G-RH04` `G-RH07` `G-K8S01` `G-K8S02` `G-K8S03` `G-K8S04` | laufen immer |
| netzabhängig (7) | `G-CI01` `G-CI02` `G-GIT01` `G-DEP05` `G-CD02` `G-RH06` `G-DORA02` | `gh` mit Timeout; nicht erreichbar → SKIP |
| langsam (3) | `G-DEP01` `G-DEP02` `G-BRAIN14` | nur ohne `--fast` |
| shallow-clone-anfällig (3) | `G-DORA01` `G-DORA03` `G-DORA04` | Guard auf `git rev-parse --is-shallow-repository` → sonst SKIP |

**Ergebnis: 105 → 101 Ziele, 101/101 gemessen oder ehrlich als SKIP ausgewiesen.**

### `measured_at` wird von der Chronik entkoppelt

`gen-goals-data.mjs:132` leitet das Messdatum heute aus dem jüngsten `**Baseline-Update <datum>`-
Marker der Changelog-Prosa ab, mit Fallback auf den statischen `Baseline-Stichtag`. Lagert man die
Chronik aus, ohne das zu ändern, greift der Fallback — das Dashboard zeigt ein Monat altes
Messdatum, und **nichts wird rot**. Das ist dieselbe Fehlerklasse, die T002162 gerade erst behoben
hat.

Deshalb bekommt `goals.md` ein explizites Kopf-Feld `**Zuletzt gemessen:** <ISO-Datum>`, das
`health-goals-update.sh` bei jedem Lauf stempelt. Die Fallback-Kette wird: Feld →
`Baseline-Stichtag` → `''`. Die beiden Tests `health-goals.bats:397` und `:425` werden auf das
neue Feld umgeschrieben.

### Prosa-Regel: Historie raus, Fallen bleiben

Entfernt wird, was erzählt **wie es dazu kam** („Warum verschärft", „Warum von 250 auf 400
gelockert"). Es bleibt: was gemessen wird, der Befehl, die Meta-Zeile — und jede Warnung, die vor
einem konkreten Fehler schützt. Die Meta-Zeile trägt neu ein `**Historie:** [T00…]`-Feld, das in
die ausgelagerte Chronik zeigt.

Beispiel `G-AGENTIC09`: 42 → ~16 Zeilen. Die Warnung „die Schwelle steht nur hier und in
`health-goals-check.sh`, die BATS-Guards lesen sie von dort" **bleibt** — sie verhindert, dass
jemand die Zahl an einer von mehreren Stellen ändert. Die Erzählung, warum sie erst 500, dann 250,
dann 400 war, geht in die Chronik.

## Guard gegen Wiederzuwachs

`tests/spec/health-goals/id-parity.bats` (neue Datei nach der Verzeichniskonvention T002416),
bidirektional:

1. jede Ziel-ID in `goals.md` hat einen `row()`-Aufruf in `check.sh`
2. jeder `row()`-Aufruf in `check.sh` ist in `goals.md` dokumentiert
3. `goals.md` enthält höchstens 5 `Baseline-Update`-Einträge (Kappungsregel)

**Positiv-Anker-Pflicht (T002356-M1):** Jeder dieser Negativtests prüft *zuerst*, dass die
ID-Extraktion überhaupt eine bekannte ID findet. Ohne diesen Anker meldet „keine Differenz"
trivial grün, sobald die Extraktion bricht.

**Die ID-Regex MUSS `G-[A-Z0-9]+` sein**, nicht `G-[A-Z]+[0-9]+`. Letztere zerschneidet `G-E2E01`
zu `G-E2` und übersieht `G-K8S01`–`04` vollständig. Dieser Fehler ist bei der Analyse dieses
Vorhabens real passiert und verfälschte die gemessene Drift von 35 auf 31 — die Regex sah plausibel
aus, erfasste still die falsche Menge und fiel nicht auf. Das ist exakt der Fehlertyp, den dieses
Vorhaben behebt.

## Fehlerbehandlung

| Fall | Verhalten |
|---|---|
| `gh` nicht erreichbar | SKIP mit `n/a` — kein Grün, kein Rot |
| Shallow Clone | DORA-Ziele SKIP mit Notiz |
| `goals.md` nennt ID ohne `row()` | CI rot (Paritäts-Guard) |
| `check.sh` misst ID ohne Doku | CI rot (Paritäts-Guard) |
| Chronik in `goals.md` > 5 Einträge | CI rot (Kappungs-Guard) |

## Mitgeführte Nebenbefunde

Im selben Zug, weil dieselben Dateien betroffen sind:

- `goals.md` `G-SEC05`-Zeile: fehlendes schließendes `|`
- `goals.md`: Leerzeile innerhalb der Prio-C-Tabelle
- `openspec/specs/health-goals.md`: `REQ-HEALTH-GOALS-002/003/005/006/007` sind je zweimal
  vergeben — zehn Requirements auf fünf IDs. Eine Delta-Spec kann sonst kein eindeutiges Ziel
  referenzieren.

## Nicht in Scope

Die **70 bereits gemessenen** Ziele gegen dasselbe Verletzbarkeits-Kriterium prüfen. Erwartete
Kandidaten: `G-SIZE03` (311 ≤ 3000, Reserve 2689), `G-CQ02` (0 ≤ 280), `G-TEST05` (86 % ≥ 60 %) —
Ziele, deren Target so weit entfernt liegt, dass sie praktisch nie auslösen. Bewusst als
Folge-Option zurückgestellt, weil jedes eine Einzelbewertung braucht.

## Abgrenzung zu T002440

Epic T002440 (FREEZE via `readiness.factory_excluded=true`) verfolgt die **Gegenrichtung**: es fügte
drei Zielfamilien hinzu (`G-IF`, `G-LLM`, `G-WT`, alle inzwischen in `goals.md`), weil die Frage war,
wo das System *nicht hinsieht*. Dieses Vorhaben fragt, wo es *lügt*. Beides ist verteidigbar; sie
kollidieren aber im selben Dokument. T002440 bleibt eingefroren, dieses Ticket läuft eigenständig.

**Kollisionsrisiko:** Der offene Worktree `chore/zielfamilie-llm-stack-T002442` arbeitet ebenfalls
an `goals.md`. Bei Merge-Konflikten gilt: beide Zielblöcke behalten, nicht eine Seite wählen.
