# Tandem-Kleinstmodelle — Evaluierung und Trainingsempfehlung

_Ticket T015248 · Change `openspec/changes/tandem-small-models` · Stand 2026-08-24_

Forschungs-Deliverable: begründete Modell-Empfehlung je Tandem-Rolle plus Trainingsplan.
Die Umsetzung (Training, Export, Loadout-Integration) folgt in Folge-Tickets. Zahlenquellen
sind durchgehend deklariert — lokal verifizierte Artefakte, Lauf-1-Messungen oder explizit als
solche markiertes öffentliches Modellkarten-Wissen. Die strukturierte Grundlage ist die
Kandidatenmatrix `docs/finetune/tandem-candidates.json`; dieser Text wiederholt keine Zahl,
die dort nicht belegt ist.

## Ausgangslage

**Residentmodell.** Der lokale Stack serviert seit T014028/T014105 FreeToken-native auf
`:1919`; der modellagnostische Alias `freetoken-local/active` trifft immer das gerade
residente Modell. Abgeleitet aus `scripts/llm/loadouts.json` (Slug `freetoken-local`,
`managed: external`, Datei `freetoken/Qwen3.6-35B-A3B-NVFP4.gguf`, Port 1919) und
`.opencode/agent-models.jsonc` (Provider `freetoken-local` mit drei MoE-FTW-Checkpoints,
Fallback des Alias auf Qwen3.6-35B-A3B-NVFP4) ist das residente Modell:

> **Qwen3.6-35B-A3B NVFP4** — Architektur `Qwen3_5MoeForConditionalGeneration`
> (GDN-Hybrid-MoE, text-only), Vokabulargröße 248320 (lokale `config.json`),
> vom Plugin mit 131072 Kontext limitiert; gemessen am 2026-08-23 ~104 tok/s Decode kurz
> bzw. 62–70 tok/s bei 63k Kontext (`agent-models.jsonc`); die Loadout-Notiz bestätigt
> 262144 deklarierte Kontext bei ~103 tok/s warm.

Alle lokalen Familien-Subagenten zeigen auf denselben Alias — jedes Tandem-Modell muss sich
daher an diesem einen Resident messen lassen.

**GPU-Budget.** Eine RTX 5070 Ti mit 16 GiB (Unsloth meldete in Lauf 1 max memory
15.92 GB). Serving und Training teilen sich die Karte über die `exclusiveGroup chat-gpu`:
es läuft nur ein GPU-Loadout zugleich. Training entkoppelt sich über `scripts/gpu-lock.sh`
(Lauf 1: 15087 MiB frei gemessen, 4800 MiB angefordert). Für Tandem-Modelle heißt das:
der Draft reitet **im selben Serverprozess** wie der Resident (Speculative Decoding im
llama.cpp — Bestandsmuster: `gemma12-vision` mit `draftModelPath mtp-gemma-4-12B-it.gguf`);
Router und Worker laufen als eigene Loadouts **sequenziell**, nicht parallel zum Resident.

**Pipeline-Basis Lauf 1.** `scripts/finetune/` bewies in Lauf 1 (Qwen3.5-text-4B-LoRA,
T002587/T002606) den vollständigen Zyklus Messung → Template-Guard → Training → GGUF-Export.
Relevant für diese Evaluierung:

- Korpus: 363 Factory-Trace-Zeilen; Tokenlängen median 951, p90 2025, p99 4875, max 5611;
  bei gewählter Seq-Len 3072 wurden 2.75 % der Zeilen gekürzt (Messbericht).
- LoRA-Basis: r=16, alpha=16, lr=2e-4, 60 Steps, max_seq_length=3072 (`lauf1-config.json`).
- Template-Lektion (T006252): Qwen3.5-Hub-Templates enthalten den `{% generation %}`-Marker
  nicht — ohne gepatchtes Template verwirft `train.py` alle Zeilen. Der Byte-Gleichheits-Guard
  (`template_guard.py`) gegen das Hub-Template ist Pflicht vor jedem Lauf.
