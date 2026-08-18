# Design: fix-ci-failure-detection

_Ticket: T012239_

## Root-Cause (belegt, nicht Hypothese)

`scripts/devflow-ci-watch.sh` wertet rote Checks seit T003225 über den
statusCheckRollup-Selector `.statusCheckRollup[] | select(.headSha == $p.headRefOid)`
aus (Zeile 107-110). Das Feld `headSha` füllt die gh-REST-API im
`statusCheckRollup` nie — live verifiziert am 2026-08-18 mit gh 2.97.0 an PR
#4734 (offen) und PR #4728 (gemergt): 33/33 Einträge tragen `headSha: null`.
Der Selector liefert deshalb immer die leere Menge, `FAILED_CHECKS` bleibt immer
leer, und das Skript meldet nach Abschluss aller Checks „✅ alle grün" mit Exit 0
— auch wenn Check-Runs auf dem PR-HEAD mit `conclusion=failure|timed_out`
vorliegen. Der einzige andere Rot-Signalgeber, `gh pr checks --watch`
(Zeile 87), wird mit `|| true` geschluckt; die Job-Level-Gegenprobe
(Zeile 146-164) greift nur bei nicht-leeren `FAILED_CHECKS` und ist damit tot.

MESSUNG (2026-08-18, gh 2.97.0, read-only):

```bash
gh api "repos/Paddione/Bachelorprojekt/commits/9b55de213ec10da75a612005f5b211bd078979d9/check-runs" -q '[.check_runs[] | select(.conclusion=="failure") | .name] | unique'
# → ["BATS Unit + Quality Gates","Factory + OpenSpec + Guards","Factory spec shard 1"]
gh pr view 4734 --json headRefOid,statusCheckRollup -q '. as $p | $p.statusCheckRollup[] | select(.headSha == $p.headRefOid) | select((.conclusion // "") == "FAILURE" or (.conclusion // "") == "TIMED_OUT") | (.name // .context // "unknown")'
# → (leer — Filter matcht trotz roter Runs nichts)
gh pr view 4728 --json statusCheckRollup -q '[.statusCheckRollup[] | .headSha] | unique'
# → [null]
```

Zweiter Befund: `scripts/factory/babysit-prs.sh` selektiert rote PR-Kandidaten
nur bei `.conclusion == "FAILURE"` — `TIMED_OUT` und `ERROR` sind legitime
Fehlkonklusionen derselben API, erzeugen aber keinen Kandidaten und keine
Notifikation.

## D-Entscheidungen

**D1 — FAILED_CHECKS aus der check-runs-API des PR-HEAD.** Der Rollup-Selector
wird ersetzt durch:

```bash
gh api "repos/Paddione/Bachelorprojekt/commits/${PR_HEAD_OID}/check-runs?filter=latest" \
  -q '[.check_runs[] | select(.conclusion == "failure" or .conclusion == "timed_out") | (.name // "unknown") + ": " + (.html_url // "")]'
```

Begründung: dieselbe API, die das Skript bereits für `TOTAL_CHECKS` nutzt
(Zeile 121); SHA-exakt über die URL, kein headSha-Feld nötig, kein cwd-git.
`filter=latest` liefert genau einen Run je Check auf diesem Commit — Re-Runs
mischen sich nicht ein. `PR_HEAD_OID` wird pro Runde frisch gelesen (Zeile 120),
ein Push während des Watches wird also in der nächsten Runde korrekt bewertet.

**D2 — cancelled ≠ rot bleibt erhalten (T003224).** `conclusion=cancelled`
zählt nicht als Fehler. Die bestehende Gegenprobe auf Run-/Job-Ebene
(Zeile 146-164) greift wieder, sobald `FAILED_CHECKS` nicht-leer ist: ein
aggregierter failure-Check ohne echten failure-Job wird geleert.

**D3 — PENDING_COUNT bleibt auf dem Rollup.** Die Pending-Erkennung
(`.status != "COMPLETED"`) hängt nicht an `headSha` und funktioniert unverändert
— sie wird nicht angefasst.

**D4 — babysit-prs.sh-Filter erweitern.** `any(.conclusion == "FAILURE")` →
`any(.conclusion == "FAILURE" or .conclusion == "TIMED_OUT" or .conclusion == "ERROR")`.
Nur die Selektion; Klassifikation und Fix-Loop lesen weiterhin die echten Logs.

**D5 — Non-Goals (Follow-ups im Ticket, nicht Teil dieses Fixes):**
- SHA-Blindheit von `pr-babysit-ticket.sh` (`gh pr checks` ohne SHA-Bezug zeigt
  Vorgänger-SUCCESS, wenn CI auf dem neuen HEAD nie lief)
- „CI lief nie"-Erkennung im Scanner (check-runs `total_count=0` + Notify)
- GitLab-Pipeline-Status (Spiegel steht ohne Runner auf `pending`)

## Edge-Cases

- **Re-Run auf demselben HEAD:** `filter=latest` → nur der neueste Run je Check
  zählt; ein abgebrochener Re-Run (cancelled) ist kein Rot, ein früherer
  failure-Run desselben Checks gilt durch D2 weiter über die Job-Gegenprobe.
- **HEAD wechselt während des Watches:** jede Runde liest `PR_HEAD_OID` neu;
  die check-runs-Abfrage ist an diesen Wert gebunden.
- **Rollup-Einträge ohne check-runs-Gegenstück** (Statuses alter Apps):
  `TOTAL_CHECKS` kommt bereits heute aus derselben check-runs-API — die Quelle
  für „Checks dieses HEAD" bleibt konsistent.
- **Leere check-runs-Liste:** `TOTAL_CHECKS=0` → Exit 5 (bestehendes Verhalten,
  unverändert).

## Tests

- `tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats` — Output-Verifikation
  mit gh-Stub: failure-Run am PR-HEAD → Exit != 0 + Check-Name in der
  Eskalationsmeldung; Positiv-Anker: grüner HEAD → Exit 0 „alle grün".
- `tests/spec/software-factory/babysit-prs-red-detection.bats` —
  Output-Verifikation mit gh-Stub und `FACTORY_DRY_RUN=true`: FAILURE
  (Positiv-Anker), TIMED_OUT und ERROR werden als Kandidat selektiert.
