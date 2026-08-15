---
ticket_id: T006348
plan_ref: openspec/changes/post-merge-finalize-guards/tasks.md
status: active
date: 2026-08-15
---

# Design: post-merge-finalize-guards

_Ticket: T006348_ — Review-Befunde aus PR #4539 (T006284, gemergt 1cab10192) an
`scripts/devflow-post-merge-finalize.sh`. Drei Nachbesserungen, keine Neuentwicklung:
der Fix-Pfad verlangt, dass Symptom und Ursache getrennt und die Ursache mit Evidenz
belegt ist (T002448-M5) — alle drei Befunde sind unten gegen den Code auf
`origin/main` verifiziert (Zeilenangaben = Stand 2026-08-15).

## Befund 1 — Merge-Status-Guard fehlt im `--pr`-Pfad (Z. 60/135/143–155)

**Symptom (beobachtet, reproduzierbar):** Ein Recovery-/Eskalations-/Factory-Poller-
Aufruf mit `--pr <n>` eines **offenen** PRs schließt das Ticket (done/fixed|shipped).

**Ursache (verifiziert):** `--pr` (Z. 60) setzt `PR_NUM` direkt, ohne State-Prüfung.
Der Closure-Block (Z. 135–167, Schritte 4–6) läuft bei `[[ -n "$PR_NUM" ]]` bedingungslos.
Nur der Auto-Pfad (Z. 126–128) filtert auf `gh pr list --state merged`. Damit ist
T001149-M1 (Closure erst nach bestätigtem Merge, im Skript-Header Z. 30 selbst
dokumentiert) im `--pr`-Pfad verletzt — exakt die Drift Ticket=done bei PR=OPEN
(T001092).

**Fix-Ansatz:** Nach Schritt 3 (vor dem Closure-Block) den PR-State explizit prüfen —
`gh pr view "$PR_NUM" --json state -q .state` — und bei `!= MERGED` `PR_NUM` leeren
und `mark_skip` (analog Auto-Pfad Z. 132). Fail-safe: liefert `gh` nichts (nicht
erreichbar, unbekannte PR), wird **nicht** geschlossen.

**Edge-Cases:** gh nicht erreichbar → state leer → kein Closure. `--pr`-Angabe eines
geschlossenen (nicht gemergten) PRs → kein Closure. Bereits `done`-Ticket bleibt
idempotent (Schritt 5 case).

## Befund 2 — Idempotenz-Lücke Schritt 8 (Z. 196–227)

**Symptom (beobachtet):** Zweiter Lauf im Fenster „Schritt 8 erledigt, Archiv-PR noch
offen" wiederholt die Archivierung und endet FATAL/Exit 1 — Schritt 10 (Cleanup) wird
nie erreicht.

**Ursache (verifiziert):** Der Archiv-Ordner-Resolver (Z. 195–201) prüft zuerst den
Worktree: Der Fix-Branch enthält den Archiv-Commit **nicht** (der Commit entsteht im
Haupt-Checkout bzw. dem `ARCHIVE_DIR`-Lauf), also liegt `openspec/changes/<slug>`
im Worktree noch vor → `ARCHIVE_DIR=$WORKTREE` → die ganze Sektion (Z. 204–233)
wiederholt sich: Commit auf dem geteilten Arbeitsbaum, `git checkout -B
"$ARCHIVE_BRANCH" origin/main` (Z. 218) **wechselt den Branch des Arbeitsbaums**
(bei Haupt-Checkout: der paralleler Sessions), `git cherry-pick` des identischen
Commits kollidiert, Push ist non-fast-forward gegen den existierenden Archiv-Branch,
`gh pr create` endet FATAL (Z. 227) → Exit 1. Das `-B`-Flag setzt den lokalen
Archiv-Branch-Ref zurück — der Zustand des geteilten Arbeitsbaums ist nach dem
Fehllauf beschädigt.

**Fix-Ansatz (zweiteilig):**
1. **Idempotenz-Skip vor der Sektion:** Existiert der Archiv-Branch bereits auf
   origin (`git ls-remote --exit-code origin "refs/heads/chore/plan-archive-<slug>-<ticket>"`),
   ist die Archivierung bereits ausgeführt bzw. in flight → `mark_skip` und die
   Sektion überspringen (der Review schlägt genau diesen Check vor). Ein bereits
   geöffneter Archiv-PR ist damit auch beim zweiten Lauf nicht gefährdet.
