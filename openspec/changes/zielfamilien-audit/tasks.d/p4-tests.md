## Task 4: Fixture-Suite erweitern — Rollen-Matrix + Regressions-Anker je geschärftem Ziel (REQ-004)

**Purpose:** Erweitert die committed Suite (`tests/spec/health-goals/zielfamilien-audit.bats`,
7 Tests, durch p1 grün) um (a) die vollständige Rollen-Matrix der `evaluate`-Regeln
(`--present`/`--absent` je Regel) und der `check`-Exit-Semantik sowie (b) Fixture-
Regressionspaare je in p2 geschärftem Ziel — die Suite muss rot werden, sobald ein Ziel in
SKIP-forever oder vakuos-grün zurückfällt (REQ-004-Szenario). Nur command-output-
Verifikation (T002448-M4): `run …` + `$output` + `$status`, KEIN grep auf Quelltexte.

**Files:**
- `tests/spec/health-goals/zielfamilien-audit.bats` (erweitern; Bestandstests unverändert lassen)

**Kontext:**
- Spec: `openspec/changes/zielfamilien-audit/specs/health-goals.md` REQ-004
- p1-Vertrag (Header des bats-Files + `evaluate`-Regeln aus p1 Step 3)
- p2-Abschlussmeldung (vom Orchestrator mitgegeben): geschärfte Ziele je Familie
- Runner: `scripts/lib/zielfamilien-audit.sh`

**Steps:**

### Step 1: Rollen-Matrix `evaluate` (neue Tests, an die 7 bestehenden anhängen)
- `evaluate <id> 0 --present` → PASS, exit 0 (echte Null bei vorhandener Basis ist ein Messwert)
- `evaluate <id> - --absent` → PASS, exit 0 (n/a statt 0 ist korrekt, kein Fehler)
- `evaluate <id> '' --absent` (leer) → `FAIL <id> E1`, exit 1
- `evaluate <id> degraded --absent` → `FAIL <id> E4`, exit 1 (E4 unabhängig vom Basis-Status)
- `evaluate <id> 5 --absent` → PASS, exit 0 (reale Zahl trotz fehlender Basis)

### Step 2: `check`-Rollen (Exit-Semantik, SKIP)
- Fixture ohne Marker fürs Goal → `SKIP <id>`-Zeile, exit 0 (kein Exit-Einfluss)
- Fixture `.present` + `.value` (Inhalt z. B. `3`) → `PASS <id>`, exit 0 (Wert via evaluate)
- Gemischte Familie (ein `.absent` + ein `.present`) → `FAIL <id> E5` UND `PASS <id>`, exit 1

### Step 3: Regressions-Anker je geschärftem Ziel (aus p2-Abschlussmeldung)
- Je geschärftem Goal `G-XXX` (Familie `P`):
  - Fixture `basis/P/G-XXX.absent` → `FAIL G-XXX E5`, exit 1 — Anker-Test: verschwundene
    Basis NIE grün (REQ-004: Messung emittiert n/a, nie 0)
  - Fixture `basis/P/G-XXX.present` (+ `.value` mit realem Messwert aus p2) → `PASS G-XXX`,
    exit 0
  - E2-geschärfte Ziele zusätzlich: `.present` + `.value` = `-` → `FAIL G-XXX E2`
    (SKIP-forever trotz vorhandener Basis)
- RED-Nachweis (STRUCT2): für einen Repräsentanten je geschärfter Familie den Anker-Test mit
  absichtlich falschem Fixture-Zustand gezielt laufen lassen
  (`bash tests/unit/lib/bats-core/bin/bats --filter <testname> tests/spec/health-goals/zielfamilien-audit.bats`).
  **Expected: FAIL** — der Test muss fehlschlagen, wenn das Ziel regrediert (vakuos-grün oder
  SKIP-forever). Ergebnis im Abschlussbericht nennen, danach korrekten Zustand wiederherstellen.

### Step 4: Verifikation
1. `bash tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/zielfamilien-audit.bats`
   → exit 0, alle Tests grün (7 Bestands- + neue)
2. Suite läuft offline (kein Netz/DB/Cluster)
3. `task test:changed` grün
4. Kein grep auf Quelltext des Runners oder von health-goals-check.sh (T002448-M4)
5. Abschlussmeldung: Liste der neuen Tests + je geschärftem Ziel das Anker-Paar
   (absent/present) mit Ergebnis
