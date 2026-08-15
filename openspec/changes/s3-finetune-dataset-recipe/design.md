---
ticket_id: T006252
plan_ref: openspec/changes/s3-finetune-dataset-recipe/tasks.md
status: active
date: 2026-08-15
---

# Design: S3 — Datensatz- und Recipe-Anforderungen für das Unsloth-Finetuning der Unterstützermodelle

## Zweck

S3 aus T006143 (Design-Doc `2026-08-15-laptop-bge-topologie-design.md`, E5): Die beiden
Unterstützermodelle der Laptop-Topologie (Qwen3.5-4B für PK-L-1, Gemma-4-12B für PK-Tablet)
werden mit der bestehenden Pipeline (`scripts/finetune/`, Unsloth/TRL) auf die eigenen
Factory-Konventionen feingetunt. Dieses Dokument legt fest, **welche Daten** beschafft werden
und **welches Recipe** (Reihenfolge, Parameter, Gates) für die Läufe gilt — bevor ein einziger
GPU-Lauf startet.

Der Scope ist bewusst auf Datensatz + Recipe begrenzt. Die eigentliche Trainingsdurchführung
ist die Vollabnahme (T002606-Muster); das Deployment auf die Geräte gehört zu S2 (T006143).

**Scope-Entscheidung (Brainstorming 2026-08-15, User-Freigabe):** Der T006252-Plan endet bei
**DRY_RUN-grün** — Anreicherung implementiert und getestet, Korpus gezogen, DSGVO-Stichprobe
bestanden, E5-Gate geprüft, measure/guard grün, `train DRY_RUN=1` grün. Der echte GPU-Lauf
inkl. Eval-Gate wird ein **eigenes Lauf-Ticket** (E6: das Kapazitätsfenster auf der
Serving-GPU wird dort geplant).

## Befunde (Recon 2026-08-15, MESSUNG mit Befehl — T002717)

Alle Messungen per `mcp__mcp-postgres__query` (read-only, mentolder-DB) am 2026-08-15:

```sql
-- MESSUNG 1: Verify-Phase-Events nach State
SELECT state, count(*) AS n FROM tickets.factory_phase_events
WHERE phase='verify' GROUP BY state ORDER BY n DESC;
-- Ergebnis: done=408, entered=266, pass=0
```

```sql
-- MESSUNG 2: Korpusumfang (Tickets mit verify+done)
SELECT count(DISTINCT ticket_id) AS tickets_verify_done
FROM tickets.factory_phase_events WHERE phase='verify' AND state='done';
-- Ergebnis: 354
```

```sql
-- MESSUNG 3: Event-detail-Laengen (Zeichen)
SELECT avg(length(detail))::int AS avg_chars,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY length(detail))::int AS p50,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY length(detail))::int AS p90,
       max(length(detail)) AS max_chars
FROM tickets.factory_phase_events
WHERE phase='verify' AND state='done' AND detail IS NOT NULL;
-- Ergebnis: avg=62, p50=44, p90=129, max=344
```

```sql
-- MESSUNG 4: Anreicherungsvolumen der 354 verifizierten Tickets
SELECT avg(length(t.description))::int AS avg_desc,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY length(t.description))::int AS p50_desc,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY length(t.description))::int AS p90_desc
FROM tickets.tickets t
WHERE t.id IN (SELECT ticket_id FROM tickets.factory_phase_events
               WHERE phase='verify' AND state='done') AND t.description IS NOT NULL;
-- Ergebnis: avg=1933, p50=1629, p90=3560, max=16737

SELECT count(*) AS comments_total, count(DISTINCT ticket_id) AS tickets_with_comments
FROM tickets.ticket_comments
WHERE ticket_id IN (SELECT ticket_id FROM tickets.factory_phase_events
                    WHERE phase='verify' AND state='done');
-- Ergebnis: 1007 Kommentare auf 335 der 354 Tickets
```

Abgeleitete Volumina:

- **Roh-Korpus** (nur Phase-Events, wie `collect_factory_traces.py` heute rendert):
  354 Gespräche à ~200–600 Tokens → **~100–200k Tokens**. Dünn.
- **Angereichert** (Beschreibung + Kommentare): Beschreibung-Median 1.629 Zeichen
  (~400–500 Tokens), ~3 Kommentare je Ticket → **~350–500k Tokens** geschätzt. Für eine
  LoRA-Domänen-Feinjustage ausreichend; für Full-Finetuning nicht.

## Entscheidungen

### E1 — Gestaffelte Läufe: erst Qwen3.5-4B, dann Gemma-4-12B

