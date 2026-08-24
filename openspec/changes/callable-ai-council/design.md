---
title: "Callable AI Council"
ticket_id: T016501
plan_ref: openspec/changes/callable-ai-council/tasks.md
status: draft
---

# Callable AI Council — Design

## Zweck

Ein aufrufbarer Council soll mehrere bewusst zugewiesene Modelle zu einer nachvollziehbaren,
moeglichst tragfaehigen Entscheidung fuehren. Tragfaehig bedeutet nicht Mehrheitsabstimmung:
Einwaende und Bedingungen bleiben sichtbar, und das System eskaliert an einen Menschen, wenn eine
materielle Differenz nicht aufgeloest werden kann.

## SSOT-Entscheidung

Es entsteht keine Council-eigene Modell-Registry.

```text
.opencode/agent-models.jsonc
  canonical: provider/model + opencode agent mapping
                 │ existing drift gate
                 ▼
docs/agent-guide/registry/agents.yaml
  discoverable runtime IDs + validated mirror
                 │ runtime ID lookup
                 ▼
scripts/vda/council.mjs
  ephemeral resolved roster for one run
```

Persistierte Council-Aufrufe enthalten nur Runtime-ID, Mandat und optionale Chair-Zuweisung. Der
konkrete Modellstring wird bei jedem Lauf neu aus der Registry aufgeloest und im Laufartefakt als
Provenienz-Snapshot festgehalten. So folgen gespeicherte Council-Definitionen spaeteren
Modellwechseln automatisch, ohne historische Runs umzudeuten.

## Aufruf

```bash
bash scripts/vda.sh council \
  --member qwen-cloud="architecture and feasibility" \
  --member deepseek-pro="failure modes and evidence" \
  --member ox-alpha="user value and simplicity" \
  --chair qwen-cloud \
  --question "Should we adopt design X?"
```

`--member` ist wiederholbar. Das optionale Mandat ist eine Perspektive, kein Stimmgewicht.
`--prompt-file` nimmt lange Fragen auf; `--json` reserviert stdout fuer das Endergebnis.

## Read-only Ausfuehrung

Mitgliedern wird nicht ihre normale Runtime-Permission gegeben. Der Runner startet stattdessen:

```text
opencode run --agent explore --model <registry-resolved-model> --format json <prompt>
```

Damit ist ein normalerweise write-faehiger Agent im Council nur Modellspender. Der Council selbst
schreibt ausschliesslich seinen Run-Ordner unter `.council/runs/<run-id>/`; `.council/` wird
ignoriert. Kindprozesse erhalten Timeouts und werden bei Abbruch als Prozessgruppe beendet.

## Deliberationszustand

```text
VALIDATE ──► OPENINGS ──► CROSS_EXAM ──► SYNTHESIS ──► BALLOTS
   │             │             │              │            │
   └─ fail       └─ <2 distinct models ───────┘            │
                         INSUFFICIENT_EVIDENCE              │
                                                           ▼
                     all accept ───────────────► CONSENSUS
                     conditions resolvable ────► REVISION (max 2)
                     material objection ───────► HUMAN_REQUIRED
                     non-material dissent ─────► QUALIFIED_CONSENSUS
```

Der Chair synthetisiert einen Kandidaten, entscheidet aber nicht ueber dessen Annahme. Jedes
ueberlebende Mitglied sieht den vollstaendigen Kandidaten und gibt ein strikt parsebares Ballot
ab. Eine Revision enthaelt die offenen Bedingungen und Einwaende; danach stimmen alle erneut ab.

## Modellvielfalt und Aliase

Die SSOT kann mehrere Runtime-Namen auf denselben Modellstring zeigen. Solche Mitglieder duerfen
unterschiedliche Mandate beitragen, zaehlen fuer das Mindestmass unabhaengiger Evidenz jedoch nur
als eine Modellidentitaet und werden sequenziell ausgefuehrt. Der Run meldet diese Gruppen. Zwei
Provider-Routen desselben Modellnamens bleiben zunaechst getrennte aufgeloeste Identitaeten; der
Entscheidungsreport weist die Modellstrings offen aus, statt eine unbelegte Familienklassifikation
zu erfinden.

## Deterministische Entscheidungsschicht

LLMs erzeugen Positionen, Synthesen und Ballots. Ein lokaler Parser validiert die Ballot-Schemata
und berechnet den Status deterministisch. Empfangsbestaetigungen, fehlende Antworten und
unparsebare Ballots gelten nie als Zustimmung.

Materialitaet wird nicht vom Chair still festgelegt: `OBJECT` ist immer materiell;
`ACCEPT_WITH_CONDITION` bleibt offen, bis dasselbe Mitglied die revidierte Fassung akzeptiert oder
seine Bedingung explizit als erfuellt markiert. Nach dem Rundenlimit folgt `HUMAN_REQUIRED`.

## Aus Fusion Harness uebernommene Werte

- Unabhaengige erste Antworten vor gegenseitiger Beeinflussung.
- Vollstaendige, gekennzeichnete Handoffs ohne stille Trunkierung.
- Provenienz pro Modell und Runde.
- Fortsetzung bei einzelnen Modellfehlern, solange genuegend unabhaengige Evidenz bleibt.
- Explizite Trennung von Quellmitgliedern und Synthesephase.

Nicht uebernommen werden Pi-TUI, shared-CWD-Writer, ACK-als-Erfolg und ein einzelner Fuser als
endgueltiger Entscheider.

## Erwartete Implementierungsschnitte

- `scripts/vda.sh`: kanonischer Subcommand-Dispatch und Hilfe.
- `scripts/vda/council.mjs`: CLI, Registry-Aufloesung, Scheduler und Zustandsmaschine.
- `scripts/council/`: Promptdateien und pure Parser-/Entscheidungslogik.
- `.gitignore`: lokale Council-Runartefakte.
- `tests/unit/vda-council.bats`: CLI-, SSOT- und Read-only-Vertrag.
- `tests/unit/council-decision.test.mjs`: Parser und Entscheidungszustaende.
- `openspec/specs/agent-skills.md`: bestehende Registry-/Drift-Anforderung um Council-Konsumenten
  erweitern.

## Verworfen

- **Fusion Harness direkt vendoren:** falscher Host (Pi), paralleler SDLC und eigenes
  Stack-YAML.
- **Provider-/Modellstrings im Council speichern:** erzeugt Drift und verletzt die Registry-SSOT.
- **Einfache Mehrheit:** kann einen sicherheits- oder betriebsrelevanten Einwand ueberstimmen.
- **Einstimmigkeit erzwingen:** produziert Konformitaet statt Erkenntnis.
- **Chair entscheidet allein:** macht den Council zu einem teuren Prompt fuer ein einzelnes Modell.