- Eval-Lektion: der trainierte Adapter erzielte im Paired Measurement aggregate 0.0 gegen
  Base 0.295 (Regressionen `overall` und `action`) — die Pipeline trägt, die
  Qualitätssicherung des Adapters ist noch unverstanden. Diese Offenheit fließt in die
  Akzeptanzkriterien unten ein.

## Methodik

Die Kriterien folgen `design.md` D3/D4/D5:

1. **Tokenizer-Match (hart, Draft-Rolle, D3).** Speculative Decoding scheitert an
   Vocab-Mismatch. Geprüft wurde lokal im Hugging-Face-Cache (2026-08-24): Vergleich der
   `tokenizer.json` von Resident und Kandidat nach Vocab-Inhalt (Token-ID-Paare) und
   Merge-Regeln als Menge. Ergebnis: die gesamte Qwen3.5-Familie (0.8B/2B/4B/text-4B)
   teilt mit dem Resident exakt 248044 BPE-Einträge und mengenidentische Merge-Regeln;
   einzige Differenz sind sieben Audio-/TTS-Special-Token ab ID 248070 in den Added-Tokens,
   die Textproposals nicht berühren. Das frühere Qwen3 (vocab_size 151936) und alle
   Fremdfamilien fallen durch diesen Test. Grenze des Verfahrens: die End-to-End-Akzeptanz
   im llama.cpp-Speculation-Betrieb bleibt bis zur Integration ein unbestätigtes Versprechen
   und wird im Folge-Ticket gemessen, nicht hier behauptet.
2. **QLoRA-VRAM-Fit (D4).** Maßgeblich ist der geteilte 16-GB-Haushalt. Lokale Belege:
   der 4.33-B-Lauffall benötigte per GPU-Lock 4800 MiB; die Heuristik-Matrix des
   Messberichts stuft selbst 7 B bei Seq-Len 3072 auf geschätzte 6.47 GB und 9 B auf
   8.70 GB als fit ein (Schaetzmodell, kein gemessener Lauf). Alle Kandidaten ≤ 8 B
   erfüllen das Kriterium damit konservativ; die Matrix führt es pro Kandidat.
3. **Rollengerechtes Eval-Protokoll (D5).**
   - **Worker:** Paired Measurement via `scripts/finetune/eval_harness.py` gegen das
     Testset-Format `scripts/finetune/testsets/agent-actions.jsonl` (Klassen
     `action`/`no_action`/`clarify`, en/de-Paare, ≥ 40 Fälle laut `validate-testset`).
     Akzeptanz = SSOT-Regression-Gate (`openspec/specs/unsloth-eval-harness.md`):
     Exit 0 erst wenn das adaptierte Modell das Basismodell aggregate erreicht oder
     übertrifft, keine Partitions-Regression.
   - **Router:** Intent-Micro-Bench auf einem Factory-Trace-Testset, gebaut mit
     `collect_factory_traces.py` (`--rows-json` aus dem mcp-postgres-Export von
     `tickets.factory_phase_events`, nur verify/done-Läufe, Secret-Redaktion inklusive).
     Akzeptanz: dieselbe Gate-Semantik gegen den ungefilterten Resident-Baseline-Lauf
     auf demselben Bench.
   - **Draft:** Messung im Integrationsticket: Akzeptanzrate der Draft-Tokens und netter
     Decode-Durchsatz gegen die oben zitierten Solo-Baselines des Resident bei identischem
     Promptmix, plus Start- und Stabilitätsprüfung des Servers mit Draft im konfigurierten
     Kontextfenster. Zur Einordnung der Größenordnung: der MTP-Head des Qwen3.8-Loadouts
     kostete gemessen ~1235 MiB VRAM — Spekulations-Overhead ist real und wird neu gemessen.

**Serving-Pfad-Randbedingung.** FreeToken serviert GGUF nur für Gemma-Architekturen;
Nicht-Gemma-Tandem-Modelle ride den llamacpp-Fallback-Pfad (vgl. T015175). Die
Kontrastkandidaten sind in der Matrix deshalb mit ihrem Pfad-Vorteil bewertet, die
Empfehlungen tragen diese Abwägung offen mit.

## Empfehlung je Rolle

