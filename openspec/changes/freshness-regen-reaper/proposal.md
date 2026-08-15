# Proposal: freshness-regen-reaper

## Why

Die Auto-Generate-Branches des Freshness-Workflows (`chore/freshness-regen-<run-id>`,
`.github/workflows/freshness-regen.yml`) akkumulieren auf `origin`. Der Workflow merged zwar per
`gh pr merge --auto --squash --delete-branch`, aber seit T004612 ist `delete_branch_on_merge=false`
gesetzt — die Branches bleiben nach dem Merge stehen. Verifiziert am 2026-08-15: **alle 15**
lebenden `chore/freshness-regen-*`-Branches gehören zu PRs mit `state=MERGED`.

`scripts/branch-reaper.sh` kann die Klasse nicht abräumen: Löschkriterium 1 verlangt eine
Ticket-ID im Branch-Namen, Kriterium 3 (Ticket-Status done/archived) ist ohne Ticket-ID nicht
auswertbar. Der Sweep verschont sie dauerhaft mit „keine Ticket-ID im Branch-Namen erkennbar" —
korrekt für fremde Branches (T003074), aber für diese eine maschinell erzeugte Klasse fehlt ein
Ersatzkriterium.

## Was sich ändert

Im Sweep-Modus ersetzt für Branches mit dem Muster `chore/freshness-regen-*` eine
PR-Status-Entscheidung die Ticket-Status-Prüfung:

1. `gh pr list --head <branch> --state all --json state` — gh-Fehler, kein PR oder offener PR
   → KEEP; `MERGED` oder `CLOSED` → weiter.
2. Blob-Check unverändert gegen die bestehende `ALLOWLIST` — Abweichung außerhalb → KEEP.

Die bestehende ALLOWLIST wird bewusst wiederverwendet statt einer zweiten „Generat-Allowlist":
die Verifikation über alle 15 lebenden Branches zeigt, dass jede nur unter `docs/code-quality/*`
von `origin/main` abweicht — bereits in der ALLOWLIST (Messung und Begründung:
`design.md`). Die Lösch-Mechanik (Archiv-Tag `refs/tags/reaped/`, `_reap_local_ref`), der
Einzel-Ticket-Modus und die KEEP-Regel für andere Branches ohne Ticket-ID bleiben unverändert.

## Erwartung

Der Dry-Run des Reapers listet die gemergten freshness-regen-Branches als `REAP`-Kandidaten;
der reguläre Sweep (repo-hygiene) räumt sie mit demselben Sicherheitsnetz ab wie alle anderen
verwaisten Branches.
