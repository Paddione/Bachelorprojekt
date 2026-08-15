# Messbericht — S3: Finetuning-Datensatz-Rezept auf Factory-Traces (T006252)

Stand der Messungen: 2026-08-15, Worktree `s3-finetune-dataset-recipe` (Branch
`feature/s3-finetune-dataset-recipe-T006252`). Skript-Stand: Commit `d4d641104`
(plus die in diesem Ticket committeten Guard-Erweiterungen). Alle Korpus-Artefakte
liegen unter `scripts/finetune/outputs/` (gitignored, per Befehl regenerierbar).

Dieser Bericht ist die Vorbedingung fuer das Folge-Lauf-Ticket (E6, echter GPU-Trainingslauf
auf der RTX 5070 Ti 16 GB, `chat-gpu`-exclusiveGroup). Er dokumentiert das Rezept-Gate
(Design „Recipe-Anforderungen") inkl. des entscheidenden Befunds zum Chat-Template.

---

## 1. Korpus & Datensatz-Beschaffung

Phase-Events und Kommentare kamen aus `tickets.factory_phase_events` (JOIN `tickets.tickets`,
SQL aus design.md „Datensatz-Beschaffung" Schritt 2), abgerufen ueber `mcp-postgres`
(READ-ONLY) und in Dateien umgeleitet:

```bash
# MCP-Aufruf: mcp__mcp-postgres__query mit dem Phase-Event-SQL (design.md Schritt 2),
# JSON-Ergebnis nach scripts/finetune/outputs/rows-verify-done.json
# zweiter MCP-Aufruf mit dem Kommentar-SQL, Ergebnis nach scripts/finetune/outputs/comments-verify-done.json
```

Stand: **4251 Phase-Event-Zeilen** (rows-verify-done.json), **1028 Kommentarzeilen**
(comments-verify-done.json). Der Kollektor filtert auf Laeufe mit `verify`/`done`-Event.

JSONL-Export mit Kontext-Anreicherung (E7-Rollen: `claude-code`/`factory` → assistant,
Fremdautoren → user):

```bash
task finetune:traces \
  ROWS_JSON=scripts/finetune/outputs/rows-verify-done.json \
  COMMENTS_JSON=scripts/finetune/outputs/comments-verify-done.json \
  WITH_CONTEXT=1 \
  OUT=scripts/finetune/outputs/s3-qwen35-lauf1.jsonl
```

Ergebnis: **358 erfolgreiche Laeufe** (358 JSONL-Zeilen), 1080 user-/1002 assistant-Turns
(plus System-Turns), 338 Zeilen mit Kontext-Turns.

## 2. DSGVO-Stichproben-Pass

Scan der finalen Artefakte auf Personen-/Kontaktdaten (regex-basiert, 2026-08-15,
gegen Commit `d4d641104`):

```bash
python3 - <<'EOF'
import json, re
from pathlib import Path
OUT = Path("scripts/finetune/outputs")
email = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
iban  = re.compile(r"\b[A-Z]{2}[0-9]{2}[A-Za-z0-9]{11,30}\b")
phone = re.compile(r"(?:\+49|0049|0[1-9])\s?[0-9()/\- ]{6,}")
for label, p in {"korpus": OUT/"s3-qwen35-lauf1.jsonl",
                 "rows": OUT/"rows-verify-done.json",
                 "comments": OUT/"comments-verify-done.json"}.items():
    text = p.read_text()
    print(label, "Emails", len(email.findall(text)), "IBAN", len(iban.findall(text)),
          "Phone", len(phone.findall(text)))
EOF
```

**Ergebnis: GATE PASSED.** Emails: 0, IBANs: 0 in allen drei Artefakten. Die
Phone-Kandidaten sind ausnahmslos Maschinenkontext (Kontextpruefung der Treffer):
Datumsfragmente (`026-07-03` = 2026-07-03), SQL-Migrationsdateinamen
(`2026-07-03-context-budget.sql`), Testzaehler (`5/5`), Pfade. Keine personenbezogenen
Telefonnummern, keine Brand-/Kontaktdaten. Zusaetzlich redigiert der Kollektor bekannte
Secret-Muster (siehe `SECRET_PATTERNS`, `collect_factory_traces.py`).

## 3. E5-Gate — Unsloth-Support fuer Qwen3.5-4B

**Befund: GEPATCHT — Support vorhanden.** (Verifiziert ueber den `unsloth-buddy`-Skill und
den Hugging Face Hub, 2026-08-15.)

- Unsloth unterstuetzt Qwen3.5-Finetuning: PR #5442 (Loss-Patch fuer
  `Qwen3_5ForConditionalGeneration` — Loss-Typ „ForConditionalGeneration" verhindert fp32
  OOM auf GPUs <= 24 GB bei ~248k Vokabular); PR #6968 (Transformers-5.x-Sidecar fuer die
  `TokenizersBackend`-Tokenizerklasse). Community-Finetunes existieren fuer 0.8B/2B/9B/27B.
