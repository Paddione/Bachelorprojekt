---
title: "mishap-t002408 — RAM/VRAM-Budgetrechnung für slot-gebundene KV-Caches"
ticket_id: T002408
domains: [llm, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002408 — Implementation Plan

_Ticket: T002408 (chore) · Spec: `openspec/changes/mishap-t002408/proposal.md`_

Dieser Plan implementiert eine parameterisierte Budget-Rechnung für die Epic-Frage:
wie viel VRAM brauchen `-kvu` vs. `-no-kvu` auf der RTX 5070 Ti, und ist die
Epic-Vision (garantierter Kontext pro Slot) bei 3 oder 6 Slots tragfähig?

Kein Server-Umbau, kein Live-Experiment. Ein Skript + Validierung + Ticket-Kommentar.

## Partials

| id | Plan | Rolle | target_files | depends_on |
|---|---|---|---|---|
| p1 | `tasks.md` | script+test+verify | `scripts/llm/kv-budget.sh`, `tests/spec/kv-budget.bats` | |

## File Structure

### NEW

| Datei | Änderung | Grund |
|---|---|---|
| `scripts/llm/kv-budget.sh` | Parameterisierte VRAM-Budget-Rechnung für -kvu vs. -no-kvu | Messung der Epic-Tragfähigkeit |
| `tests/spec/kv-budget.bats` | Failing-Test: erwartete Werte für aktuelle Konfiguration + Output-Format-Prüfung | RED-Step + Regression Guard |

## Tasks

### Task 1 — `scripts/llm/kv-budget.sh` schreiben

**Ziel:** Ein parameterisiertes Bash-Skript, das aus den bekannten Fixkosten (Gewichte,
Draft-Head, Compute-Puffer, mmproj) und den linearen KV-Kosten pro Token und Slot die
VRAM-Gesamtbelegung für jede relevante Konfiguration berechnet und als Markdown-Tabelle
ausgibt.

**Anforderungen:**

1. **Parameter** (alle optional, sinnvolle Defaults):
   - `--ctx N` — Kontext pro Slot (default: 65536)
   - `--slots N` — Anzahl llama.cpp-Slots / `-np` (default: 3)
   - `--kvu` / `--no-kvu` — geteilter vs. eigener KV-Cache je Slot (default: `--no-kvu`)
   - `--kv-type q4_0|q8_0|f16` (default: q4_0)
   - `--mmproj` / `--no-mmproj` (default: `--mmproj`)
   - `--kv-offload` / `--no-kv-offload` (default: `--kv-offload`)
   - `--gpu-mib N` — verfügbares VRAM in MiB (default: 16303 für RTX 5070 Ti)
   - `--base-mib N` — Sockel in MiB ohne KV (default: 8200 = 8000 + 200 für mmproj)

2. **Rechenlogik** (aus `start-gemma-server.ps1` Zeilen 175–185 übernommen):
   - `per_tok_mib` q4_0=0,0072 / q8_0=0,0143 / f16=0,0286
   - KV gesamt = `per_tok_mib × ctx × (kvu ? 1 : slots)`
   - Gesamt = `base + kv_total`
   - Frei = `gpu_mib - gesamt`
   - Pro-Slot-Anteil = `kv_total / slots`

3. **Ausgabe als Tabelle:**
   ```markdown
   | Konfiguration | Gesamt-VRAM | Frei | KV-Anteil | Pro-Slot-Anteil |
   |---|---|---|---|---|
   | 65536, 3sl, -no-kvu, q4_0, mmproj | 9416 MiB | 6887 MiB | 1416 MiB | 472 MiB |
   | 65536, 3sl, -kvu,    q4_0, mmproj | 8944 MiB | 7359 MiB |  944 MiB | 315 MiB* |
   ```
   `*` bei `-kvu`: Pro-Slot-Anteil ist der theoretische Mittelwert, die Spitze kann den gesamten Pool belegen.

4. **Zusätzliche Rechnung:**
   - `--max-slots` — bei gegebenem `--ctx`, wie viele Slots passen maximal?
   - `--max-ctx` — bei gegebenem `--slots`, wie groß darf ctx pro Slot maximal sein?

5. **`-fitt`-Analyse:**
   - Ein Vergleichs-Modus `--fitt-margin MIB` (default 2400), der berechnet, was
     `-fit on -fitt MIB` automatisch wählen würde (als `ctx`, den das Modell bei
     dieser Marge laden kann).
   - Ausgabe: `c_fitt = (free_vram_nach_modell - fitt_margin) / (per_tok_mib × slot_factor)`.
   - Hinweis: `-kvu` teilt nicht, sondern pooled — dort ist `slot_factor = 1` für den Pool,
     `= slots` für per-slot-Budget.

6. **Fehlerbehandlung:**
   - Wenn Gesamt > GPU-VRAM: Zeile trotzdem ausgeben, aber mit `⚠️ OVERCOMMIT` markieren.
   - Exit-Code 0 bei Erfolg, 1 bei ungültigen Parametern.

7. **Validierung der Werte gegen `start-gemma-server.ps1`:**
   - `--ctx 65536 --slots 1 --kvu --kv-type q4_0 --mmproj` muss 8672 MiB ergeben
     (deckungsgleich mit der Kommentar-Rechnung im Skript).

8. **Skript-Kopf** mit Dokumentation:
   - SYNOPSIS, DESCRIPTION, Parameter-Tabelle, zwei Beispiele.

### Task 2 — `tests/spec/kv-budget.bats` schreiben (RED-Step)

**Ziel:** Ein BATS-Test, der das Skript aufruft und die Ausgabe validiert. Der Test
schlägt **fehl**, solange `kv-budget.sh` nicht existiert oder falsche Werte liefert.

**Anforderungen:**

1. **Baseline-Test:**
   - `scripts/llm/kv-budget.sh --ctx 65536 --slots 1 --kvu --kv-type q4_0 --mmproj`
   - Erwartet: Gesamt 8672 MiB ± 1 %.
   - Prüft: Ausgabe enthält die Spaltenköpfe `Konfiguration`, `Gesamt-VRAM`, `Frei`.

2. **Drei-Slot-Test (`-no-kvu`):**
   - `scripts/llm/kv-budget.sh --ctx 65536 --slots 3 --no-kvu --kv-type q4_0 --mmproj`
   - Erwartet: Gesamt 9416 MiB (8000 + 200 + 3×472).

3. **Overcommit-Test:**
   - `scripts/llm/kv-budget.sh --ctx 200000 --slots 6 --no-kvu --kv-type q8_0 --mmproj`
   - Erwartet: Zeile enthält `⚠️ OVERCOMMIT`.

4. **`-kvu`-Vergleich:**
   - `scripts/llm/kv-budget.sh --ctx 200000 --slots 3 --kvu --kv-type q8_0 --mmproj`
   - Prüft: KV-Anteil < Drei-Slot-`-no-kvu`-Äquivalent (shared pool ist günstiger).

5. **Exit-Code-Test:**
   - `scripts/llm/kv-budget.sh --kv-type unsupported` → exit 1.

6. **`--max-slots`-Test:**
   - `scripts/llm/kv-budget.sh --ctx 65536 --kv-type q4_0 --mmproj --max-slots`
   - Prüft: Ausgabe enthält eine ganze Zahl (≥ 6, da 6×65536×0,0072 + 8200 = 11200 < 16303).

7. **`-fitt`-Analyse-Test:**
   - `scripts/llm/kv-budget.sh --ctx 65536 --slots 3 --no-kvu --kv-type q4_0 --fitt-margin 2400`
   - Prüft: Ausgabe enthält `c_fitt` und der Wert ist ≥ 65536 (bei q4_0 und 3 Slots ist genug VRAM).

8. **Helper im Test:**
   - `setup()` prüft, dass `scripts/llm/kv-budget.sh` existiert und ausführbar ist.
   - `teardown()` räumt keine Tempfiles (das Skript schreibt nur nach stdout).

### Task 3 — Skript ausführen, Ticket-Kommentar schreiben

**Ziel:** Das Skript für alle relevanten Konfigurationen ausführen und die Ergebnisse
als Ticket-Kommentar auf T002408 posten.

**Auszuführende Aufrufe:**

| # | Aufruf | Fragestellung |
|---|---|---|
| 1 | `--ctx 65536 --slots 1 --kvu --kv-type q4_0 --mmproj` | Baseline (aktueller Stand) |
| 2 | `--ctx 65536 --slots 1 --kvu --kv-type q8_0 --mmproj` | Baseline mit q8_0 |
| 3 | `--ctx 65536 --slots 3 --no-kvu --kv-type q4_0 --mmproj` | 3× q4_0, garantiert pro Slot |
| 4 | `--ctx 65536 --slots 3 --no-kvu --kv-type q8_0 --mmproj` | 3× q8_0, garantiert pro Slot |
| 5 | `--ctx 65536 --slots 6 --no-kvu --kv-type q4_0 --mmproj` | 6× q4_0 (2 Brands × 3) |
| 6 | `--ctx 65536 --slots 6 --no-kvu --kv-type q8_0 --mmproj` | 6× q8_0 (2 Brands × 3) |
| 7 | `--ctx 131072 --slots 3 --no-kvu --kv-type q4_0 --mmproj` | Doppelter Kontext für Taskblock |
| 8 | `--ctx 131072 --slots 3 --no-kvu --kv-type q8_0 --mmproj` | Doppelter Kontext q8_0-Variante |
| 9 | `--ctx 200000 --slots 3 --no-kvu --kv-type q4_0 --mmproj` | Maximaler Taskblock (T002286-Messung) |
| 10 | `--ctx 65536 --slots 3 --no-kvu --kv-type q4_0 --no-mmproj` | Ohne Vision-Tower |
| 11 | `--ctx 65536 --slots 3 --no-kvu --kv-type q4_0 --mmproj --no-kv-offload` | KV im CPU-RAM |
| 12 | `--ctx 65536 --slots 3 --kvu --kv-type q4_0 --mmproj` | Vergleich: -kvu bei gleicher Slot-Zahl |
| 13 | `--max-slots --ctx 65536 --kv-type q4_0` | Maximale Slot-Zahl für Baseline-ctx |
| 14 | `--max-slots --ctx 131072 --kv-type q4_0` | Maximale Slot-Zahl für doppelten ctx |
| 15 | `--ctx 65536 --slots 3 --no-kvu --kv-type q4_0 --fitt-margin 2400` | Was würde `--fit on -fitt 2400` wählen? |

**Ticket-Kommentar (via `ticket-mcp_add_comment`):**

```markdown
## RAM/VRAM-Budgetrechnung: -kvu vs. -no-kvu

GPU: RTX 5070 Ti (16303 MiB) · Gemma 4 12B QAT Q4_K_XL

### Baseline (aktuell: 1 Slot, -kvu)
...

### 3 Slots mit -no-kvu (garantierter Kontext pro Slot)
...

### 6 Slots (2 Brands × 3)
...

### -fitt-Analyse
...

### Fazit
**Tragfähig bei X Slots** — die Epic-Vision [T002370] ist/ist nicht bei der aktuellen Hardware umsetzbar.
- Empfohlene Slot-Zahl: ...
- Empfohlener Taskblock-ctx: ...
- Empfohlene KV-Quantisierung: ...
```

### Task 4 — Verify

**Ziel:** Alle Quality Gates passieren.

1. `task test:changed` — führt `tests/spec/kv-budget.bats` aus. Der Test MUSS grün sein
   (nach Task 2 ist das Skript vorhanden und liefert korrekte Werte).

2. `task freshness:regenerate` — prüft, ob generierte Dateien aktuell sind. Dieses Ticket
   erzeugt keine generierten Dateien; der Task MUSS ohne Änderungen durchlaufen.

3. `task freshness:check` — analog zu regenerate, aber nur Prüfung ohne Schreibrechte.
   MUSS grün sein.

4. **Plan-Lint:** Der Plan enthält keine TODO/TBD/FIXME. Jede Datei in File Structure
   hat ≥ 1 Task. Der Frontmatter enthält alle Pflichtfelder.

5. **Abfrage: sanity-check der Werte:**
   - Summe der VRAM-Spalten in Tabelle = 16303 MiB (weder Überzeichnung noch Phantom-Reserve)
   - Die Baseline-Zeile (1 Slot, kvu, q4_0) stimmt mit `start-gemma-server.ps1` Zeilen 175–185 überein
   - Kein Wert unterschreitet den Sockel von 8200 MiB für eine gültige Konfiguration mit mmproj
