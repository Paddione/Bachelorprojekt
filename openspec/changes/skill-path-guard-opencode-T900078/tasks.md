---
title: Skill-Path-Guard — .opencode/skills-Abdeckung + Shim-Coverage
ticket_id: T900078
domains: [agent-skills, ci-cd]
status: plan_staged
---

# Skill-Path-Guard — .opencode/skills-Abdeckung + Shim-Coverage

## File Structure

| Datei | Art | Zeilen jetzt | Zeilen danach | Wirksame S1-Schwelle | Budget |
|---|---|---|---|---|---|
| `tests/spec/agent-skills/skill-path-references.bats` | geändert | 90 | ~125 | 500 (Limit, keine Baseline) | — |
| `openspec/specs/agent-skills.md` | geändert | — | +40 | — | — |

Keine Datei nähert sich ihrem Budget; kein Verkleinerungs- oder Split-Schritt nötig.

## Kontext

Der Guard `skill-path-references.bats` prüft repo-relative Pfadverweise in Skill-Dateien gegen
das Dateisystem. Seit dem SSOT-Umzug (T900070) liegen die meisten Skills unter
`.opencode/skills/`, aber der Guard ist auf `.claude/skills/` + `.agents/skills` fixiert.
85+ Verweise auf `.opencode/skills/...` sind unsichtbar.

## Aufgaben

### 1. SKILL_PATH_PATTERN erweitern

`tests/spec/agent-skills/skill-path-references.bats`, Zeile 41:

Das aktuelle Muster:
```
SKILL_PATH_PATTERN='\.claude/skills/[A-Za-z0-9_./-]+\.(md|bats|sh|ts|tsx|js|json|yaml|yml|py|go|spec\.ts)[A-Za-z0-9_./:-]*'
```

Ersetzen durch:
```
SKILL_PATH_PATTERN='(\.claude|\.opencode)/skills/[A-Za-z0-9_./-]+\.(md|bats|sh|ts|tsx|js|json|yaml|yml|py|go|spec\.ts)[A-Za-z0-9_./:-]*'
```

Das Muster ist die einzige Ergänzung — keine weiteren Änderungen an der Pattern-Struktur.
Die Extension-Liste bleibt identisch.

### 2. skill_files() auf .opencode/skills umstellen

`tests/spec/agent-skills/skill-path-references.bats`, Zeilen 46-57:

Aktuell:
```bash
skill_files() {
  local ex find_args=() dirs=()
  for ex in "${EXCLUDED_SKILLS[@]}"; do
    find_args+=(-not -path "*/$ex/*")
  done
  [ -d "$REPO/.claude/skills" ] && dirs+=("$REPO/.claude/skills")
  [ -d "$REPO/.agents/skills" ] && dirs+=("$REPO/.agents/skills")
  find "${dirs[@]}" -name '*.md' \
    -not -path "*/OVERVIEW.md" \
    "${find_args[@]}" \
    -print
}
```

Ersetzen durch:
```bash
skill_files() {
  local ex find_args=() dirs=()
  for ex in "${EXCLUDED_SKILLS[@]}"; do
    find_args+=(-not -path "*/$ex/*")
  done
  [ -d "$REPO/.opencode/skills" ] && dirs+=("$REPO/.opencode/skills")
  [ -d "$REPO/.claude/skills" ] && dirs+=("$REPO/.claude/skills")
  find "${dirs[@]}" -name '*.md' \
    -not -path "*/OVERVIEW.md" \
    "${find_args[@]}" \
    -print
}
```

`.agents/skills` wird entfernt — es ist seit T900070 kein canonical Standort mehr (auf Windows
kein Verzeichnis, auf anderen Systemen ein Symlink zu `.opencode/skills` oder `.claude/skills`,
also ein Duplikat). `.opencode/skills` ist die neue SSOT (siehe OVERVIEW.md Zeile 5 und 34).

`.claude/skills` bleibt als zweite Scan-Quelle, weil Shims dort noch existieren und ihre
Verweise ebenfalls geprüft werden müssen. Deduplizierung ist nicht nötig, weil `.claude/skills`
Shims sind (Frontmatter + Pointer), keine echten Skills — sie referenzieren fast ausschließlich
`.opencode/skills/` Pfade, die vom neuen Pattern erfasst werden.

### 3. Bidirektionalen shim-coverage Test hinzufügen

Neuer Test-Block am Ende der Datei (nach dem Positiv-Anker, Zeile 90):

