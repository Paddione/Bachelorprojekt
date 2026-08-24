# Proposal: archive-frontmatter-completed

## Why

`scripts/devflow-post-merge-finalize.sh` setzt das Plan-Frontmatter auf `status: completed`
(Schritt 7), archiviert den Change aber in einer Subshell, die zuvor
`git checkout -B "$ARCHIVE_BRANCH" origin/main` ausgeführt hat (Schritt 8). Der
Frontmatter-Wechsel landet dadurch als uncommittete Änderung im Arbeitsbaum des
Haupt-Checkouts — das Archiv erhält weiterhin `status: active`. Messung im Incident
(T015916): 9 von 12 zuletzt archivierten Plänen tragen `status: active`; nur die 3 Fälle,
in denen Schritt 7 und Schritt 8 denselben Arbeitsbaum sahen, sind korrekt. Das Feld trägt
damit keine Information mehr. Zusätzlich blockierte die liegengelassene Änderung ein
`git pull --ff-only` im Haupt-Checkout.

Klärungsbeschluss (ticket-ops 2026-08-24): **Fix forward only** — der Wechsel läuft künftig
auf dem Archiv-Branch; die 9 Altlasten bleiben dokumentiert stehen (kein Backfill, kein
Feld-Rückbau).

## What

- Der Frontmatter-Sed wird aus Schritt 7 (vor der Subshell) entfernt und in die
  Archiv-Subshell verschoben: nach `git checkout -B "$ARCHIVE_BRANCH" origin/main`,
  vor `openspec.sh archive` bzw. vor dem Resume-Commit.
- Neuer DB-freier Einstieg `--frontmatter-state <slug> [--repo <dir>]` (Prüfmodus-Muster
  wie `--archive-state` aus T015783), damit das Verhalten per Kommando-Output testbar ist.
- Der Haupt-Checkout bleibt nach dem Finalize sauber (keine uncommitteten Reste).
- Delta-Spec auf SSOT `agent-skills` (dort leben die Finalize-Anforderungen, vgl. T015783).

## Impact

- `scripts/devflow-post-merge-finalize.sh` (Verdrahtung, Parsing, Subshell-Aufrufe)
- `scripts/lib/finalize-frontmatter.sh` (neu — Fragment-Extraktion für die S1-Budgets)
- `tests/spec/agent-skills/finalize-archive-frontmatter.bats` (neu, RED zuerst)

_Ticket: T015916_