Alle Verdicts verweisen auf `docs/finetune/tandem-candidates.json` (Slugs in Klammern);
keine Zahl dieses Abschnitts liegt außerhalb der Matrix.

### Rolle (a): Draft für Speculative Decoding — `qwen35-text-4b-lauf1`

**Empfehlung: techwithsergiu/Qwen3.5-text-4B (4.33 B, lokal gezählt).**

- Tokenizer-Match mit dem Resident ist lokal verifiziert (Vocab-Inhalt und Merge-Menge
  identisch; sieben Audio-Sondermarker betreffen Text nicht) — das harte D3-Kriterium.
- Reine `Qwen3_5ForCausalLM`-Architektur ohne Vision-/Audio-Projektor: als Draft im
  llama.cpp-Server ladbar, ohne die ConditionalGeneration-Wrappers zu schleppen, die die
  Geschwister mitbringen.
- Einziger Kandidat mit bewiesenem Ende-zu-Ende-Zyklus: Lauf 1 trainierte genau dieses
  Modell und exportierte ein benanntes GGUF. Das Integrationsrisiko ist das kleinste
  verfügbare.

**Verworfene Alternativen:** `qwen35-4b` und `qwen35-2b` (verifiziert kompatibel, aber
ConditionalGeneration-Wrappers bzw. unbelegte Akzeptanzrate — als Reserve-Kandidaten in der
Matrix gehalten); `qwen35-08b-base` (kompatibel und schnell, Base-only, Akzeptanzrate
unbelegt — zweiter Reserve-Kandidat); `qwen3-06b-legacy` (**ausgeschlossen**: vocab_size
151936 ≠ 248320, lokal belegt — derselbe Hersteller garantiert keine Kompatibilität);
`gemma4-e2b-it` (**ausgeschlossen**: andere Tokenizer-Familie; ihr MTP-Modul paart sich mit
Gemma-Zielen, nicht mit dem Qwen-Resident); `llama32-1b-class` (**ausgeschlossen**,
Modellkartenlage, nicht lokal verifiziert).

### Rolle (b): Mini-Router / Intent-Classifier — `qwen35-2b`

**Empfehlung: unsloth/Qwen3.5-2B (2.27 B, lokal gezählt).**

- Kleinstes instruct-getuntes Mitglied der kompatiblen Familie: im sequenziellen
  chat-gpu-Betrieb minimales Umschaltgewicht, und die Rolle wird ohnehin per LoRA auf
  Factory-Traces geformt — Instruct-Qualität dieser Größe reicht klassischerweise für
  die Dreiklassen-Entscheidung route/clarify/no-op.
- Akzeptanz entscheidet das Intent-Micro-Bench gegen den Resident-Baseline, nicht die
  Modellkarte.

**Verworfene Alternativen:** `qwen35-text-4b-lauf1` und `qwen35-4b` (für eine
häufig aufgerufene Klassifikationsrolle unwirtschaftlich groß); `qwen35-08b-base`
(nur nach vollem Verhaltensaufbau per SFT denkbar; angesichts der Lauf-1-Eval-Lektion
zu riskant); `qwen3-06b-legacy` (vorherige Generation, Notfall-Fallback);
`gemma4-e2b-it` (Serving-Pfad-Vorteil auf FreeToken-Seite, aber Pipeline-Neuland —
bleibt bewusster Kontrastkandidat); `llama32-1b-class` (reine Kontrastfamilie ohne
lokale Basis).

### Rolle (c): Background-Worker — `qwen35-4b`

**Empfehlung: unsloth/Qwen3.5-4B (4.66 B, lokal gezählt).**

- Größtes dense instruct-getuntes Mitglied der kompatiblen Familie innerhalb der 8-B-Grenze:
  bestes Qualitätsfenster für Summarize/Tag/Extract bei durch Lauf 1 gedecktem VRAM-Fit
  (Geschwisterklasse 4.33 B forderte 4800 MiB; die Schaetzungsmatrix stuft sogar 7 B als fit).
- Instruct-Variante mit bekanntem Template-Thema: der Hub-Template-Guard-Zyklus aus Lauf 1
  ist wiederholbar.

