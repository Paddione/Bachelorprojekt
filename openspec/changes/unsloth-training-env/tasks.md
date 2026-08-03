---
title: "unsloth-training-env — Implementation Plan"
ticket_id: T002587
domains: [scripts, llm, factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# unsloth-training-env — Implementation Plan

_Ticket: T002587_

## File Structure

| Datei | Art | Rolle |
|---|---|---|
| `scripts/finetune/measure_corpus.py` | neu | Token-Längenverteilung + VRAM-Machbarkeitsmatrix |
| `scripts/finetune/template_guard.py` | neu | Byte-Gleichheits-Verifikation des Chat-Templates |
| `scripts/finetune/train.py` | neu | Einziges parametrisiertes Trainingsskript |
| `scripts/finetune/collect_factory_traces.py` | neu | Factory-Läufe zu Trainingskorpus rendern |
| `scripts/finetune/export_gguf.py` | neu | GGUF-Export mit Template-Korrektur |
| `scripts/finetune/README.md` | neu | Reihenfolge der Schritte, Slot-Registrierung |
| `Taskfile.finetune.yml` | neu | `finetune:`-Namespace |
| `Taskfile.yml` | geändert | Include-Eintrag für den Namespace |
| `docs/agent-guide/registry/capabilities.yaml` | geändert | Repo-Instanz unter `modell-finetuning` |
| `.claude/skills/finetune-run/SKILL.md` | neu | Repo-Skill um `unsloth-buddy` herum |
| `tests/spec/unsloth-training-env/measure-corpus.bats` | neu | Guards Messschritt |
| `tests/spec/unsloth-training-env/template-guard.bats` | neu | Guards Template-Gleichheit |
| `tests/spec/unsloth-training-env/factory-traces.bats` | neu | Guards Trace-Kollektor |
| `tests/spec/unsloth-training-env/agent-discovery.bats` | neu | Guards Oracle- und Registry-Anbindung |
| `unsloth_training_setup/` | entfernt | kopierter Skill-Code, duplizierte Trainingsskripte |

**Zeilenbudgets.** Alle neuen Python-Dateien werden unter dem `.py`-Limit aus
`docs/code-quality/gates.yaml` geschnitten; keine von ihnen ist gebaselined. `Taskfile.yml` und
`docs/agent-guide/registry/capabilities.yaml` sind YAML und unterliegen dem S1-Zeilengate nicht.
Das Verzeichnis `unsloth_training_setup/` enthält Dateien deutlich über dem Python-Limit; dieser
Plan verkleinert es auf null, ein Split erübrigt sich dadurch.

**Partial-Manifest** — disjunkte `target_files`, Tests zuletzt:

| Partial | Rolle | target_files |
|---|---|---|
| p1 | Vorbedingungen | `scripts/finetune/measure_corpus.py`, `scripts/finetune/template_guard.py` |
| p2 | Training und Export | `scripts/finetune/train.py`, `scripts/finetune/export_gguf.py` |
| p3 | Factory-Traces | `scripts/finetune/collect_factory_traces.py` |
| p4 | Integration | `Taskfile.finetune.yml`, `Taskfile.yml`, `docs/agent-guide/registry/capabilities.yaml`, `.claude/skills/finetune-run/SKILL.md`, `scripts/finetune/README.md` |
| p5 | Aufräumen | `unsloth_training_setup/` |
| p6 | Tests | `tests/spec/unsloth-training-env/` |

Zwei Partials bündeln je zwei Dateien, weil deren Verträge aneinander hängen: Messbericht und
Template-Guard sind gemeinsam die Vorbedingung des Trainings, und der Export teilt mit dem Training
die Regel, das Hub-Template zurückzuschreiben. Getrennt geplant würden beide Regeln zweimal
beschrieben und könnten auseinanderlaufen.

---

## Task 1 (p1) — Vorbedingungen: Messschritt und Template-Guard

### 1a — Längenverteilung und Machbarkeitsmatrix

Erzeugt die Zahlen, auf denen jede spätere Entscheidung beruht. Ohne diesen Schritt wird
`max_seq_length` geraten — ein geratener Wert kürzte im Vorversuch 45 % der Korpuszeilen am Ende,
also genau dort, wo bei behavioralem Training das Lernziel steht.

`scripts/finetune/measure_corpus.py` nimmt Korpus-Kennung und Basismodell entgegen, rendert jede
Zeile durch das Chat-Template des Modells, tokenisiert und gibt JSON aus:

- `median`, `p90`, `p95`, `p99` und Maximum der Token-Längen
- je Kandidatenlänge (768, 1024, 1536, 2048, 3072, 3584, 4096, 6144, 8192) Anzahl und Anteil der
  Zeilen, die gekürzt würden
- eine Machbarkeitsmatrix je Kandidatenmodell aus Gewichtsbedarf (4-bit), Aktivierungen bei der
  jeweiligen Sequenzlänge und Optimizer-States, gestellt gegen das verfügbare VRAM

Der Bericht landet unter `outputs/measure/<korpus>__<modell>.json`. Dieser Pfad ist der Vertrag:
das Trainingsskript verweigert den Start, wenn er fehlt.

### 1b — Byte-Gleichheit des Chat-Templates erzwingen

`scripts/finetune/template_guard.py` rendert Hub-Template und gepatchtes Template über den
vollständigen Korpus. Eine Abweichung an einer einzigen Zeile bedeutet Exit ungleich null, mit
Ausgabe der ersten abweichenden Zeichenposition und beider Kontexte.

Zwei Fallen, die im Vorversuch beide zuschlugen und deshalb hier abgesichert werden:

1. Der Assistant-Header gehört **außerhalb** des Generation-Blocks. Beim Inference erzeugt ihn
   `add_generation_prompt`; das Modell generiert erst danach. Wird er eingeschlossen, verschiebt
   sich die Maske um die Länge des Headers.
2. Der Generation-Marker braucht die Whitespace-Kontrolle des umgebenden Templates
   (`{%- generation %}`). Ohne sie entsteht ein zusätzlicher Zeilenumbruch — eine einzelne
   Byte-Abweichung, die Trainings- und Serving-Format auseinanderlaufen lässt.

Zusätzlich prüft der Guard die Herkunft: Referenz ist das **Hub-Template**, nicht das vom
Trainings-Framework in ein Adapterverzeichnis geschriebene. Im Vorversuch unterschieden sich beide
um mehr als tausend Zeichen.

## Task 2 (p2) — Trainingsskript und Export

### 2a — Eine parametrisierte Trainingsfassung

`scripts/finetune/train.py` löst die drei duplizierten Fassungen ab. Konfiguration über CLI-Flags
und eine Konfigdatei, nicht über kopierte Skriptvarianten.

Verbindliche Eigenschaften:

- **Vorbedingungen.** Bricht ab, wenn der Messbericht aus Schritt 1a fehlt oder der Template-Guard aus
  Schritt 1b nicht bestanden wurde.
- **Assistant-only Loss** über vorab tokenisierte Daten (`input_ids` plus `assistant_masks`). Der
  TRL-Collator honoriert `assistant_masks` selbstständig. Der Weg über eine `tools`-Spalte ist
  nicht gangbar: TRL nimmt Tools nur als globales Argument entgegen, nicht je Zeile.
- **Zeilen ohne Lernsignal** nach der Kürzung werden verworfen und gezählt.
- **Anteil des Lernsignals** wird vor dem ersten Trainingsschritt ausgegeben.
- **Hub-Template zurückschreiben** vor dem Speichern, damit der Adapter nicht das
  Trainings-Template ausliefert.
- LoRA-Vorgaben nach Unsloth-Primärdokumentation: Rang 16 oder 32, `lora_alpha` gleich Rang oder
  doppelter Rang, die sieben Standardmodule, `lora_dropout` null, rsLoRA aus.

### 2b — Export mit Template-Korrektur

`scripts/finetune/export_gguf.py` merged den Adapter, schreibt das Hub-Template zurück und
exportiert nach GGUF. Der Export prüft vorher den freien Systemspeicher gegen den fp16-Bedarf des
Modells und bricht mit klarer Meldung ab, statt in den Swap zu laufen — auf der Zielmaschine ist
der WSL-Speicher gedeckelt und deutlich knapper als der Host-Speicher.

Der erzeugte GGUF-Pfad ist so benannt, dass `llm-proxy` ihn als benannten Slot aufnehmen kann. Die
Slot-Registrierung selbst bleibt manuell und wird im README beschrieben: der automatische Austausch
eines laufenden Factory-Slots gehört nicht in einen Trainingslauf.

## Task 3 (p3) — Factory-Traces als Trainingskorpus

`scripts/finetune/collect_factory_traces.py` liest abgeschlossene Ticket-Läufe aus
`tickets.factory_phase_events` und rendert sie ins Korpusformat. Lesend über den MCP-Pfad gemäß
`.claude/skills/references/mcp-tool-guide.md`.

Filter und Schutz:

- Nur Läufe, deren Ergebnis als erfolgreich verzeichnet ist. Fehlgeschlagene Läufe als
  Trainingsziel zu verwenden hieße, Fehlverhalten einzuüben.
- Kein Lesezugriff auf `environments/.secrets/`. Ein Redaktionsfilter entfernt Zeichenketten, die
  den bekannten Secret-Mustern entsprechen, bevor geschrieben wird.
- Ausgabeformat identisch zum externen Korpus, damit dieselbe Encode-Strecke greift.

## Task 4 (p4) — Agenten-Anbindung

Drei Wege, damit Agenten das Subsystem finden, ohne es zu kennen:

1. **`Taskfile.finetune.yml`** mit dem `finetune:`-Namespace: `measure`, `guard`, `train`,
   `traces`, `export`. Eingehängt als eigener Include in `Taskfile.yml` nach dem Muster der
   bestehenden `Taskfile.llm.yml`. Eine eigene Datei statt Anhängen an eine bestehende, damit
   Parallelarbeit nicht am selben Dateiende kollidiert.
2. **`docs/agent-guide/registry/capabilities.yaml`**: die Fähigkeit `modell-finetuning` bekommt
   neben dem Plugin-Skill die Repo-Instanz mit `use_when`, `avoid_when`, `fallback` und
   `deep_ref`. Damit injiziert `toolset-context.sh` sie in die Prompts der berechtigten Rollen.
3. **`.claude/skills/finetune-run/SKILL.md`**: verbindet die Repo-Konventionen (Ticket, Worktree,
   Gates, Messschritt vor Modellwahl) mit `unsloth-buddy`. Das Skill ruft das Plugin auf, statt
   dessen Code zu kopieren.

`scripts/finetune/README.md` beschreibt Reihenfolge und Slot-Registrierung.

## Task 5 (p5) — Kopierten Skill-Code entfernen

`unsloth_training_setup/` wird vollständig entfernt. Die drei duplizierten Trainingsskripte sind
durch Schritt 2a abgelöst. `reflect.py`, `gaslamp_callback.py` und `templates/dashboard.html` stammen
aus dem Plugin und werden dort aufgerufen statt hier vorgehalten — eine Kopie im Repo driftet
gegenüber dem Skill, ohne dass ein Gate es bemerkt. Die `.gitignore`-Einträge für
Trainingsartefakte ziehen nach `scripts/finetune/.gitignore` um.

## Task 6 (p6) — Tests

Prüfmodus: **Output-Verifikation**. Die Tests führen die Kommandos aus und prüfen deren Ausgabe und
Exit-Code; sie greppen nicht den Quelltext. Ausnahme ist `agent-discovery.bats`, dessen Gegenstand
sich ausschließlich in Konfigurationsdateien manifestiert.

**Failing-Test-Step (rot vor grün)** — vor der Implementierung von Schritt 1a ausführen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/unsloth-training-env/measure-corpus.bats
# expected: FAIL — scripts/finetune/measure_corpus.py existiert noch nicht,
# der Aufruf endet mit Exit ungleich null und ohne JSON-Bericht.
```

Danach dieselbe Zeile erneut, bis sie grün ist.

Abzudeckende Aussagen, jede mit Positiv-Anker **vor** der Negativ-Aussage:

- `measure-corpus.bats` — Messlauf gegen ein Mini-Korpus liefert JSON mit allen Perzentilen; ein
  Trainingsstart ohne Bericht endet mit Exit ungleich null.
- `template-guard.bats` — identische Templates ergeben Exit null; ein um genau ein Zeichen
  verändertes Template ergibt Exit ungleich null und nennt die Position.
- `factory-traces.bats` — Kollektor über eine Fixture mit einem erfolgreichen und einem
  gescheiterten Lauf liefert genau den erfolgreichen; die Ausgabe enthält keine Secret-Muster.
- `agent-discovery.bats` — die `finetune:`-Tasks sind über den Task-Oracle im Trockenlauf
  auflösbar, und `toolset-context.sh` gibt für eine berechtigte Rolle die Repo-Instanz aus.

Nach Anlegen der Testdateien `task test:inventory` ausführen und
`website/src/data/test-inventory.json` mitcommitten.

## Task 7 — Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich:

```bash
bash scripts/plan-lint.sh openspec/changes/unsloth-training-env/tasks.md
task agents:toolset:check
tests/unit/lib/bats-core/bin/bats -r tests/spec/unsloth-training-env/
```

Die Abnahme ist erst erreicht, wenn zusätzlich der Harness aus T002606 einen Trainingslauf gegen
sein Basismodell gemessen hat. Ein Adapter ohne diese Messung wird nicht als Factory-Slot
ausgeliefert.
