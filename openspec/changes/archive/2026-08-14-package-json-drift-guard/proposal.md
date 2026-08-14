# Subagent-Package-Drift-Guard

## Purpose (Deutsch)

Verhindert, dass Subagent-Dispatches unbeabsichtigt `.opencode/package.json` und
`package-lock.json` modifizieren und diese Modifikation als Teil eines
Implementierungs-Commits durchrutscht. Beobachtet am 2026-08-14 bei T004295: zwei
`deepseek-flash`-Dispatches (p6a/p6b) meldeten leere Returns, hatten aber nebenbei
`.opencode/package.json` + `package-lock.json` geändert (`npm install` von
`@opencode-ai/plugin` 1.18.16 → 1.18.18) — unbeabsichtigte Änderung außerhalb des Plans,
musste revertet werden (T004611).

## Problem / Auslöser

Die Plugin-Versionierung in `.opencode/` ist ein bewusstes Dependency-Artefakt
(T002632: "opencode Plugin-Deps versionieren"). `scripts/check-commit-vs-diff.sh`
(T001434-Guard, verdrahtet in `.githooks/commit-msg` + CI) blockt zwar Implementierungs-
Titel mit Plan-/Test-only-Diffs, kennt aber `.opencode/package.json` nicht als
Sonderfall: ein `fix(...)`-Commit, der neben echtem Code auch package.json-Rauschen
einschleppt, passiert unerkannt.

## Fix-Richtung

- **`scripts/check-commit-vs-diff.sh` erweitern:** Die Dateien `.opencode/package.json`
  und `.opencode/package-lock.json` werden als Dependency-Artefakte klassifiziert.
  - Implementierungs-Titel (`fix/feat/refactor/perf`) + staged `.opencode/package*.json` →
    **blocken** mit Hinweis auf `chore(deps):`/`fix(plugins):` (analog zur bestehenden
    T001434-Meldung: "package.json-Rauschen — deklariere das Dependency-Update explizit").
  - `chore(deps)`/`fix(plugins)`/`build(deps)`-Titel + package.json → **erlaubt**
    (legitimes Dependency-Update, Positiv-Anker).
  - Kein `.opencode/package*.json` im Diff → Verhalten unverändert.
- **Keine Änderung an `.githooks/commit-msg`** (delegiert bereits an das Skript) und
  keine CI-Änderung (CI ruft das Skript per `--self-test` + per-Commit-Modus auf).
- **Leere Subagent-Returns:** reine Infrastruktur-Beobachtung (GPU/Proxy-Last,
  M2/M3-Eskalation greift bereits, dokumentiert in `.opencode/prompts/orchestrator.md`
  Zeile 11) — kein deterministischer Fix in diesem Change; der Package-Guard ist der
  reproduzierbare Teil.

## Out of Scope

- Keine Änderung an der M2/M3-Eskalationskette (funktioniert, greift).
- Kein Guard gegen andere Rausch-Dateien (z.B. node_modules) — bestehende Mechanismen
  decken das ab.
- Kein Auto-Revert von package.json-Änderungen — nur Commit-Blocking.