**Verworfene Alternativen:** `qwen35-text-4b-lauf1` (text-only genügt der Rolle zwar, aber
ausgerechnet dieser Checkpoint trägt die offene Eval-Regression aus Lauf 1 — zuerst zu
klären); `qwen35-2b` (Rückfallebene, falls das Paired Measurement der 4.66 B scheitert oder
das VRAM-Fenster unter Serving-Restlast zu knapp wird); `qwen3-06b-legacy`,
`gemma4-e2b-it`, `llama32-1b-class` (Qualitäts- bzw. Pipeline-Argumente wie oben).

**Familiäre Gesamtentscheidung.** Sämtliche drei Empfehlungen stammen aus der Qwen3.5-
Linie. Das ist keine Bestätigungsschwäche, sondern das Ergebnis der harten Schnitte: nur
diese Linie besteht den Tokenizer-Test (Draft) und bringt die einzige lokal bewiesene
Trainings-/Export-Pipeline mit. Die Kontrastfamilien (Gemma 4, Llama-3.2-Klasse) bleiben in
der Matrix mit ihren Pfad-Vorteilen bewertet stehen — `gemma4-e2b-it` ist der erste
Ersatzkandidat, falls der llamacpp-Fallback-Pfad für Nicht-Gemma in der Integration scheitert.

## Trainingsplan je Empfehlung

Gemeinsame Vorbedingungen für alle Läufe (Reihenfolge laut `scripts/finetune/README.md`):
1. `measure_corpus.py` auf dem jeweiligen Korpus (immer zuerst),
2. `template_guard.py` Hub-Template gegen gepatchtes Template (Byte-Gleichheit abzüglich
   Generation-Markers — Pflicht, Befund T006252),
3. `train.py` (bricht ohne 1./2. ab; GPU-Arbitrierung via `scripts/gpu-lock.sh`),
4. `export_gguf.py` mit `--slot-name` (Merge-Speichercheck inklusive; Registrierung im
   llm-proxy ist ein manueller Folgeschritt).

### Trainingsplan Draft — `qwen35-text-4b-lauf1`

- **Zielbild:** kein neues Training ist zwingend — Lauf 1 hat bereits einen Adapter und ein
  benanntes GGUF dieses Modells erzeugt. Erst auswerten, dann nachtrainieren: der existierende
  Adapter geht ins Integrationsticket (Speculation-Messung); ein Nachtraining nur falls die
  Akzeptanzrate unzureichend bleibt.
- **Falls Nachtraining:** Korpus `collect_factory_traces.py`-Option (`--rows-json` aus dem
  mcp-postgres-Export, `--with-context` für Beschreibung+Kommentare als Turns); LoRA-Basis
  aus `lauf1-config.json`: r=16, alpha=16, lr=2e-4, max_seq_length=3072 (Kürzung 2.75 %),
  Steps nach Korpusgröße neu über den Messbericht leiten; Template-Guard-Pflicht wie oben.
- **Export/Akzeptanz:** `export_gguf.py --slot-name <draft-slug>`; Erfolgskriterium im
  Integrationsticket: netter Decode-Durchsatz mit Draft > Solo-Baseline des Resident
  (~104 tok/s kurz bzw. 62–70 tok/s bei 63k, gemessen 2026-08-23) bei stabilem Serverstart
  im konfigurierten Kontextfenster; zusätzlich Tokenizer-Identität im Export gegengeprüft
  (die sieben Audio-Marker dürfen in Textproposals nicht auftreten).

### Trainingsplan Router — `qwen35-2b`

- **Korpus:** Factory-Trace-Testset und -Trainingskorpus aus `collect_factory_traces.py`
  (`--with-context`); Ergänzung um absichtlich mehrdeutige Fälle für die `clarify`-Partition
  (Testset-Anforderungen: ≥ 40 Fälle, en/de-Paare, alle drei Partitionen nichtleer).
- **LoRA-Basis:** r=16, alpha=16, lr=2e-4 aus `lauf1-config.json`; max_seq_length nach
  Messbericht wählen (Router-Prompts sind kurz; der Bericht liefert die Verteilung, keine
  Annahme); Steps moderat, Overfitting der Dreiklassenentscheidung vermeiden.
