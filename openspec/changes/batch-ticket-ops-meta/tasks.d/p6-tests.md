# p6 — BATS-Sammeltests + Delta-Spec (Tests-Rolle)

_Ticket: T003541 · Partial p6 (tests) · hängt an p1..p5_

## Ziel

EINE Sammel-BATS-Datei deckt die Fixes aller Kinder ab (plus Go-Unit-Tests in
den jeweiligen Implementierungs-Partials). Diese Partial ist die Tests-Rolle —
IMMER zuletzt.

## RED — Failing-Test-Step (STRUCT2)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-ticket-ops-meta.bats
# expected: FAIL (red — die Fixes aus p1..p5 sind nicht implementiert)
```

## Steps

1. **Sammel-Testdatei `tests/spec/batch-ticket-ops-meta.bats`** — ein Testblock
   je Kind (Negativ- UND Positivpfad, kein vakues Bestehen):
   - `triage chunk` (T003174): Triage-Query chunkbar (LIMIT/OFFSET dokumentiert)
     — Struktur-Grep auf die Prozedur + Zeichen-Limit-Check pro Chunk.
   - `freshness edge` (T003176): zwei Tickets ohne gemeinsame area, aber mit
     Freshness-Artefakt-Überschneidung → Konfliktkante erkannt.
   - `stage hold` (T002937): MCP-stage_plan(hold:true) → Argumentliste enthält
     `--hold` (Go-Unit-Test in p2) + CLI-seitig execution_released=false
     (BATS auf stage-plan.sh-Pfad).
   - `mishap withdraw` (T003134): zurückgenommener Eintrag erscheint nicht im
     Flush (Go-Unit-Test in p3) + Flush markiert geschlossene Befunde als
     "bereits behoben" (BATS auf Rollup-Output-Struktur).
   - `sid drift` (T003229): Lock mit Caller-SID gilt als mine, Schreibvorgang
     wird nicht verweigert.
   - `heartbeat refresh` (T003284): nach `agent-lock.sh touch` ist heartbeat_at
     fortgeschrieben; Reap nach simulierter TTL reapt den aktiven Lock nicht;
     Write-Guard passiert für den eigenen Worktree.
   - `empty return` (T003546): Dispatch-Prompt enthält den Vorab-Check; echte
     Leer-Returns behalten M2/M3.

2. **Delta-Spec-Finalisierung.** `openspec/changes/batch-ticket-ops-meta/specs/
   ticket-ops.md` gegen die implementierten Fixes abgleichen (p1..p5
   Anforderungen decken; MODIFIED nur wenn sich Verhalten ändert, sonst ADDED).

3. **Verifikation.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-ticket-ops-meta.bats
(cd scripts/ticket-mcp/go && go test ./internal/tools/...)
task test:changed
task freshness:regenerate && task freshness:check
```

## Acceptance

- Alle Testblöcke grün (Implementierung vorhanden).
- Kein vakues Bestehen: jeder Defekt hat einen echten Negativ- und Positivpfad.
- Delta-Spec und Implementierung decken sich.
