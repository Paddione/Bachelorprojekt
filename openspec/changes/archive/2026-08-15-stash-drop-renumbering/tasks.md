---
title: "stash-drop-renumbering — Implementation Plan"
ticket_id: T006298
domains: [repo-hygiene, scripts]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# stash-drop-renumbering — Implementation Plan

## File Structure

| Datei | Art | Rolle |
|---|---|---|
| `tests/spec/divergence-guard/stash-drop-by-message.bats` | vorhanden (RED, im Stage-Commit bereits committet) | 4 Tests; muss am Ende grün sein |
| `scripts/git-stash-net.sh` | ändern | einziges Production-Code-Artefakt: `cmd_drop` + usage-Zeile + CMD-Case-Zweig |
| `openspec/changes/stash-drop-renumbering/specs/divergence-guard.md` | vorhanden (MODIFIED-Delta) | Drop-Requirement samt Szenarien; wird beim Archivieren in die SSOT gemerged |
| `openspec/changes/stash-drop-renumbering/tasks.md` | vorhanden (diese Datei) | Plan-Artefakt |

**S1-Budgets:** `scripts/git-stash-net.sh` Ist 127 Zeilen · nicht baselined
(`jq -r '."S1:scripts/git-stash-net.sh".metric // "nicht-baselined"' docs/code-quality/baseline.json`
→ `nicht-baselined`) · statisches `.sh`-Limit **800** (`docs/code-quality/gates.yaml` →
`s1.limits`) → effektives Budget **673**. Die Erweiterung um `cmd_drop` (geschätzt
~25–30 Zeilen, inkl. usage- und Case-Zweig) bleibt mit erwarteten ~155 Zeilen Gesamtgröße
deutlich unter dem Limit und weit unter der 80 %-Schwelle. `.bats` und `.md` führen keine
Einträge in `s1.limits` — die Testdatei und das Spec-Delta sind nicht S1-gegatet.

**S4 (Orphan-Guard):** `scripts/git-stash-net.sh` bleibt referenziert: von der neuen
Testdatei `tests/spec/divergence-guard/stash-drop-by-message.bats` (Zeile 34), vom
bestehenden Test `tests/spec/batch-git-worktree-integrity.bats` (Zeile 30), von
`scripts/worktree-create.sh` (Zeilen 173/181, `pop --by-message 'worktree-create-auto-stash'`)
sowie aus der Doku (`.claude/skills/git-workflow/SKILL.md`,
`.opencode/skills/opencode-git-workflow/SKILL.md`) und der SSOT
`openspec/specs/divergence-guard.md`. Kein Orphan.

---

## Task 1 — Roten Zustand reproduzieren (RED-Beweis)

Der BATS-Test `tests/spec/divergence-guard/stash-drop-by-message.bats` liegt bereits im
Stage-Commit und ist rot: Das Skript kennt kein `drop`-Kommando, der `*) usage`-Zweig
beendet mit Exit 2 — Test 1 (erwartet 0) und Test 3 (erwartet 3) schlagen fehl, Test 4
schlägt fehl, weil die usage-Meldung die erwartete `kein Stash-Eintrag`-Phrase nicht
trägt. Vor jeder Implementierungszeile den Ausgangszustand bestätigen, damit später
belegbar ist, dass die Änderung den Test gedreht hat.

Aufwand: < 0,5 h.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/divergence-guard/stash-drop-by-message.bats
# expected: FAIL — alle 4 Tests rot (drop-Kommando existiert nicht, usage beendet mit Exit 2)
```

Syntaxprüfung für `.bats` läuft über `--count`, nicht über `bash -n`
(`@test "…" { … }` ist keine gültige Bash-Syntax):

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/divergence-guard/stash-drop-by-message.bats   # → 4
```

