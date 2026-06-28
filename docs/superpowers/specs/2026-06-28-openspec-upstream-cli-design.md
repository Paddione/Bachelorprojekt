---
ticket_id: T001262
plan_ref: openspec/changes/openspec-upstream-cli/tasks.md
date: 2026-06-28
area: openspec
status: approved
---

# Design: OpenSpec Upstream CLI — Merge-Logic Fix + Validator Hardening [T001262]

## Purpose

Die homegrown OpenSpec-Toolchain (`scripts/openspec.sh` + `scripts/openspec-validate.ts`)
hat drei kritische Lücken, die bei der Archivierung aktiver Changes SSOT-Korruption
verursachen. Fünf aktive MODIFIED-Deltas und ein REMOVED-Delta werden bei `archive`
falsche Inhalte in `openspec/specs/` schreiben, weil `_merge_delta()` alle Operationen
blind als Append behandelt.

Dieses Design behebt alle drei Lücken ohne Bruch der Taskfile-/CI-API und ohne externe
Paketabhängigkeiten.

---

## Goals

- **G1** Korrekte MODIFIED-Semantik: vorhandene `### Requirement: <name>`-Blöcke in der SSOT
  werden in-place ersetzt, nicht doppelt angehängt.
- **G2** Korrekte REMOVED-Semantik: genannte Requirements werden aus der SSOT gelöscht,
  nicht angehängt.
- **G3** RENAMED-Unterstützung: Delta-Sektion `## RENAMED Requirements` umbenennt vorhandene
  Requirements in der SSOT.
- **G4** Validator erkennt Stub-Requirements (unbearbeitete Skeleton-Platzhalter).
- **G5** Validator erkennt Cross-Reference-Fehler: MODIFIED/REMOVED-Targets, die in der SSOT
  nicht existieren.
- **G6** Alle bestehenden Taskfile-/CI-Schnittstellen (`scripts/openspec.sh propose|apply|archive|validate`,
  `scripts/openspec-validate.ts`, `task openspec:*`) bleiben kompatibel.

## Non-Goals

- Adoption des upstream `@fission-ai/openspec` CLI als Backend-Ersatz (bleibt Option für T001266+).
- Migration bestehender archived Changes zu korrektem Merge-Ergebnis (historical, kein Handlungsbedarf).
- Refactoring des `propose`/`apply`-Verbs (kein Bug dort).
- UI-Änderungen an den `/opsx:*`-Skills.

---

## Root Cause Analysis

### Bug 1: raw-append merge (`openspec.sh:_merge_delta()`, Zeilen 144–150)

```bash
_merge_delta() {
  printf '\n<!-- merged from ... -->\n' >> "$ssot"
  grep -v -E '^## (ADDED|MODIFIED|REMOVED) Requirements\s*$' "$delta" >> "$ssot"
}
```

Die Funktion entfernt die Sektions-Header-Zeile und hängt alles andere hinten an. Für
MODIFIED und REMOVED ist das semantisch falsch: die alten Blöcke bleiben unberührt im SSOT,
während neue (doppelte oder kontraproduktive) Blöcke unten angehängt werden.

### Bug 2: weak validator (beide Dateien)

`_validate_delta_file()` prüft nur ob irgendein `## ADDED|MODIFIED|REMOVED`-Header und
irgendein `### Requirement:`-Eintrag existiert. Nicht geprüft:
- RENAMED (unbekannte Operation → FAIL)
- Stub-Platzhalter (`### Requirement: TODO`)
- MODIFIED/REMOVED-Targets existieren in der SSOT

### Bug 3: RENAMED fehlt überall

RENAMED ist keine gültige Operation im Regex, kein Merge-Handler implementiert, kein
Seed-Template. Workaround (REMOVED + ADDED) funktioniert ebenfalls nicht korrekt (Bug 1).

---

## Architecture

### Gewählter Ansatz: `scripts/openspec-merge.mjs` als Node.js-Delegate

**Drei Alternativen wurden bewertet:**

| Option | Beschreibung | Pros | Cons |
|--------|--------------|------|------|
| A (gewählt) | `scripts/openspec-merge.mjs` — Node.js-Helfer, von Shell aufgerufen | robustes Block-Parsing, kein Dep, testbar | weiterer Einstiegspunkt |
| B | Awk/Sed Multi-Line-Rewrite in `openspec.sh` | kein Helfer-File | fragil, schwer wartbar, edge-cases |
| C | Vollständige TypeScript-Migration der Shell-Logik | Typ-Sicherheit | bricht das Bash-Wrapper-Muster, großer Scope |

