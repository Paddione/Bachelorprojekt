# Proposal: health-goals-repair

## Why

Ein Ziel, das nicht rot werden kann, steuert nichts — es kostet Aufmerksamkeit und gewöhnt daran,
die Ampel zu ignorieren. Der Vollauf am 2026-08-23 zeigte sieben solcher Ziele auf einmal:

```bash
bash scripts/health-goals-check.sh
# 108 geprüft: 90 ✅ · 15 🟡 · 1 🔴
```

**G-BRAIN14 war strukturell unerreichbar.** Es maß `brain-ingest-worklist.sh | grep -c .` — die
Worklist ist aber eine reine Manifest-Expansion und zählt **alle** Quellen (172), nicht die
offenen (17). Bei Ziel 0 blieb das Goal dauerhaft rot, unabhängig von jeder erledigten Arbeit
(Befund T013916). Zusätzlich beschrieb `goals.md` einen „State-File-Hash-Vergleich", den das
Skript gar nicht durchführte — die Doku beschrieb eine Messung, die es nicht gab.

**G-DORA01 konnte per Konstruktion nie verletzt werden.** `goals.md` dokumentiert „≥ 5/Woche", das
Skript misst über 4 Wochen und verglich gegen 5 — um Faktor 4 zu locker, und bei einem Ist von
1940 ohnehin bedeutungslos (388×).

**Vier Ratchets zogen nach gelöstem Problem nicht nach** und konservierten damit die Erlaubnis zur
Regression: `G-SPEC03` (Ist 0, Ziel ≤41), `G-CQ02` (0/≤280), `G-CQ09` (0/≤10), `G-RH01` (0/≤30).
Ihre Schwellen standen alle noch auf dem Baseline-Wert der Aufnahme. Bei `G-CQ02` existierten
sogar **drei** Werte für dieselbe Sache: 280 im Skript, 280 in `goals.md`, 200 in
`plan-quality-gates.md`. Bei `G-SPEC03` widersprachen sich Skript (≤41) und Doku (0).

**G-SIZE03 maß ein God-File, das keines mehr ist:** `website-db.ts` hat 311 Zeilen bei einer
Schwelle von 3000.

## What

- **G-BRAIN14 misst den echten Backlog.** `brain-ingest-worklist.sh` bekommt einen `--pending`-Modus,
  der Chunk-Hashes gegen das State-File vergleicht — mit exakt der Semantik von
  `brain-ingest.sh process_page` (sha256 des **Quell**-Chunks gegen `<src_path>#<index>`).
- **Schwellen ans Messfenster bzw. an den Ist-Wert angepasst:** G-DORA01 `≥5` → `≥20` (= 5/Woche
  über 4 Wochen), G-SIZE03 `≤3000` → `≤600`, G-SPEC03 `≤41` → `≤5`, G-CQ02 `≤280` → `≤10`,
  G-CQ09 `≤10` → `≤2`, G-RH01 `≤30` → `≤5`.
- **`goals.md` beschreibt, was gemessen wird** — die falsche Hash-Vergleichs-Behauptung wird durch
  den Fix erstmals wahr, und die widersprüchlichen Schwellen werden aufgelöst.
- **Ein Rückbau-Abschnitt in `goals.md`** hält die drei Muster fest, mit der Prüffrage vor jeder
  Zielaufnahme: *Unter welchen realistischen Umständen wird dieses Ziel rot? Gibt es keine, ist
  es kein Ziel.*

## Warum kein LLM-Weg für die Pending-Zählung

`brain-ingest.sh --dry-run` liefert die Zahl bereits („Processed: 4, Skipped: 511"), scheidet aber
als Quelle aus: es verlangt `LM_MODEL` (T002533) **auch im Dry-Run**, und CI hat keine
LLM-Konfiguration. `brain-chunk.sh` ist dagegen ausdrücklich „no LLM, no network" — deshalb
arbeitet `--pending` direkt darauf.

Gemessen im Worktree:

```bash
bash scripts/brain-ingest-worklist.sh --root . --pending   # 17, Dauer 10s
bash scripts/brain-ingest-worklist.sh --root . | grep -c . # 172
```

10s passen in das `timeout 120` in `health-goals-check.sh`.

## Verworfene Alternativen

- **G-BRAIN14 abbauen statt reparieren** — dann würde der Brain-Ingest-Backlog gar nicht mehr
  gemessen. Die Messung ist wertvoll, nur ihr Zähler war falsch.
- **Die Ratchet-Schwellen auf 0 setzen** — kein Spielraum für einzelne Ausreißer; ein Ratchet, das
  bei jeder Schwankung rot wird, wird genauso ignoriert wie eines, das nie rot wird. Deshalb
  Ist + kleine Reserve.
- **Die Pending-Logik in `health-goals-check.sh` nachbauen** — eine zweite Kopie der
  Chunk-Hash-Semantik, die gegen `brain-ingest.sh` driften würde. Sie gehört neben die Worklist,
  die dieselben Quellen kennt.

_Ticket: T013916_