Beide Formen der Spec-Konvention miterfassen (T002696) — Sammeldatei *und* Verzeichnis:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/divergence-guard*
# erwartet: der neue drop-Test rot, die übrigen Guards der Spec unverändert grün
```

---

## Task 2 — `cmd_drop` implementieren (einziger Production-Code)

`scripts/git-stash-net.sh` um ein nachrichtenverifiziertes Drop-Kommando erweitern. Die
Auflösungslogik folgt exakt der bestehenden `pop`-Mechanik (`_find_idx`/`_count_matches`,
D1) — kein neuer Mechanismus, keine Index-Adressierung von außen.

`cmd_drop()` als neue Funktion nach `cmd_pop()` einfügen, Ablauf:

1. **Auflösung per Message:** `idx="$(_find_idx "$pattern")"`. 0 Treffer → stderr-Meldung
   `kein Stash-Eintrag für Muster '<pattern>' gefunden (Exit 2, Fail-Closed).`, `return 2`
   — identische Wortwahl und Semantik wie in `cmd_pop` (D4).
2. **Eindeutigkeit VOR dem Drop:** `before="$(_count_matches "$pattern")"`. Ist
   `before -gt 1` → mehrdeutig: nichts entfernen, Trefferliste auf stderr (je Zeile
   `<index> <message>` der matchenden Einträge), Meldung mit dem Wort `mehrdeutig`,
   `return 3` (D2). Das Skript rät nie den „ersten Treffer".
3. **Operatoren-Sichtbarkeit:** vor dem Drop eine stderr-Meldung mit dem aufgelösten
   Index **und** der Message des Eintrags ausgeben (D3).
4. **Drop:** `git stash drop "$idx"` ausführen — Ausgabe sichtbar lassen, Exit-Code
   getrennt von Pipes messen (Muster aus `cmd_pop`).
5. **Positive Verifikation NACH dem Drop:** `after="$(_count_matches "$pattern")"`.
   `after -eq 0` → stderr-Meldung `Eintrag <idx> entfernt (positive Verifikation).`,
   `return 0`. `after -gt 0` → BEFUND-Meldung (Eintrag blieb — Teil-Drop-Effekt, analog
   zum Teil-Pop aus T003069), `return 1` (D3).

`usage()` um eine `drop --by-message`-Zeile erweitern (zwischen `pop` und `EOF`), mit
denselben Hinweisen auf Message-Auflösung und positive Verifikation wie die pop-Zeile.
Den CMD-Case um den Zweig ergänzen — analog zu `pop`, strikt `--by-message` mit
nicht-leerem Pattern, sonst `usage`:

```bash
  drop)
    [ "${2:-}" = "--by-message" ] && [ -n "${3:-}" ] || usage
    cmd_drop "$3"
    ;;
```

Exit-Codes bleiben damit konsistent zur bestehenden Semantik: 0 = ok, 1 = BEFUND,
2 = kein Treffer (fail-closed), 3 = mehrdeutig — 3 ist die einzige neue Code-Bedeutung
(D4). Ein Aufruf entfernt genau einen Eintrag; mehrere Drops sind separate Aufrufe mit
erneuter Auflösung, nie zwei Indizes hintereinander (D3, Lehre aus T006298).

Prüfen:

```bash
bash -n scripts/git-stash-net.sh && echo "syntax ok"
grep -n 'drop' scripts/git-stash-net.sh   # → cmd_drop-Definition, usage-Zeile, Case-Zweig
```

Aufwand: ≤ 1 h. Das ist die einzige Task mit Production-Code — der RED-Test bleibt im
Stage-Commit, die Implementierung wird erst im Execute-Schritt committet.

---

## Task 3 — GREEN-Beweis

Der BATS-Test aus Task 1 muss jetzt grün sein, inklusive beider Formen der
Spec-Konvention (T002696):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/divergence-guard/stash-drop-by-message.bats
# erwartet: 4 ok — Positiv-Anker (matchnder Eintrag verschwindet), Negativ-Aussagen
# (Nicht-matchnde bleiben), T006298-Regression (zwei Drops, je korrekter Eintrag),
# mehrdeutig (Exit 3, nichts entfernt), fail-closed ohne Treffer (Exit 2)

tests/unit/lib/bats-core/bin/bats -r tests/spec/divergence-guard*
# erwartet: alle Guards der Spec grün

tests/unit/lib/bats-core/bin/bats tests/spec/batch-git-worktree-integrity.bats
# erwartet: grün — bestehender Test, der das Skript referenziert (Zeile 30); belegt,
# dass die Erweiterung die pop-Mechanik nicht bricht
```

Aufwand: < 0,5 h.

---

## Task 4 — Abschluss-Verifikation

```bash
task test:inventory        # neue Testdatei ins Inventar aufnehmen
task test:changed          # gezielte Tests für die geänderten Domains
task freshness:regenerate  # generierte Artefakte aktualisieren
task freshness:check       # CI-Äquivalent: Freshness + quality:check (S1–S4) + Baseline-Assertion
task openspec:validate     # Delta-Spec gegen das OpenSpec-Schema
```

- `website/src/data/test-inventory.json` nach `task test:inventory` mit committen — der
  CI-Inventar-Check vergleicht die regenerierte Datei gegen die committete Version und
  schlägt sonst fehl.
- Die Baseline darf nicht wachsen: CI vergleicht die Key-Anzahl von
  `docs/code-quality/baseline.json` gegen main — `scripts/git-stash-net.sh` ist nicht
  baselined und bleibt es (Budget 673, siehe oben).

Aufwand: < 0,5 h.