2. **Branch-Restore nach der Sektion:** Vor `git checkout -B` den aktuellen Branch
   des `ARCHIVE_DIR` merken (`git rev-parse --abbrev-ref HEAD`) und nach dem
   Push/PR-Erstellen zurückschalten — der geteilte Haupt-Arbeitsbaum bleibt auf
   seinem Branch statt auf dem Archiv-Branch stehen zu bleiben (vom Review explizit
   als Schaden benannt: „wechselt Branch des geteilten Haupt-Arbeitsbaums paralleler
   Sessions").

**Edge-Cases:** Archiv-Branch existiert remote, aber Archiv-PR wurde manuell
geschlossen ohne Merge → Skip ist korrekt (Best-effort, Branch hält den Commit zur
manuellen Wiederherstellung). `gh`/`git ls-remote` nicht erreichbar → `|| true` und
weiter (Sektion läuft, Fehlerbild bleibt wie heute).

## Befund 3 — cwd-Abhängigkeit (Z. 176/286)

**Symptom (beobachtet):** Aufruf mit `cwd != REPO_DIR` führt Plan-Pfad-Prüfung gegen
falsches Verzeichnis bzw. lässt `branch-reaper.sh` gegen `$PWD` laufen.

**Ursache (verifiziert):** Z. 176 `[[ -s "$PLAN_FILE" ]]` mit relativem `PLAN_FILE`
(aus dem FACTORY-PLAN-REF-Format `plan=openspec/changes/<slug>/tasks.md`) — nur
korrekt bei `cwd = REPO_DIR`. Z. 286 `bash "$REPO_DIR/scripts/branch-reaper.sh"
--ticket "$TICKET_ID"` ohne `--repo` — `branch-reaper.sh` Z. 66/80 nutzt Default
`$PWD` als `TARGET_REPO`.

**Fix-Ansatz:** `cd "$REPO_DIR"` zu Skriptbeginn (nach den Env-/Usage-Prüfungen,
vor Schritt 1) — macht alle relativen Zugriffe cwd-unabhängig — plus explizites
`--repo "$REPO_DIR"` beim branch-reaper-Aufruf (Defense-in-Depth; der Reaper ist
per Vertrag auf `--repo` ausgelegt).

**Edge-Cases:** `REPO_DIR` via Env überschreibbar (Z. 35) — `cd` respektiert die
Env-Override. Schritt 8-Subshell `cd "$ARCHIVE_DIR"` überschreibt lokal — unberührt.

## Prior-Art (Schritt 0.7, T002829)

- `openspec/specs/agent-skills.md` §„Post-Merge-Finalisierung als idempotente
  Skript-Einheit" (Z. 1122–1140, gemergt aus Delta `executor-post-merge-death`):
  verlangt bereits, dass „bereits erledigte Schritte … erkannt und übersprungen
  werden". Die drei Befunde **schärfen diese bestehende Entscheidung** (MERGED-Guard,
  Archiv-Idempotenz, cwd-Unabhängigkeit als Explizierungen) — kein neues
  Requirement, daher **MODIFIED-Delta** auf `agent-skills.md` statt ADDED.
- Merge-Status-Guard (T001149-M1): Repo-Konvention „Closure erst nach bestätigtem
  Merge", im Skript-Header bereits zitiert; der `--pr`-Pfad verletzt sie. Keine
  bewusst verworfene Alternative gefunden (grep `openspec/specs/` + `tests/spec/`
  auf `devflow-post-merge-finalize`).
- Abgesichert durch `tests/spec/agent-skills/executor-post-merge-death.bats`
  (Aufrufvertrag) — die neuen Guards bekommen eine eigene Testdatei im selben
  Spec-Verzeichnis (BATS-Konvention T002416: eine Datei pro Vorgang).

## Teststrategie (rot→grün)

Neue Datei `tests/spec/agent-skills/post-merge-finalize-guards.bats`,
**PRÜFMODUS: Source-Grep mit dokumentierter Ausnahme von T002448-M4** — der
Laufzeitpfad des Skripts benötigt Cluster-/DB-Zugriff (Schritt 1 `ticket.sh get`),
der in CI nicht existiert; die Guard-Logik manifestiert sich ausschließlich im
Quelltext (gleiche Ausnahme wie Tests 1–3 in `executor-post-merge-death.bats`).
Semantische Marker (T002716: Ergebnis statt Darstellung):

| # | Befund | Marker (heute rot) |
|---|--------|---------------------|
| 1a | Anker Auto-Pfad | `gh pr list … --state merged` (heute grün) |
| 1b | `--pr`-Guard | `gh pr view` + `--json state` (heute rot) |
| 2 | Archiv-Idempotenz-Skip | `ls-remote … --exit-code` vor der Archiv-Sektion (heute rot) |
| 3a | `cd "$REPO_DIR"` zu Skriptbeginn | wörtlicher Marker (heute rot) |
| 3b | branch-reaper `--repo` | `--repo "$REPO_DIR"` im Reaper-Aufruf (heute rot) |

Alle Marker sind negativ-getestet rot auf `origin/main` (2026-08-15), grün nach dem
Fix. Die Negativ-Aussagen tragen Positiv-Anker (T002356-M1).