**Entscheidung für A:** Node.js ist bereits im Stack (openspec-embed.mjs, openspec-validate.ts).
Block-Parsing von Markdown-Heading-Trees ist in JS trivial mit Line-Splitting;
bash/awk würde komplexe Multi-Line-Zustandsmaschinen erfordern.

### Komponentenübersicht

```
scripts/openspec.sh         (bestehend, ~+20 Zeilen)
  cmd_archive()
    └─► _merge_delta() ──────────────────────────────────┐
                                                          ▼
scripts/openspec-merge.mjs  (NEU, ~120 Zeilen)
  applyDelta(deltaPath, ssotPath)
    ├─ parseDeltaSections(deltaContent) → [{op, name, content}]
    ├─ parseRequirementBlocks(ssotContent) → Map<name, block>
    ├─ applyAdded(blocks, delta)   → new SSOT string
    ├─ applyModified(blocks, delta) → new SSOT string (in-place replace)
    ├─ applyRemoved(blocks, delta) → new SSOT string (delete block)
    └─ applyRenamed(blocks, delta) → new SSOT string (rename heading)

scripts/openspec-validate.ts (bestehend, ~+50 Zeilen)
  validateDeltaFile()
    ├─ RENAMED im Regex ergänzt
    ├─ Stub-Detection (TODO-Platzhalter)
    └─ cross-ref validateModifiedRemovedTargets(deltaPath, ssotPath)

tests/spec/openspec-workflow.bats (bestehend, ~+55 Zeilen)
  ├─ @test "MODIFIED delta replaces requirement in-place"
  ├─ @test "REMOVED delta deletes requirement from SSOT"
  ├─ @test "RENAMED delta renames requirement in SSOT"
  ├─ @test "validator rejects RENAMED (unknown op) — BEFORE fix"  [expected: FAIL pre-fix]
  ├─ @test "validator rejects stub requirement (TODO placeholder)"
  └─ @test "validator rejects MODIFIED with nonexistent target"

openspec/specs/openspec-workflow.md (delta via T001266 — nur Hinweis hier)
```

---

## openspec-merge.mjs — Detaildesign

### Block-Parsing-Strategie

Der SSOT-Markdown wird in Zeilen aufgeteilt. Eine "Requirement-Grenze" ist eine Zeile, die
mit `### Requirement: ` beginnt. Jeder Block umfasst alles von seiner Header-Zeile bis zur
nächsten `###`-Zeile (exklusiv) oder EOF.

```
openspec/specs/ci-cd.md
───────────────────────
# ci-cd
...
## Requirements
### Requirement: Block A   ← start of block "Block A"
...content...
#### Scenario: ...
...
### Requirement: Block B   ← end of "Block A", start of "Block B"
...
```

Der Delta-Parser erkennt Sektionen nach `## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements`
und sammelt die Requirements darin.

### MODIFIED-Semantik

```
Delta: ## MODIFIED Requirements
       ### Requirement: Block A
       <new content>

Aktion: Finde alle Zeilen von "### Requirement: Block A" bis zur nächsten ###/## oder EOF.
        Ersetze diesen Block-Bereich durch <new content>.
        Fehlt "Block A" im SSOT → Fehler (Merge abgebrochen, exit 1).
```

### REMOVED-Semantik

```
Delta: ## REMOVED Requirements
       ### Requirement: Block A
       <reason/migration-note>

Aktion: Finde und lösche den Block "Block A" im SSOT vollständig.
        Fehlt "Block A" → Fehler.
        Die <reason>-Zeilen im Delta werden NICHT in den SSOT geschrieben.
```

### RENAMED-Semantik

Delta-Format (neues Konvention):
```markdown
## RENAMED Requirements

### Requirement: <old-name>

**Renamed-to:** <new-name>

<optional: reason/note>
```

Aktion: Finde `### Requirement: <old-name>` im SSOT, ersetze die Heading-Zeile durch
`### Requirement: <new-name>`. Inhalt bleibt unverändert.

### ADDED-Semantik (verbessert)

Statt blind ans Ende der Datei anzuhängen, wird neuer Block am Ende der `## Requirements`-
Sektion eingefügt (vor dem nächsten H2 oder EOF). Das ist strukturell sauberer und
verhindert, dass ADDED-Inhalte nach H2-Appendix-Sektionen landen.

### Idempotenz-Check

Vor dem Schreiben wird geprüft: enthält der SSOT bereits einen Merge-Kommentar mit dem
gleichen Delta-Dateinamen und Datum? Wenn ja: Skip (bereits gemerged), kein Fehler.