Erst der kleine Lauf: Qwen3.5-4B (BF16 8,05 GB) schließt den Loop end-to-end mit schneller
Iteration (LoRA statt QLoRA, kurze Epochenzeiten) und beweist das Recipe auf dem
4B-Zielgerät PK-L-1. Danach derselbe Ablauf für Gemma-4-12B als QLoRA (BF16-Basis 23,8 GB
passt nicht in 16 GB VRAM — 4-bit ist Bedingung, kein Komfort).

### E2 — Korpus-Rezeptur: Factory-Traces + Anreicherung zuerst

Stufe 1 (dieses Design): Traces nach dem T006282-Fix, angereichert um Ticket-Beschreibung und
Kommentare. Stufe 2 (dokumentiert, nicht ausgeführt): OpenThoughts3-1.2M als generelles
Basis-Dataset (Dataset-Vorgabe aus `openspec/changes/unsloth-training-env/proposal.md`),
gefolgt vom Domänen-Feintune auf Traces. Stufe 2 ist eine eigene Kapazitätsentscheidung
(Download-Größe, mehrstündige GPU-Läufe auf der Serving-GPU) — bewusst NICHT Teil dieses
Designs.

### E3 — Vorbedingung: Collector-Fix T006282

`collect_factory_traces.py` filtert auf `verify + pass`, die Live-DB kennt nur
`done`/`entered` — der Korpus wäre heute leer (MESSUNG 1). T006282 (`blocks` T006252) stellt
den Erfolgsfilter auf die Aufnahme-Mechanik um (Referenz: `record_phase_event` kennt nur
`entered|done|blocked`). Kein Trainingsschritt vor diesem Fix.

### E4 — Quantisierung je Lauf

Lauf 1 (Qwen3.5-4B): LoRA auf BF16-Basis. Lauf 2 (Gemma-4-12B): QLoRA 4-bit (NF4).
Beide mit den LoRA-Defaults aus `train.py` (Rank 16, alpha = Rank, die sieben
Standardmodule, Dropout 0, rsLoRA aus) — Abweichungen nur mit Begründung aus dem
Messbericht.

### E5 — Unsloth-Architektur-Support ist ein Gate, keine Annahme

Qwen3.5 und Gemma 4 sind neuere Architekturen; Unsloth-Support ist vor jedem Lauf zu
verifizieren (Konsultation des `unsloth-buddy`-Skills bzw. der Unsloth-Doku für die exakten
Patch-APIs). Die Registry (`model_registry.adapters`) ist leer — es gibt in diesem Setup
**kein** bewährtes Basismodell; der erste Lauf ist zugleich Architektur-Erstflug.

### E6 — Kapazitätsfenster auf der Serving-GPU

Trainings-Host ist die RTX 5070 Ti (16 GB) — dieselbe GPU, die die Gemma26-Familie servt
(`exclusiveGroup: chat-gpu`). Ein Trainingslauf setzt voraus, dass die chat-gpu-Loadouts
gestoppt sind (die Gruppe modelliert genau diese Exklusivität). Das Fenster wird im
Lauf-Ticket geplant; die erwartete VRAM-Belegung liefert der Machbarkeitsbericht aus
`measure_corpus.py` (T002587-Lektion: Messung vor Modellwahl, nie geraten).

### E7 — Kommentar-Rollen im Trainingsformat

Kommentare werden chronologisch als Turns gerendert: Autoren `claude-code`/`factory` →
`assistant`, alle übrigen → `user`. Begründung: Die Factory-Kommentare sind die eigentliche
Arbeitshistorie (Entscheidungen, Befunde); Kommentare Dritter sind Kontext wie ein User-Turn.
Feinheiten (visibility internal/public, Duplikate) klärt der Anreicherungs-Change.

## Datensatz-Beschaffung (Stufe 1)

1. **T006282 abschließen** — Erfolgsfilter `verify + done` (Fixture und Header-Kommentar in
   `tests/spec/unsloth-training-env/factory-traces.bats` angleichen).
2. **ROWS_JSON ziehen** (mcp-postgres, read-only) — die Collector-Eingangszeilen für alle
   verifizierten Tickets samt Anreicherung:

   ```sql
   SELECT e.ticket_id, t.external_id, t.title, t.description,
          e.phase, e.state, e.detail, e.at
   FROM tickets.factory_phase_events e
   JOIN tickets.tickets t ON t.id = e.ticket_id
   WHERE e.ticket_id IN (SELECT ticket_id FROM tickets.factory_phase_events
                         WHERE phase='verify' AND state='done')
   ORDER BY e.ticket_id, e.at;
   ```

   plus Kommentare:

   ```sql
   SELECT c.ticket_id, c.author, c.body, c.created_at
   FROM tickets.ticket_comments c
   WHERE c.ticket_id IN (SELECT ticket_id FROM tickets.factory_phase_events
                         WHERE phase='verify' AND state='done')
   ORDER BY c.ticket_id, c.created_at;
   ```

