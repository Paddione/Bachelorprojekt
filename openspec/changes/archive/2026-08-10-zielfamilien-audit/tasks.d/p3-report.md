## Task 3: Committeter Audit-Report `docs/health-goals/zielfamilien-audit.md` (REQ-003)

**Purpose:** Dokumentiert den Audit-Befund je Zielfamilie als Markdown-Tabelle
(Familie, Goals, Befund, Fehlerklasse, Maßnahme, Status). LLM → T002442 und WT → T002443
als explizit ausgeschlossene Zeilen mit Ticket-Referenz. Wird im selben PR committet wie die
p2-Schärfungen (überlebt OpenSpec-Archivierung, bleibt von T002584 verlinkbar).

**Files:**
- `docs/health-goals/zielfamilien-audit.md` (neu)

**Kontext:**
- Spec: `openspec/changes/zielfamilien-audit/specs/health-goals.md` REQ-003 + Scenario
- p2-Abschlussmeldung (vom Orchestrator im Dispatch mitgegeben): je Familie geschärfte Ziele
  + Fehlerklasse + Maßnahme
- Fallback: `git diff` der p2-Änderungen in `goals.md`/`health-goals-check.sh` → geschärfte
  Ziele und deren Muster daraus ableiten

**Steps:**

### Step 1: Struktur
- Titel (H1), Einleitung (2–3 Sätze: Zweck, Methode — Audit-Runner + Code-Lektüre, offline;
  Ticket-Link T002584; Datum 2026-08-03)
- Tabelle mit Spalten: `| Familie | Goals | Befund | Fehlerklasse | Maßnahme | Status |`
- Abschnitt „Fehlerklassen“ mit Kurzdefinitionen E1–E5 (aus `tasks.md`-Taxonomie)
- Fußnote: Link zur Fixture-Suite `tests/spec/health-goals/zielfamilien-audit.bats` als
  permanenter Regressionsschutz

### Step 2: Tabellenzeilen — exakt 20
- 18 In-Scope-Familien mit korrekten Goal-Zahlen (SSOT aus goals.md ∪ health-goals-check.sh,
  dedupliziert — nicht raten):
  AGENTIC 17 · BRAIN 4 · CFG 1 · CI 1 · CQ 6 · DB 8 · DEP 1 · DOC 2 · E2E 2 · FE 3 · GIT 2 ·
  IF 3 · IMG 1 · OPS 3 · RH 2 · SEC 3 · SIZE 3 · TEST 2
  - Befund: `geprüft`
  - Fehlerklasse: `—` (kein Befund) oder `E1`/`E2`/`E4`/`E5` (mehrere kommagetrennt) — aus
    der p2-Meldung
  - Maßnahme: `—` oder konkrete Schärfung je Fehlerklasse (z. B. „Positiv-Anker + n/a statt 0,
    T002442-Muster“)
  - Status: `grün` (kein Befund) bzw. `geschärft` (mindestens ein Ziel geschärft)
- LLM (2 Goals: G-LLM01, G-LLM02): Befund `ausgeschlossen`, Maßnahme `→ T002442
  (zielfamilie-llm-stack)`, Status `—`
- WT (3 Goals: G-WT01, G-WT02, G-WT03): Befund `ausgeschlossen`, Maßnahme `→ T002443
  (zielfamilie-worktree-hygiene)`, Status `—`

### Step 3: Kohärenz mit p2
- Familie, in der p2 mindestens ein Ziel geschärft hat → Fehlerklasse + Maßnahme gesetzt,
  Status `geschärft`
- Familie ohne p2-Änderung → `—` + Status `grün`
- Reihenfolge: alphabetisch AGENTIC … TEST, danach LLM, WT (Ausgeschlossen-Zeilen als
  integrierte Tabellenzeilen, einheitliches Format)

**Verify:**
1. 20 Datenzeilen, exakt eine je Familie — keine fehlt, keine doppelt
2. Goal-Zahlen stimmen mit der Liste in Step 2 überein
3. LLM/WT-Zeilen tragen die Ticket-Referenzen T002442/T002443
4. Markdown-Tabelle wohlgeformt (jede Zeile genau 6 Spalten)
5. Datei existiert unter `docs/health-goals/zielfamilien-audit.md` und ist für den Commit
   durch den Orchestrator bereit (kein weiterer Ticket-Status-Übergang nötig)