---

## Validator-Hardening — Detaildesign

### RENAMED im Regex

```typescript
// Vorher:
if (!/^## (ADDED|MODIFIED|REMOVED) Requirements\s*$/m.test(content))

// Nachher:
if (!/^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements\s*$/m.test(content))
```

### Stub-Detection

```typescript
// Neue Prüfung in validateDeltaFile():
if (/^### Requirement: TODO\s*$/m.test(content)) {
  errors.push(`${filePath}: contains unedited stub requirement '### Requirement: TODO'`)
}
if (/^The system SHALL …\s*$/m.test(content)) {
  errors.push(`${filePath}: contains unexpanded SHALL stub`)
}
if (/^#### Scenario: TODO\s*$/m.test(content)) {
  errors.push(`${filePath}: contains unedited stub scenario '#### Scenario: TODO'`)
}
```

### Cross-Reference-Prüfung (MODIFIED/REMOVED)

```typescript
// Neue Funktion validateModifiedRemovedTargets(deltaPath, ssotDir):
// - Liest Delta, parst MODIFIED + REMOVED Sektionen
// - Liest SSOT (gleicher Dateiname in openspec/specs/)
// - Prüft: jeder MODIFIED/REMOVED-Name muss im SSOT existieren
// - Fehler wenn: SSOT existiert nicht, oder Name nicht gefunden
```

### RENAMED-Struktur-Prüfung

RENAMED-Blöcke müssen `**Renamed-to:** <name>` enthalten (Pflicht). Fehlt die Richtungs-
Angabe → FAIL.

---

## Testing Strategy

**Red-Green Cycle (BATS):**

1. Neue Tests in `tests/spec/openspec-workflow.bats` zuerst schreiben (Phase RED)
2. Tests laufen auf FIXTURE-Daten (kleine Markdown-Dateien unter `tests/fixtures/openspec/`)
3. Fixtures: mini SSOT + mini Deltas für jeden Operation-Typ
4. `_merge_delta()` in Tests über `OPENSPEC_ROOT=tests/fixtures` aufrufen

**Akzeptanzkriterien:**
- `bats tests/spec/openspec-workflow.bats` → PASS nach Implementation
- `task test:openspec` → PASS (TypeScript-Validator)
- `task openspec:validate` → PASS für alle aktiven Changes
- Bestehende BATS-Tests (T001267-Batch) weiterhin grün

**Regression-Guard:**
Die 5 aktiven MODIFIED-Changes + 1 REMOVED-Change sollten in einem Dry-Run-Modus korrekt
verarbeitet werden (kein echter Archive in Tests — nur `scripts/openspec-merge.mjs` direkt aufrufen).

---

## S1-Budget

| Datei | Aktuell | Nach Änderung | Limit | Budget-Rest |
|-------|---------|---------------|-------|-------------|
| `scripts/openspec.sh` | 200 | ~220 | 500 | +280 |
| `scripts/openspec-validate.ts` | 127 | ~175 | 600 | +425 |
| `scripts/openspec-merge.mjs` | 0 (NEU) | ~120 | 500 | +380 |
| `tests/spec/openspec-workflow.bats` | 104 | ~160 | 300 | +140 |

Alle Dateien weit innerhalb Budget. Keine Modul-Splits nötig.

---

## Risiken & Mitigations

| Risiko | Mitigation |
|--------|------------|
| Block-Parsing bricht bei atypischen SSOT-Formaten | Fixtures mit edge-cases (EOF ohne trailing newline, fehlende `## Requirements` H2) |
| MODIFIED findet falsches Target bei ähnlichen Namen | exakter Stringvergleich der Heading-Zeile nach `### Requirement: ` |
| `_merge_delta()` wird noch von anderem Code direkt aufgerufen | grep zeigt: nur von `cmd_archive()` → kein Bruch |
| Idempotenz-Check überspringt legitimen Re-Run | Kommentar enthält Datum → kein Skip bei neuem Tag nach Fehlerkorrektur |

---

## Execution Order

```
Task 0: Failing BATS tests schreiben (RED)
Task 1: scripts/openspec-merge.mjs implementieren
Task 2: scripts/openspec.sh:_merge_delta() auf Node-Helfer umleiten
Task 3: scripts/openspec-validate.ts härten (RENAMED + Stub + Cross-Ref)
Task 4: Verify — task test:changed + task openspec:validate
```

Alle Tasks sind sequentiell (jeder baut auf dem vorherigen auf).
