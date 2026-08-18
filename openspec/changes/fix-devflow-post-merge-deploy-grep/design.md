# T009368 — Design: Archiv-Commit aus Merge-Commit-Selektion ausschließen

## Kontext

`devflow-post-merge-deploy.sh` (Schritt 8 aus dev-flow-execute) bestimmt den zu deployenden
Merge-Commit per Ticket-ID-Match auf `origin/main` (T002448-M9/M10). Das `-1`-Selektionsmuster
(neuester Commit mit `[TICKET_ID]` im Subject) kollidiert mit der OpenSpec-Archivierung: Der
Archiv-Commit `chore(plans): archive <slug> → <slug> [TXXXXXX]` trägt dieselbe Ticket-ID und
merged regulär VOR dem Deploy-Lauf (Archiv-PR läuft parallel zum Fix-PR). Sein Diff enthält
nur `openspec/changes/archive/`-Pfade → falsche Diagnose "Keine bekannten Deploy-Trigger".

## Entscheidungen

- **D1 (Selektionssemantik):** "Neuester Commit mit `[ID]` im Subject, ausgenommen
  Archiv-Klasse". Umsetzung: Kandidatenliste via `git log origin/main --format="%H %s"
  --grep="\[ID\]"`, dann `grep -vE ' chore\(plans\): archive '`, dann `head -1`.
  `git log`-Flag-Kombinationen sind ungeeignet: `--all-match --invert-match` implementiert
  "matcht nicht beide Patterns" (schließt auch Commits ohne ID ein), OR+Invert implementiert
  "weder ID noch Archiv". Ein Bash-Filter über der `%H %s`-Zeile ist die einzige präzise Form.
- **D2 (Testbarkeit):** Selektion als Funktion `select_merge_commit <repo> <ticket_id>`
  extrahieren + Source-Guard (`BASH_SOURCE[0] != $0` → `return 0`). BATS lädt das Skript per
  `source` und ruft die Funktion gegen temp-Git-Repo-Fixtures auf (Output-Verifikation,
  T002448-M4; kein Source-Grep).
- **D3 (Kein PR-Fallback):** Task 2 des Plans (PR-Nummer als Eingabe) wird nicht umgesetzt.
  Kein Aufrufer reicht eine PR-Nummer durch, und die Subject-Klassen-Filterung erfüllt die
  Acceptance Criteria. Bleibt als Option für den Fall, dass weitere Commit-Klassen die
  Ticket-ID tragen.
- **D4 (Kein `--merges`):** bleibt wie in T002506 begründet deaktiviert — das Repo squasht,
  ein Squash-Commit hat 1 Parent.

## Konsequenz

Archiv-Commits lösen keinen Deploy-Lauf mehr aus; Review-Fix-Commits (`fix(...) [T-ID]`)
bleiben legitime Deploy-Auslöser und werden weiterhin selektiert (Gegenprobe T008017:
`6d09653a` ist der korrekte neueste Nicht-Archiv-Kandidat).
