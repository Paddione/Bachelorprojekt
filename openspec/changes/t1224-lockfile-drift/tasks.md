---
title: "T001224: CI-Guard gegen website-Lockfile-Drift + pnpm/npm-Strukturentscheidung"
ticket_id: "T001224"
domains: [website, ci, quality]
status: "plan_staged"
file_locks: []
shared_changes: false
---

# Tasks: t1224-lockfile-drift

- [x] Task 0: Failing-Test schreiben — BATS `tests/spec/lockfile-drift.bats` (RED)
- [x] Task 1: Bereinigung & Ignore-Regeln (Entfernen von website/package-lock.json)
- [x] Task 2: Implementierung des Code-Quality-Gates S5 (Lockfiles)
- [x] Task 3: Verkabelung und Registrierung des Gates S5
- [x] Task 4 (Final): Verifikation via test:changed + freshness:regenerate + freshness:check

---

# t1224-lockfile-drift — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans — execute tasks in
> order, RED before GREEN, verify each gate before moving on.

**Goal:** Verhinderung von Lockfile-Drifts im Repository durch die Implementierung eines neuen Code-Quality-Gates S5, das zulässige und verbotene Lockfiles pro Subprojekt prüft. Zudem Bereinigung der fälschlicherweise getrackten `website/package-lock.json` und Ignorieren derselben in `website/.gitignore`.

**Architecture:** Das neue Gate S5 (`s5-lockfiles.mjs`) wird als Teil der standardmäßigen Code-Quality-Suite (`check.mjs`) integriert. Es liest die Konfiguration aus `gates.yaml` unter dem Key `s5.rules` und überprüft per Pfad die Existenz verbotener Lockfiles. Die Validierung der Konfiguration erfolgt über `validate.mjs`.

## File Structure

```
website/package-lock.json             ← DELETE: Versehentlich getracktes Lockfile löschen
website/.gitignore                    ← MODIFY: Ignoriere package-lock.json
docs/code-quality/gates.yaml          ← MODIFY: Konfiguration für s5.rules hinzufügen
scripts/code-quality/check.mjs        ← MODIFY: S5-Gate einbinden und ausführen
scripts/code-quality/validate.mjs     ← MODIFY: S5-Konfiguration in gates.yaml validieren
scripts/code-quality/gates/s5-lockfiles.mjs       ← NEU: Logik für Gate S5
scripts/code-quality/gates/s5-lockfiles.test.mjs  ← NEU: Unit Tests für Gate S5
tests/spec/lockfile-drift.bats        ← NEU: Failing test / Regression Test
```

### S1 Filesize Budgets

| Path | Current | Budget |
|------|---------|--------|
| `scripts/code-quality/check.mjs` | 63 | 437 |
| `scripts/code-quality/validate.mjs` | 93 | 407 |

---

## Task 0: Failing-Test schreiben (RED)

### Step 1: BATS Test anlegen
Wir legen eine BATS-Testdatei `tests/spec/lockfile-drift.bats` an, die prüft, ob die website/.gitignore das package-lock.json ignoriert und ob keine verbotenen Lockfiles vorhanden sind.

```bash
cat > tests/spec/lockfile-drift.bats <<'BATS'
#!/usr/bin/env bats

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "T001224: website/package-lock.json is not tracked by git" {
  run git ls-files --error-unmatch website/package-lock.json
  [ "$status" -ne 0 ]
}

@test "T001224: website/.gitignore ignores package-lock.json" {
  grep -q "package-lock.json" "$REPO_ROOT/website/.gitignore"
}
BATS
```

### Step 2: Test ausführen
Führe den Test aus, um das Fehlschlagen zu verifizieren (expected: FAIL). Da `website/package-lock.json` noch getrackt ist und nicht in `.gitignore` steht, muss dieser Test fehlschlagen.

---

## Task 1: Bereinigung & Ignore-Regeln

### Step 1: website/package-lock.json aus Git entfernen und löschen
```bash
git rm --cached website/package-lock.json
rm -f website/package-lock.json
```

### Step 2: Ignorieren in website/.gitignore eintragen
Füge `package-lock.json` am Ende von `website/.gitignore` hinzu.

---

## Task 2: Implementierung des Code-Quality-Gates S5 (Lockfiles)

### Step 1: Logik in s5-lockfiles.mjs schreiben
Erstelle die Datei `scripts/code-quality/gates/s5-lockfiles.mjs` mit der Methode `runS5(repoRoot, gates)`.
Diese lädt die Regeln aus `gates.s5.rules` und überprüft das Dateisystem und die getrackten Dateien.

### Step 2: Unit Tests in s5-lockfiles.test.mjs schreiben
Erstelle `scripts/code-quality/gates/s5-lockfiles.test.mjs` und teste die Erkennungslogik.

---

## Task 3: Verkabelung und Registrierung des Gates S5

### Step 1: Konfiguration in gates.yaml hinzufügen
Füge die `s5`-Regeln zu `docs/code-quality/gates.yaml` hinzu.

### Step 2: In check.mjs und validate.mjs einbinden
Importiere `runS5` und binde es in `check.mjs` ein. Validiere die Struktur in `validate.mjs`.

---

## Task 4 (Final): Verifikation, Freshness, Commit + Push

### Step 1: Führe die geänderten Tests und Qualitätsprüfungen aus
Führe die folgenden Befehle nacheinander aus:
```bash
task test:changed
task freshness:regenerate
task freshness:check
```

### Step 2: Commit & Push
```bash
git add docs/superpowers/specs/2026-06-27-t1224-lockfile-drift-design.md openspec/changes/t1224-lockfile-drift/
git commit -m "chore(plans): stage t1224-lockfile-drift for execution [T001224]"
git push -u origin feature/t1224-lockfile-drift
```
