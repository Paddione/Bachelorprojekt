## Task 2: Audit-Durchlauf + Schärfung nur der audit-failenden Ziele (T002442-Muster)

**Purpose:** Führt den Zielfamilien-Audit über die 18 In-Scope-Familien aus (mit dem p1-Runner
und Code-Lektüre der Messungen) und schärft NUR die audit-failenden Ziele in
`.claude/lib/goals.md` + `scripts/health-goals-check.sh` nach dem T002442-Muster:
Positiv-Anker als erste Anweisung der Messung, Anker-Fehler ⇒ `n/a` (im Runner `-`), nie `0`
als Default, nie eine leere Liste/Default als Erfolg. Grüne Ziele bleiben byte-for-byte
unverändert (REQ-005); G-LLM\* und G-WT\* sind FREEZE (T002442/T002443).

**Files:**
- `.claude/lib/goals.md` — Messbefehl + „Was“-Absatz nur der failenden Ziele
- `scripts/health-goals-check.sh` — row-Kommando der failenden Ziele kompakt umbauen
  (Budget 800, Ist 615 — nur 185 Zeilen Luft; netto nicht wachsen, idealerweise schrumpfen)

**Kontext (Pflichtlektüre):**
- T002442-Muster: `.claude/lib/goals.md` Zeilen 481–540 (G-LLM01/02: Titel „n/a → 0“, „Was“
  mit Positiv-Anker, Messbefehl mit `n/a`-Ausgabe) + `scripts/health-goals-check.sh` Zeilen
  532–560 (`row target G-LLM01 "$(python3 -c '…')" le 0 "…"`, `-` statt `0`)
- Spec: `openspec/changes/zielfamilien-audit/specs/health-goals.md` REQ-002 (Fehlerklassen),
  REQ-005 (nur fehlerhafte Ziele schärfen)
- p1-Runner: `scripts/lib/zielfamilien-audit.sh` (`evaluate <id> <actual> [--present|--absent]`,
  `check --family <P>`) — Voraussetzung, bereits grün
- Taxonomie: `tasks.md` Abschnitt „Fehlerklassen“ (E1–E5)

**Steps:**

### Step 1: Audit-Durchlauf (Befund je Familie sammeln)
- `bash scripts/lib/zielfamilien-audit.sh list-families` → 18 Familien, eine je Zeile.
- Je Familie die Goal-IDs ermitteln (Union, dedupliziert):
  `grep -oE 'row (gate|target) G-[A-Z0-9]+' scripts/health-goals-check.sh`
  ∪ `grep -oE '^## G-[A-Z0-9]+' .claude/lib/goals.md`
- Je Goal den Messwert bestimmen: die row-Zeile aus `health-goals-check.sh` extrahieren, den
  `$(…)`-Messblock isolieren und einzeln mit bash ausführen (gezielt, nicht das ganze Skript).
  Cluster/DB/Netz-Messungen, die offline fehlschlagen → Basis-Status + Fehlerklasse per
  Code-Lektüre klassifizieren.
- Basis-Status je Goal: existiert die Mess-Quelle real (Datei/Verzeichnis/Endpoint/
  JSON-Schlüssel)? → `--present` bzw. `--absent`.
- Klassifikation je Goal:
  - `bash scripts/lib/zielfamilien-audit.sh evaluate <ID> <actual> [--present|--absent]`
    (deckt E1/E2/E4 ab)
  - manuell E5: Pfad-/Endpunkt-Messung (grep/wc/find/HTTP) ohne Existenz-Check davor?
  - manuell E3: Filter-/Zähl-Schlüssel existiert in der realen Antwort nicht?
- Notieren je Familie: `FAIL <ID> E<N>: Grund`. Unentscheidbare Fälle → „geprüft (Code),
  kein Befund“ — dann NICHT schärfen.

### Step 2: Schärfung je failendem Ziel (nur Step-1-FAILs; Muster G-LLM01, goals.md Z. 481–515)
- **goals.md-Sektion**:
  - Titel: `## G-XXX — <Kurzname>: n/a → 0`
  - „Was“ (2–4 Zeilen): was gezählt wird, die SSOT-Quelle, und der Positiv-Anker explizit —
    „Der Positiv-Anker prüft, dass …; fehlt die Basis, ist das Ziel nicht messbar → n/a, nie 0“
  - Messbefehl: Positiv-Anker als ERSTE Anweisung; Anker-Fehler → `n/a`; kein `0`-Default
  - Footer: `> **B · Baseline:** n/a · **Target:** 0 · **Aufwand:** gering · **Messzyklus:**
    <passend> · **Reproduzierbar:** <wie gehabt> · **Ticket:** T002584`
- **health-goals-check.sh-row** (Muster Z. 532–560):
  - Kompakter Umbau als Einzeiler `row <kind> G-XXX "$(python3 -c '…')" le 0 "…"`
  - Anker-Check VOR dem Fehler-Fallback; Basis fehlt → `-` (SKIP), nie `0`
  - E2-Fix: catch-all-Fallback in unterscheidbare Pfade aufteilen (Basis-fehlt vs. Parse-Fehler)
  - E4-Fix: nur numerisch oder `-` emittieren (nie `degraded`/Text)
  - E1/E5-Fix: Existenz-Check (Datei/Verzeichnis/Schlüssel) zuerst; fehlt → `-`
- **Budget:** vor/nach je Familie die Zeilenzahl der geänderten rows notieren; Summe darf
  `wc -l scripts/health-goals-check.sh` nicht über 800 treiben (netto nicht wachsen).

### Step 3: Constraints (hart, REQ-005)
- Nur Step-1-FAIL-Ziele anfassen. Grüne Ziele: byte-for-byte unverändert — kein „schöner machen“.
- G-LLM01/02 und G-WT01–03 nicht anfassen (FREEZE T002442/T002443).
- Keine Merge-Gate-Semantik anderer Ziele ändern; keine neuen Ziele; kein Meta-Ziel (G-AUDIT\*).
- Nur `goals.md` + `health-goals-check.sh` ändern — p1-Runner und p3/p4-Dateien nicht anfassen.

### Step 4: Verifikation
1. Audit aus Step 1 wiederholen: alle geschärften Ziele → `PASS`
2. `bash scripts/health-goals-check.sh --only=<geschärfte IDs>` → keine Arithmetik-Fehler,
   jede row zeigt eine Zahl oder n/a
3. `wc -l scripts/health-goals-check.sh` ≤ 800; `wc -l scripts/lib/zielfamilien-audit.sh` ≤ 350
   (p1 unverändert)
4. `shellcheck scripts/health-goals-check.sh` → keine neuen Findings
5. `git diff --stat` → nur die zwei Zieldateien betroffen
6. `task test:changed` grün
7. Abschlussmeldung (p3 braucht sie exakt): je Familie die FAIL-Liste aus Step 1 und je
   geschärftem Ziel (ID, Fehlerklasse, Maßnahme) — vollständig zurückgeben.
