# Proposal: main-direct-push-guard

## Why

Commit `bbbeaf260` liegt auf `origin/main` ohne PR-Nummer und ohne durchlaufenes CI-Gate — ein
Verstoß gegen Development Rule 2. Er ist kein Einzelfall: unter den letzten 300 `main`-Commits
finden sich vier weitere (`4b1d25de2`, `198f66986`, `d8bab57b1`, `ffc950c2f`).

Der Schutz dagegen existiert bereits und hat nicht gehalten. `.githooks/pre-commit:188`
(main-commit-guard) kam am 2026-08-04 auf `main`; der Verstoß war am 2026-08-09 — fünf Tage
danach. Das ist kein Implementierungsfehler des Guards, sondern seine Bauart: `git commit
--no-verify` überspringt die Hook-Datei vollständig, bevor eine Zeile darin läuft, ebenso
`SKIP_MAIN_COMMIT_GUARD=1`. Ein `pre-commit`-Hook kann diese Regel strukturell nicht
durchsetzen — er bleibt eine Bitte.

Durchsetzbar ist sie nur serverseitig, und dort steht die Tür offen. `GET
repos/Paddione/Bachelorprojekt/branches/main/protection` meldet `enforce_admins.enabled=false`
und führt kein `required_pull_request_reviews`. Die sieben konfigurierten Required Status Checks
gelten damit nicht für Admins; ein Admin-Push landet ungeprüft auf `main`.

Derselbe Spalt wird produktiv genutzt: `.github/workflows/freshness-regen.yml` checkt mit
`secrets.GH_PAT` (Admin-Token) aus und pusht direkt auf `main`. Der gewollte und der ungewollte
Weg laufen durch dieselbe Lücke — sie lässt sich nur gemeinsam schließen. Genau darin liegt das
Risiko dieses Vorgangs: wird die Protection scharfgestellt, bevor der Bot umgestellt ist, brechen
die Freshness-Läufe.

Ausdrücklich widerlegt, damit es nicht erneut untersucht wird: Der Anker-Commit aus
`worktree-create.sh` (T002412) war nicht beteiligt — in diesem Ablauf wurde nie ein Branch
angelegt und das Skript nie aufgerufen. Ein als „verschwunden" gemeldeter Worktree
(`.worktrees/mishap-incident-rollup`) war ein laufender Rebase einer Parallelsession; detached
HEAD ist dabei der Normalzustand. Branch-Anlage per `git checkout -b` im Haupt-Checkout ist
dokumentiert erlaubt (`dev-flow-chore/SKILL.md:70`, Test-only-Kurzpfad).

## What

Den Schutz auf die Ebene heben, die ein lokales Flag nicht abschalten kann, und den einen
legitimen Nutzer des bisherigen Spalts vorher auf den regulären Weg umstellen.

- `.github/workflows/freshness-regen.yml` schreibt nicht mehr direkt auf `main`, sondern legt
  einen Branch an, öffnet einen Pull Request und aktiviert Auto-Merge. Die bisherige
  `[skip ci]`-Logik entfällt: unter Required Status Checks würde ein übersprungener Lauf nie ein
  Ergebnis melden und der PR hinge unbegrenzt.
- `scripts/check-branch-protection.sh` prüft die Protection-Einstellungen von `main` und benennt
  jeden fehlenden Punkt einzeln. Es liest wahlweise die Live-API oder eine JSON-Datei, damit der
  Zustand ohne Admin-Scope nachvollziehbar bleibt.
- Die Protection selbst wird scharfgestellt — `enforce_admins` aktiviert, PR-Pflicht ergänzt —
  **nachdem** der Bot umgestellt und ein Freshness-Lauf grün durchgelaufen ist.

Der lokale `pre-commit`-Guard bleibt bestehen. Er ist ab jetzt Frühwarnung mit klarer Meldung,
nicht Schutz; die Unterscheidung wird im Kommentar festgehalten, damit ihn niemand erneut für
belastbar hält.

_Ticket: T002889_