3. **Anreicherungs-Change** (eigener Task in T006252): `collect_factory_traces.py` um
   optionale Beschreibungs-/Kommentar-Turns erweitern (Flag-gesteuert, damit der
   bestehende Fixture-Test unverändert bleibt), Rollen-Mapping nach E7, Secret-Redaktion
   gilt für alle neuen Felder. `task finetune:traces` entsprechend erweitern.
4. **Ausgabe**: JSONL im TRL-Chat-Format (`scripts/finetune/README.md` "Korpusformat"),
   abgelegt unter `outputs/finetune/` (gitignored) — nie ins Repo.
5. **Stufe 2 (dokumentiert, nicht ausgeführt):** OpenThoughts3-1.2M via Hugging Face
   (`huggingface-cli`/`hf`-Skill, Datasets-Lizenz und Download-Größe vorab prüfen);
   Feintune-Reihenfolge: Basis-Lauf auf OpenThoughts3 → Domänen-Lauf auf Stufe-1-Korpus.

## Recipe-Anforderungen (Reihenfolge je Lauf, aus `scripts/finetune/README.md`)

| Schritt | Tool | Anforderung |
|---|---|---|
| 1. Messung | `task finetune:measure` | IMMER zuerst; `max_seq_length` aus den Perzentilen, Machbarkeitsmatrix je Kandidat. Der Stufe-1-Korpus ist kurz (T002587-Problem hier harmlos), aber die Messung entscheidet trotzdem — nie raten. |
| 2. Template-Guard | `task finetune:guard` | Referenz ist das **Hub-Template** des Basismodells (Qwen3.5-4B bzw. gemma-4-12B), nicht das vom Framework geschriebene. Byte-Gleichheit über den ganzen Korpus. |
| 3. Training | `task finetune:train` | Vorbedingungen aus 1.+2. hart; assistant-only loss über `assistant_masks`; Zeilen ohne Lernsignal verwerfen und zählen; Lernsignal-Anteil vor Schritt 1 ausgeben; QLoRA-Flag für Lauf 2; `DRY_RUN=1` vor dem GPU-Lauf. |
| 4. Export | `task finetune:export` | Speichercheck vor dem fp16-Merge; Hub-Template wird zurückgeschrieben (Adapter liefert nie das Trainings-Template). |
| 5. Eval-Gate | `task finetune-eval:*` (T002606) | Base-vs-Tuned-Regression: ein Adapter ohne Verhaltensmessung wird nicht ausgeliefert (Muster: 9/10→6/10-Fall aus T002587). |
| 6. Slot + Gerät | manuell (README) | Registrierung über `model-registry.sh`; Serving-Slot im llm-proxy; Geräte-Deployment (GGUF nach LM Studio auf PK-L-1 bzw. PK-Tablet) gehört zu S2/T006143. Kein automatischer Austausch eines laufenden Slots. |

## Reihenfolge & Tickets

```
T006282 (Collector-Fix, blocks)
   └─► T006252 Lauf 1: Qwen3.5-4B LoRA, Stufe-1-Korpus + Anreicherung
         └─► finetune-eval-Gate (T002606-Muster)
               └─► Lauf 2: Gemma-4-12B QLoRA (eigenes Ticket, gleiche Recipe-Tabelle)
                     └─► Eval-Gate → S2-Deployment (T006143)
```

## Offene Punkte

- **Kommentar-Lizenz/Sensibilität:** Kommentare enthalten operative Details (Befunde,
  Mängel). Die Secret-Redaktion des Collectors deckt Muster ab; vor dem ersten Export wird
  ein Stichproben-Durchlauf auf Personen-/Brand-Daten geprüft (DSGVO-Konvention).
- **OpenThoughts3-Download-Bandbreite und -Dauer:** erst bei Stufe-2-Entscheidung messen.
- **Unsloth-Support-Fallout:** Schlägt E5 fehl (Architektur ungepatcht), ist der Fallback
  TRL ohne Unsloth-Patching für Lauf 1 — oder ein älteres Basismodell mit bewiesenem
  Support; Entscheidung nach dem Gate-Befund, nicht vorab.

## Referenzen

- Design-Doc `2026-08-15-laptop-bge-topologie-design.md` (E5, S3-Scope)
- `openspec/changes/unsloth-training-env/` (Pipeline-Spec, T002587)
- `taskfiles/Taskfile.finetune-eval.yml` (Base-vs-Tuned-Gate, T002606)
- `scripts/finetune/README.md`, `collect_factory_traces.py`, `train.py`,
  `measure_corpus.py`, `template_guard.py`, `export_gguf.py`, `model-registry.sh`
- Skill `finetune-run` (Repo-Konventionen), Skill `unsloth-buddy` (Fachwissen)