- **Template-Guard:** Pflicht (Instruct-Modell mit Chat-Template).
- **Export/Akzeptanz:** Slot-Export wie oben; Gate: Intent-Micro-Bench gegen den
  Resident-Baseline mit SSOT-Regression-Semantik (Exit 0 = keine Aggregate-Unterbieterung,
  benannte Partitions-Regressionen blockieren); Latenzmessung des Klassifikationsschritts
  geht ins Ticket-Ergebnis, eine Schwellwertsetzung erfolgt dort auf Messbasis.

### Trainingsplan Worker — `qwen35-4b`

- **Korpus:** `collect_factory_traces.py` mit `--with-context --comments-json` — die
  Worker-Aufgaben (Summarize/Tag/Extract) profitieren direkt von Beschreibungs- und
  Kommentar-Turns; Secret-Redaktion gilt automatisch.
- **LoRA-Basis:** r=16, alpha=16, lr=2e-4, max_seq_length=3072 aus `lauf1-config.json`
  (p95 2430 Tokens deckt die Korpuslänge ab); Steps über den frischen Messbericht ableiten.
- **Template-Guard:** Pflicht; Hub-Template des 4.66-B-Modells neu laden und patchen —
  das gepatchte Template aus Lauf 1 gehört zum text-4B-Modell und ist nicht übertragbar.
- **Export/Akzeptanz:** `export_gguf.py --slot-name <worker-slug>`; Gate: Paired Measurement
  `eval_harness.py` auf `agent-actions.jsonl` plus einer Worker-Aufgabenpartition aus
  Traces, SSOT-Regression-Gate als harte Schwelle; Rückfallebene bei Scheitern: `qwen35-2b`.

## Folge-Tickets (Vorschläge)

1. **Training Router (`qwen35-2b`)** — Korpora bauen, Guard/Messzyklus, Trainingslauf,
   Micro-Bench, Export. Kleinster eigenständiger Schritt mit klarem Gate.
2. **Training Worker (`qwen35-4b`)** — gleiche Pipeline, größerer Korpusanteil mit
   `--with-context`; Rückfallebene `qwen35-2b` im Ticket verankern.
3. **Draft-Integration & Speculation-Messung (`qwen35-text-4b-lauf1`)** — existierenden
   Adapter/GGUF im llama.cpp-Fallback-Pfad als Draft anschließen, Akzeptanzrate und netten
   Durchsatz gegen die Solo-Baselines messen, Entscheidung Nachtraining ja/nein.
4. **Loadout-Integration Router/Worker** — neue Loadout-Slugs in `scripts/llm/loadouts.json`
   und Provider-Einträge; **Koordinationspflicht mit T015175-artigen Loadout-Änderungen:
   nicht parallel**, da beide dasselbe File-Set und denselben exklusiven GPU-Slot berühren.
5. **Offene Punkte aus Lauf 1** — Ursache der Eval-Regression (tuned aggregate 0.0) klären,
   bevor Worker- und etwaige Draft-Nachtrainings bewertet werden; sonst misst das Gate nur
   die Reproduktion eines Defekts.

## Grenzen

- Die Draft-Akzeptanzrate ist lokal nicht messbar und wird bewusst nicht numerisch
  behauptet; das Integrationsticket misst sie gegen die deklarierten Solo-Baselines.
- Die VRAM-Feasibilitywerte der Messberichte sind Heuristik-Schaetzungen; der einzige
  harte Punkt ist der Lauf-1-Istwert (4800 MiB angefordert für 4.33 B bei Seq-Len 3072).
- Parameterzahlen der Kontrastfamilien (Gemma-E-Serie effektiv vs. roh, Llama-3.2-Klasse)
  beruhen auf öffentlicher Modellkartenlage und sind als solche markiert; vor einer realen
  Auswahl wäre der lokale Download plus Messzyklus Pflicht.
- Die sieben differierenden Added-Tokens (Audio/TTS-Marker) sind im Textbetrieb wirkungslos,
  wurden aber nicht end-to-end gegen den FreeToken-Resident geprüft — Gegenprüfung im
  Integrationsticket.