```bash
@test "shim-coverage: .claude/skills Shims verweisen auf .opencode/skills Ziele" {
  local shim f target
  while read -r shim; do
    [ -z "$shim" ] && continue
    # Shims sind keine echten Skills — sie haben einen 'source' oder 'opencode' Verweis
    if grep -qE '\.opencode/skills/' "$shim" 2>/dev/null; then
      # Extrahiere den ersten .opencode/skills/ Pfad aus dem Shim
      target="$(grep -oE '\.opencode/skills/[A-Za-z0-9_./-]+' "$shim" | head -1)"
      [ -n "$target" ] && [ ! -e "$REPO/$target" ] && {
        echo "Shim $shim verweist auf nicht existierendes Ziel $target"
        fail=1
      }
    fi
  done < <(find "$REPO/.claude/skills" -name 'SKILL.md' 2>/dev/null)
  [ "$fail" -eq 0 ]
}

@test "shim-coverage: .opencode/skills Ziele haben .claude/skills Shim" {
  local skill
  while read -r skill; do
    [ -z "$skill" ] && continue
    local name
    name="$(echo "$skill" | sed "s|$REPO/||; s|/SKILL.md$//")"
    local shim_dir="$REPO/.claude/skills/$name"
    # Shims können als Verzeichnis-Symlink, Datei-Symlink oder Pointer-Datei existieren
    if [ -e "$shim_dir" ] || [ -f "$shim_dir" ]; then
      continue
    fi
    # Prüfe auch: .agents/skills Shim existiert
    local alt_shim="$REPO/.agents/skills/$name"
    if [ -e "$alt_shim" ] || [ -f "$alt_shim" ]; then
      continue
    fi
    echo "opencode/skill '$name' hat kein .claude/skills Shim"
    fail=1
  done < <(find "$REPO/.opencode/skills" -name 'SKILL.md' -not -path "*/OVERVIEW.md" 2>/dev/null)
  [ "$fail" -eq 0 ]
}
```

Dieser Test stellt bidirektionale Integrität sicher:
- Jeder Shim in `.claude/skills/`, der auf `.opencode/skills/` referenziiert, MUSS ein
  existierendes Ziel haben.
- Jeder Skill in `.opencode/skills/` MUSS ein entsprechendes Shim in `.claude/skills/`
  (oder `.agents/skills/`) haben.

### 4. SSOT-Spec erweitern

`openspec/specs/agent-skills.md` einen neuen Requirement-Block anhängen, der festlegt, dass
der dead-path-references Guard (T002356-M1) auch `.opencode/skills/` Pfade prüft:

```markdown
### Requirement: Der dead-path-references Guard MUSS .opencode/skills/ Pfade erfassen

Die SSOT-Kopfzeile in `tests/spec/agent-skills/skill-path-references.bats` MUSS auf
`openspec/specs/agent-skills.md` verweisen (existiert).

Der Guard MUSS repo-relative Pfadverweise unter `.opencode/skills/` zusammen mit
`.claude/skills/` extrahieren und gegen das Dateisystem auflösen. Der `SKILL_PATH_PATTERN`
MUSS beide Präfixe matchen (Alternation über `\.claude|\.opencode`). Die
`skill_files()`-Funktion MUSS `.opencode/skills` als Scan-Quelle enthalten.

Vendored third-party skills (gitops-*, vitest, unsloth-buddy, ui-ux-pro-max) bleiben
von der Prüfung ausgeschlossen — sie verweisen auf Upstream-Doku oder fremde Projekte.

#### Scenario: Verweise auf .opencode/skills/ werden geprüft

- **GIVEN** eine Skill-Datei unter `.opencode/skills/references/` enthält
  `(.opencode/skills/references/dev-flow-gotchas.md)`
- **WHEN** der Guard läuft
- **THEN** wird der Pfad extrahiert und auf Existenz geprüft

#### Scenario: Shims haben bidirektionale Abdeckung

- **GIVEN** ein Skill existiert unter `.opencode/skills/dev-flow-execute/SKILL.md`
- **AND** ein Shim existiert unter `.claude/skills/dev-flow-execute/SKILL.md`
- **WHEN** der shim-coverage Test läuft
- **THEN** wird das Shim als existierend bestätigt

<!-- merged from change skill-path-guard-opencode-T900078 -->
```

### 5. Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/skill-path-references.bats
task test:changed
task freshness:check
```

Der Guard muss nach der Änderung grün sein und deutlich mehr Referenzen prüfen als vorher
(85+ zusätzliche Fundstellen aus `.opencode/skills/`).