- **Architektur-Kaveat (wichtig fuer das Folge-Ticket):** Das Flaggschiff `Qwen/Qwen3.5-4B`
  ist MULTIMODAL (`qwen3_5`, AutoModelForMultimodalLM, Vision-Turm mit 24 Layern, mrope,
  4659,9M Parameter). Die Text-Variante fuer die reine Chat-Pipeline ist
  **`techwithsergiu/Qwen3.5-text-4B`** (`qwen3_5_text`, `Qwen3_5ForCausalLM`, vocab 248320,
  hidden 2560, 32 Layer, hybrid linear/full attention 3:1, `transformers_version`
  5.3.0.dev0, `tie_word_embeddings`). Das Parent-Design (T006143) deployt
  `unsloth/Qwen3.5-4B-GGUF` (Q6_K, Basis multimodal) auf PK-L-1.
- **Konsequenz:** transformers >= 5.x erforderlich (TokenizersBackend). Der Trainings-Pfad
  dieses Rezepts zielt auf die Text-Variante; die Multimodal-Basis deckt einen
  Fallback-Pfad ab.

Kein TRL-Fallback noetig (Befund „gepatcht", Design-Entscheidung: keine Fallback-Route).

## 4. Messung — Token-Laengenverteilung

```bash
task finetune:measure CORPUS=scripts/finetune/outputs/s3-qwen35-lauf1.jsonl \
  MODEL=qwen3.5-text-4b OUT=scripts/finetune/outputs/measure-report-s3-qwen35-lauf1.json
```

Report: `scripts/finetune/outputs/measure-report-s3-qwen35-lauf1.json` (358 Zeilen).

| Kennzahl | Wert |
|---|---|
| Median | 805,5 Token |
| p90 | 1706,2 |
| p95 | 2092,7 |
| p99 | 4159,76 |
| Max | 4913 |
| Truncation bei 2048 | 5,87 % (21 Zeilen) |
| Truncation bei 3072 | 1,96 % (7 Zeilen) |

Abweichung dokumentiert: `measure_corpus.py` nutzt ohne Tokenizer-Datei die heuristische
Schaetzung (~4 Zeichen/Token, `tokenizer_source: "heuristic-4-chars-per-token"`); eine
exakte Verteilung mit dem echten Tokenizer (Qwen3.5-text-4B) ist Teil der Vorbedingungen
des Folge-Tickets, die Perzentile sind aber bereits laufbar.

**max_seq_length-Empfehlung: 3072** (1,96 % Kuerzung; 16-GB-Karte siehe unten).

Machbarkeitsmatrix: `MODEL_PROFILES` in `measure_corpus.py` hat **kein**
qwen3.5-4b-Profil (nur gemma-2/qwen2.5) — manuelle Zeile fuer RTX 5070 Ti 16 GB nach
der Formel des Skripts (`weight_gb = params_b * 0.5` bei 4-bit; `activations_gb =
hidden*layers*seq*2*4/1e9`; optimizer 0.5):

- Text-Variante ~3,7–4,0 Mrd. Parameter (Schaetzung aus config.json: hidden 2560 × 32
  Layer × ~97M/Block + tied embeddings ~636M; Flaggschiff 4659,9M als obere Grenze)
  → Gewicht 4-bit ≈ **1,85–2,33 GB**.
- Aktivierungen bei seq 3072: 2560 × 32 × 3072 × 8 / 1e9 ≈ **2,01 GB**.
- Optimizer-Zuschlag 0,5 GB → Summe ≈ **4,4–4,8 GB** → passt mit grossem Puffer auf 16 GB.

## 5. Template-Guard — Byte-Gleichheit Hub vs. gepatcht

```bash
python3 scripts/finetune/template_guard.py \
  --hub-template scripts/finetune/outputs/hub-template-qwen35-text-4b.jinja \
  --patched-template scripts/finetune/outputs/patched-template-qwen35-text-4b.jinja \
  --corpus scripts/finetune/outputs/s3-qwen35-lauf1.jsonl
```

**Ergebnis: GATE PASSED.** `OK: 358 Korpuszeilen (je 2 Renderings) sind byte-identisch.`
(Exit 0.) Zusaetzliche Verifikation unter der echten Tokenizer-Umgebung
(lstrip_blocks=True, transformers-env): 358 Zeilen, 0 Abweichungen — d.h. Training
(gepatcht) und Serving (Hub) rendern dieselben Bytes.

**Befund am Guard (in diesem Ticket behoben):** Der Guard konnte den Generation-Marker
`{% generation %}...{% endgeneration %}` nicht parsen (plain jinja2 kennt den Tag nicht;
`TemplateSyntaxError`). Der Marker ist Pflicht fuer assistant-only Loss
(`return_assistant_tokens_mask=True`, transformers-AssistantTracker-Semantik) — ohne ihn
liefert `apply_chat_template` keine Masken. `template_guard.py` registriert den Tag jetzt
als Pass-through-Extension (rendert den Body unveraendert, identische Parsing-Semantik wie
transformers `chat_template_utils.py`). Vier BATS-Blöcke in
`tests/spec/unsloth-training-env/template-guard.bats` sichern das ab (2 Bestand + 2 neu).

Abgrenzung (dokumentiert im Guard-Docstring): Falle 1 (Assistant-Header im
Generation-Block) ist ueber Bytes NICHT erkennbar — der Marker rendert den Header mit.
Mechanisch abgedeckt wird Falle 1 durch die Lernsignal-Messung (Abschnitt 6) und
`train.py` (verwirft Zeilen ohne Lernsignal). Falle 2 (fehlende Whitespace-Kontrolle) ist
Lint-Warnung, keine harte Sperre.

## 6. Lernsignal-Befund — der entscheidende Punkt fuer das Folge-Ticket

**Messung** (echter Tokenizer `techwithsergiu/Qwen3.5-text-4B`, Spiegel von
`tokenize_row_with_assistant_mask` in `train.py`, Stand Commit `d4d641104`):

```bash
/home/patrick/.venvs/unsloth/bin/python - <<'EOF'
import json
from pathlib import Path
from transformers import AutoTokenizer

OUT = Path("scripts/finetune/outputs")
rows = [json.loads(l) for l in (OUT/"s3-qwen35-lauf1.jsonl").read_text().splitlines() if l.strip()]
tok = AutoTokenizer.from_pretrained("techwithsergiu/Qwen3.5-text-4B", trust_remote_code=True)
for label, tpl in (("hub", OUT/"hub-template-qwen35-text-4b.jinja"),
                   ("patched", OUT/"patched-template-qwen35-text-4b.jinja")):
    tok.chat_template = tpl.read_text()
    for msl in (2048, 3072):
        dropped = 0; total = 0; signal = 0
        for row in rows:
            enc = tok.apply_chat_template(row["messages"], tokenize=True,
                                          add_generation_prompt=False, return_dict=True,
                                          return_assistant_tokens_mask=True,
                                          max_length=msl, truncation=True)
            masks = enc.get("assistant_masks")
            if masks is None or sum(masks) == 0:
                dropped += 1; continue
            total += len(enc["input_ids"]); signal += sum(masks)
        print(f"{label:8s} msl={msl}: dropped {dropped}/{len(rows)}, "
              f"signal_frac={signal/total if total else 0.0:.4f}")
EOF
```

**Ergebnis:**

| Template | max_seq_length | verworfen | Lernsignal-Anteil |
|---|---|---|---|
| **Hub** (unpatched) | 2048 | **358/358 (100 %)** | 0,0000 |
| **Hub** (unpatched) | 3072 | **358/358 (100 %)** | 0,0000 |
| **Gepatcht** | 2048 | 6/358 (1,7 %) | **0,3891** |
| **Gepatcht** | 3072 | 3/358 (0,8 %) | **0,4039** |

**Ursache:** Beide Qwen3.5-Chat-Templates (offizielles `Qwen/Qwen3.5-4B/chat_template.jinja`
UND `techwithsergiu/Qwen3.5-text-4B` tokenizer_config) enthalten den Marker
`{% generation %}` NICHT — sie rendern den Assistant-Header direkt ueber
`add_generation_prompt`. Damit erzeugt `return_assistant_tokens_mask=True` keine Masken
(Warnung: „chat template does not contain `{% generation %}` keyword"), und `train.py`
wuerde mit **„FEHLER: kein Korpuszeile mit Lernsignal nach Kuerzung uebrig."** abbrechen.

**Behebung (im Rezept verifiziert):** Gepatchtes Template
`scripts/finetune/outputs/patched-template-qwen35-text-4b.jinja` — Assistant-Header
AUSSERHALB des Blocks, Marker mit Whitespace-Kontrolle um die Generation-Region
(Think-Block + Antwort):

```bash
# Erzeugung aus dem Hub-Template (Patched = Hub + Marker, sonst byte-identisch):
python3 - <<'EOF'
import json, pathlib
hub = pathlib.Path("scripts/finetune/outputs/hub-template-qwen35-text-4b.jinja").read_text()
OLD = """        {%- if loop.index0 > ns.last_query_index %}
            {{- '<|im_start|>' + message.role + '\\n<think>\\n' + reasoning_content + '\\n</think>\\n\\n' + content }}
        {%- else %}
            {{- '<|im_start|>' + message.role + '\\n' + content }}
        {%- endif %}"""
NEW = """        {{- '<|im_start|>' + message.role + '\\n' -}}
        {%- generation -%}
        {%- if loop.index0 > ns.last_query_index -%}
{{- '<think>\\n' + reasoning_content + '\\n</think>\\n\\n' + content -}}
        {%- else -%}
{{- content -}}
        {%- endif -%}
        {%- endgeneration -%}"""
assert OLD in hub
pathlib.Path("scripts/finetune/outputs/patched-template-qwen35-text-4b.jinja").write_text(hub.replace(OLD, NEW))
EOF
```

Die verbleibenden wenigen verworfene Zeilen sind designte Semantik: Assistant-Anteil nach
Kuerzung vollstaendig ausserhalb des Fensters.

## 7. DRY_RUN-Gate

```bash
python3 scripts/finetune/train.py \
  --corpus scripts/finetune/outputs/s3-qwen35-lauf1.jsonl \
  --model techwithsergiu/Qwen3.5-text-4B \
  --measure-report scripts/finetune/outputs/measure-report-s3-qwen35-lauf1.json \
  --hub-template scripts/finetune/outputs/hub-template-qwen35-text-4b.jinja \
  --patched-template scripts/finetune/outputs/patched-template-qwen35-text-4b.jinja \
  --max-seq-length 3072 \
  --dry-run
```

**Ergebnis: GATE PASSED.** Exit 0, `OK (dry-run): Vorbedingungen erfuellt, Konfiguration
gueltig.` — Messbericht vorhanden, Template-Guard als Vorbedingung bestanden
(byte-identisch), LoRA-Konfiguration gueltig (r=16, alpha=16, max_steps=60).

## 8. Fazit und Vorbedingungen fuer das Folge-Lauf-Ticket (E6)

Alle Recipe-Gates gruen; die Pipeline ist bis zum echten Trainingsstart verifiziert:

1. **PATCHED_TEMPLATE ist Pflicht.** Das Hub-Template allein (Qwen3.5, offiziell ODER
   Text-Variante) erzeugt keine assistant-Masken → 100 % Zeilenverwurf → Abbruch in
   `train.py`. `--patched-template` muss die Datei aus Abschnitt 6 (Marker nach dem
   Header, `{%- generation -%}`) sein.
2. **`max_seq_length = 3072`** (1,96 % Kuerzung), RTX 5070 Ti 16 GB reicht (~4,5 GB
   geschaetzt inkl. Overhead, GPU-Lock `chat-gpu`).
3. **Umgebung:** transformers >= 5.x (TokenizersBackend), Modell
   `techwithsergiu/Qwen3.5-text-4B` (Text-Variante; Flaggschiff ist multimodal).
4. Template-Guard vor jedem Lauf gegen den Korpus (jetzt mit Marker-Unterstuetzung);
   Lernsignal-Anteil bei ~0,39–0,40 erwartet.
