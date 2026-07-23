# Proposal: health-goals-scan-streamline

## Why

Der wöchentliche Countervalue-Scan der Repository-Health-Goals ist zu handarbeitslastig:

1. **`health-goals-update.sh` schreibt nur Bare-Integer-Zellen fort.** Prio-C-Zellen wie
   `95 %`, `Exit 0`, `0/34`, `6 Tage`, `n/a` landen in der `skipped_format`-Liste und müssen
   von Hand editiert werden — die lange Kette manueller „Baseline-Update"-Einträge in
   `.claude/lib/goals.md` (allein 6 Stück zwischen 2026-07-17 und 2026-07-22) ist der Beleg.
2. **Prio-A/B-Metazeilen werden per Auge gegen frische Messwerte abgeglichen.** Die Sektionen
   sind bewusst menschlich redigiert (Kontext-Policy im Update-Skript-Header), aber das
   *Erkennen* von Drift ist rein mechanisch und heute unnötig manuell.
3. **Schwer quantifizierbare Ziele veralten still.** Ziele ohne deterministische Messung im
   Check-Skript (qualitative Werte wie `Elite`, `Median 0.03h`, eingeschränkt reproduzierbare
   Audits) sowie SKIP-Fälle (Cluster/Tooling nicht erreichbar) bekommen nie automatisch einen
   frischen Wert.

## What

1. **Zell-Parser-Erweiterung** in `scripts/health-goals-update.sh`: Prozente (`95 %`),
   Exit-Codes (`Exit 0`), Einheiten-Suffixe (`22 h`, `6 Tage`), Brüche (`0/34`, Zähler-Update
   bei erhaltenem Nenner) und `n/a`-Backfill werden formaterhaltend fortgeschrieben —
   Whitelist-basiert, alles andere bleibt fail-safe in `skipped_format`.
2. **Drift-Report** (`--drift`): Join aus `website/src/lib/goals-data.generated.json`
   (geparste `current`-Werte aller Ziele inkl. Prio A/B, Parser-SSOT bleibt
   `gen-goals-data.mjs`) und dem `HG_VALUES_FILE`-Messexport — druckt pro Ziel
   dokumentierten vs. gemessenen Wert. Kein Schreibzugriff auf Prio-A/B-Text.
3. **LLM-Fill** (`scripts/health-goals-llm-fill.sh`, neu): dispatcht die nicht deterministisch
   messbaren/übersprungenen Ziele einzeln an den Unified-LLM-Gateway (`localhost:18235`,
   T002102, Bonsai-Backend) mit Goal-Sektion + Evidenz-Kontext; striktes JSON-Antwort-Contract
   (`value`, `confidence`, `evidence`, `reproducible_cmd_suggestion`). Default report-only;
   `--apply` schreibt ausschließlich Prio-C-„Aktuell"-Zellen mit `(LLM)`-Provenance-Marker.
4. **Taskfile-Targets** `health:goals:drift` und `health:goals:llm-fill` + Doku in der
   Mess-Werkzeug-Sektion von `goals.md`; BATS-Tests in `tests/spec/health-goals.bats`
   (Mock-Gateway via `HG_LLM_URL`-Seam).

_Ticket: T002107_
