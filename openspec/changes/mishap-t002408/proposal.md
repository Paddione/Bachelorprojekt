# Proposal: mishap-t002408 — RAM/VRAM-Budgetrechnung für slot-gebundene KV-Caches

_Ticket: T002408 (chore) · Epic: T002370_

## Status Quo

Der Gemma-4-12B-QAT-Server (`scripts/llm/start-gemma-server.ps1`) läuft mit:

| Parameter | Wert | Begründung |
|---|---|---|
| `-c` | 65536 | Fester Deckel (T002286), 1/4 des Modell-Maximums |
| `-np` | 1 | Serialisiert über llm-proxy (max_inflight=1), maximiert Prefix-Reuse |
| `-kvu` | implizit ab `-np > 1` | Shared KV-Pool zwischen Slots |
| `--cache-type-k/v` | q4_0 | Spart ~3,6 % VRAM ggü. q8_0, kostet ~3,6 % Durchsatz |
| `--mmproj` | mmproj-F16.gguf | Vision/Audio-Tower, +~200 MiB VRAM |
| `-fit` | off | Fester -c, kein Auto-Tuning |

**GPU:** RTX 5070 Ti — 16303 MiB total.

**Pipeline-Slots:** `FACTORY_SLOTS_PER_BRAND=3` (`scripts/factory/slots.sh:17`), zwei Brands (mentolder + korczewski). Global-Cap ebenfalls 3 (`FACTORY_GLOBAL_CAP=3`, `scripts/factory/schedule.sh`).  
Der llm-proxy serialisiert jedoch (`max_inflight=1` für llamacpp-gemma in `tickets.llm_proxy_backends`). Echte Parallelität ist aktuell nicht wirksam — der llama.cpp-Slot-Pool bleibt ungenutzt.

**VRAM-Verbrauch aktuell (Startskript-Zeilen 175–177):**

| Komponente | Formel | q4_0 KV | q8_0 KV |
|---|---|---|---|
| Gewichte + Draft-Head + Puffer | `baseMiB = 8000` | 8000 MiB | 8000 MiB |
| mmproj-Tower | `+200` | 200 MiB | 200 MiB |
| KV-Cache (-c 65536, 1 Slot, -kvu) | `65536 × 0,0072` (q4_0) / `× 0,0143` (q8_0) | 472 MiB | 937 MiB |
| **Summe** | | **8672 MiB** | **9137 MiB** |
| **Frei** | 16303 − Summe | **7631 MiB** | **7166 MiB** |

## Problem

Das Epic T002370 ("Slot-gebundener Kontextraum je Factory-Slot") verlangt:

> **Garantierten Kontext PRO Slot** für Taskblock plus Guardrails, nicht einen gemeinsamen Pool.

Das geht mit `-kvu` nicht: dort teilen sich alle Slots einen Puffer. Der erste Slot kann den gesamten Puffer füllen und die anderen aushungern. Die Epic-Vision braucht `-no-kvu` — dann bekommt jeder Slot `-c` Tokens garantiert, aber der VRAM-Verbrauch steigt linear mit der Slot-Zahl.

Die offenen Fragen:

1. **VRAM-Kosten von `-no-kvu`:** Wie viel VRAM brauchen 3 Slots mit je 65536 (oder 131072) Tokens garantiertem Kontext?  
2. **KV-Offload:** Wie ändert sich das Bild mit `--no-kv-offload` (KV-Cache im CPU-RAM statt VRAM)?  
3. **`-fitt`-Kompatibilität:** `-fitt` passt den Gesamt-Kontext ans freie VRAM an — wie verträgt sich das mit garantierten Pro-Slot-Budgets?  
4. **Slot-Zahl:** Passen 3 Slots pro Brand bei zwei Brands (6 Slots insgesamt) auf eine RTX 5070 Ti? Wenn nicht: bei welcher Slot-Zahl ist die Grenze?  
5. **Sockel vs. variabler Anteil:** Der Sockel (Gewichte, Draft-Head, mmproj, Compute-Buffer) skaliert nicht mit der Slot-Zahl — nur der KV-Cache tut das. Stimmt diese Annahme für `-no-kvu`?

## Mess-/Rechen-Plan

Statt Live-Messung (die einen laufenden Factory-Server stören würde) wird eine **parameterisierte Budget-Rechnung** implementiert, die aus bekannten, gemessenen Fixkosten und linearen KV-Kosten die VRAM-Antworten ableitet:

**Parameter-Raum:**

| Parameter | Werte |
|---|---|
| `-c` pro Slot | 32768, 65536, 131072, 200000 |
| `-np` (Slots) | 1, 3, 6 |
| `-kvu` / `-no-kvu` | beide |
| `--cache-type-k/v` | q4_0, q8_0 |
| `--mmproj` | ja, nein |
| `--no-kv-offload` | mit/ohne (KV im CPU-RAM) |
| Free VRAM | 16303 MiB total, abzgl. Sockel |

Die Rechnung liefert:

- Tabellarische VRAM-Belegung je Konfiguration
- Maximalen Taskblock (ctx) pro Slot bei gegebener Slot-Zahl und KV-Quant
- Minimale freie Slot-Zahl, die 65536 Tokens pro Slot garantiert
- Auswirkung von `-fitt` als Vergleichsspalte (was würde `--fit on` automatisch wählen?)

## Ergebnis-Dokumentation

Ein Ticket-Kommentar auf T002408 mit:

1. Vollständiger Tabellen aller gemessenen/rechnerischen Konfigurationen
2. Klare Aussage: "Tragfähig bei 3 Slots / 6 Slots / gar nicht"
3. Empfehlung für das weitere Vorgehen im Epic T002370
