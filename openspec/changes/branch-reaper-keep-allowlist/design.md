# Design: branch-reaper-keep-allowlist

_Ticket: T007032 — fix (Richtung durch Ticket vorgegeben, ai_ready — keine offenen Nutzerfragen)_

## Klassifikation

BOUNDED — gut abgegrenzte Änderung an einem existierenden Skript (`scripts/branch-reaper.sh`)
plus Tests. Kein neues Subsystem, keine Interface-Änderung nach aussen (Ausgabe-Vertrag bleibt).

## Symptom (beobachtet, reproduzierbar)

`bash scripts/branch-reaper.sh --sweep --dry-run` meldet gemergte Branches als KEEP:

- Messung 2026-08-15 (~10:15Z): 24 KEEP; Deep-Clean-Analyse: 17/17 analysierbare KEEP-Branches
  Blob-nachweislich in main angekommen (Tier A: eigene gemergte PRs, Tier B: Nachfolge-/Parallel-Branch).
- Live-Beleg (2026-08-15, nach Deep-Clean): `chore/pk-device-autostart-T006842` (PR #4622 gemergt)
  → `KEEP ... abweichende Datei ausserhalb der Allowlist: scripts/llm/pk-devices/download-quant.ps1`.

## Root Cause (verifiziert — Symptom vs. Ursache getrennt)

**Symptom:** REAP-Kandidaten mit gemergtem Inhalt werden als KEEP gemeldet.

**Ursache (im Code belegt, `scripts/branch-reaper.sh:236-246`):** Löschkriterium 4 (jede
Blob-Abweichung zu `<remote>/main` muss die ALLOWLIST treffen) wird auch für Branches mit
gemergtem PR ausgewertet. Nach Squash-Merge liegt der Branch-Inhalt auf main; sobald main eine
betroffene Datei später weiterentwickelt (oder die Datei auf dem Branch anders steht als auf main),
divergiert der Blob — und für Pfade ausserhalb der Allowlist (`scripts/*`, `openspec/specs/*`,
`openspec/changes/archive/*`, `.claude/skills/*`, `tests/*`) wird der Branch KEEP, obwohl sein
Inhalt längst gemergt ist. Die Allowlist ist für gemergte Branches das falsche Werkzeug: sie zählt
Pfade auf, deren Abweichung folgenlos ist, aber main-Evolution driftet beliebige Pfade.

## Optionen

1. **PR-Status als Positiv-Signal (gewählt — Ticket-Richtung, T005958 verallgemeinert):**
   Existiert ein MERGED-PR für den Branch (headRefOid-Match) oder ein Nachfolge-Branch mit
   identischen Blobs, ist das ein Positiv-Signal fürs Reaping, unabhängig von der Allowlist.
   Das T002431-Sicherheitsmotiv („einzige Kopie eines nie gemergten Deliverables") bleibt
   geschützt: ohne Positiv-Signal greift der Blob-Check weiter.
2. **Allowlist erweitern (verworfen — vom Ticket als schwächer benannt):** Whack-a-mole — jede
   neue Pfadklasse bricht wieder, und main-Evolution driftet Blobs ohnehin. Die Allowlist bleibt
   nur als konservativer Fallback unverändert bestehen.

## Entscheidungen

- **Positiv-Signal 1 — eigener MERGED-PR:** `gh pr list --head <branch> --state merged
  --json headRefOid`, Exit-Code-ausgewertet statt leerer Ausgabe (Muster T004612/T005958).
  Signal positiv ⇔ JSON non-empty UND `headRefOid` == Remote-Tip-SHA des Branches. Der
  SHA-Match verhindert Reaping von Post-Merge-Arbeit: wurden nach dem Merge Commits auf den
  Branch gepusht, weicht der Tip ab → kein Signal → der Branch fällt in den Blob-Check zurück
  (der die neue Arbeit als Abweichung ausserhalb der Allowlist vermutlich als KEEP meldet).
- **Positiv-Signal 2 — Nachfolge-Branch mit identischen Blobs:** eine `gh pr list --state merged
  --json headRefName`-Abfrage liefert alle gemergten PR-Köpfe; ein Kandidat ohne eigenes Signal
  ist reapbar, wenn für JEDE Datei seiner Divergenzmenge ein gemergter Nachfolger denselben Blob
  trägt (`git rev-parse <remote>/<succ>:<f>` == `git rev-parse <remote>/<branch>:<f>`). Das ist
  ein Inhalts-Subset-Beweis: Branch-Inhalt ⊆ Nachfolger-Inhalt, Nachfolger gemergt → sicher.
  Nur Branches mit `MERGED`-PR zählen als Nachfolger (CLOSED ist ein abgebrochener Lauf).
- **Gate-Reihenfolge** (bestehende Checks unverändert, neue als Einfügung vor dem Blob-Check):
  (1) main/aktueller Branch → KEEP · (2) Ticket-ID aus Branch-Namen (freshness-Klasse behält
  ihren eigenen PR-Status-Zweig) · (2b) offener PR → KEEP · (3) Ticket-Status done|archived →
  sonst KEEP · (4) NEU Positiv-Signal eigener MERGED-PR → REAP · (5) NEU Positiv-Signal
  Nachfolge-Branch → REAP · (6) bestehender Blob-/Allowlist-Check → REAP oder KEEP mit Begründung.
  Gilt in `--sweep`- und `--ticket`-Modus (gemeinsamer Codepfad; der Post-Merge-Einzel-Lauf
  profitiert ebenso von „MERGED-PR → kein Blob-Check").
- **freshness-regen-Klasse (T005958) unverändert:** deren PR-Status-Logik ersetzt bereits den
  Ticket-Status; der Blob-Check bleibt dort laut SSOT-Spec erhalten. Keine Verhaltensänderung.
- **Ausgabe-Vertrag und Löschmechanik unverändert:** REAP/KEEP/DELETED-Zeilen, Archiv-Tag
  `refs/tags/reaped/<branch>` vor jedem Delete, lokaler Ref nur bei SHA-Gleichheit (T003182).
- **Skript-Header** (Löschkriterien-Doku, Zeilen 17-25) wird an die neuen Kriterien angepasst.

## Edge-Cases

- gh-Abfrage schlägt fehl → KEEP mit Begründung (unverifizierbar = verschonen, T003074-Muster).
- Mehrere MERGED-PRs auf denselben Head-Namen → erstes Element mit headRefOid-Match gewinnt.
- Branch in einem lokalen Worktree ausgecheckt → Reaping selbst unbeeinflusst; nur der lokale
  Ref-Delete meldet `KEEP local` (bestehendes Verhalten, T003182).
- Divergenzmenge leer (Tip == main) → bestehender Pfad reapt ohnehin; keine Sonderbehandlung.

## Tests (RED)

Neue Datei `tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats` (Prüfmodus: COMMAND OUTPUT
VERIFICATION gegen Fixture-Repos mit gh-/ticket.sh-Stubs, Muster der bestehenden
`branch-reaper-freshness-regen.bats`): Positiv-Anker (MERGED-PR + Scripts-Abweichung → REAP),
Post-Merge-Push → KEEP, Ticket nicht done → KEEP, gh-Ausfall → KEEP, Nachfolger mit identischen
Blobs → REAP, Nachfolger mit abweichendem Blob → KEEP, offener PR → KEEP, `--ticket`-Modus.
Bestehende Reaper-Tests bleiben grün (alte Stubs antworten auf die neuen Abfragen mit `[]` →
kein Positiv-Signal → bisheriges Verhalten).

## Risiken

- Die neue gh-Abfrage je Branch erhöht API-Calls im Sweep; unkritisch (Sweep ist ein seltenes,
  explizit aufgerufenes Batch-Werkzeug; freshness-Zweig macht bereits je Branch eine `--state all`-
  Abfrage).
- Falsch-Positiv durch Nachfolger-Signal ausgeschlossen durch Blob-Identität auf der gesamten
  Divergenzmenge + MERGED-Voraussetzung des Nachfolgers; Archiv-Tag bleibt Sicherheitsnetz.
