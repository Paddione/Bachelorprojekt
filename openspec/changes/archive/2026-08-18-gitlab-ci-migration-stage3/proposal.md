# Proposal: gitlab-ci-migration-stage3

## Why

Etappe 1 (T011790) hat den Spiegel und drei Jobs in Betrieb genommen, Etappe 2 den
Kubernetes-Runner auf `fleet` samt Registry-Cache. Beide laufen: die letzten Pipelines auf
`main` sind grün (`bats-unit` 196 s, `manifests` 76 s, `gitleaks` 21 s, gemessen am
2026-08-18 an Pipeline 2768676028).

Was fehlt, sind nicht Feinheiten, sondern die zwei Eigenschaften, ohne die GitLab die
GitHub Actions **prinzipiell** nicht ersetzen kann.

**L1 — GitLab sieht nie einen PR-Stand.** `.github/workflows/mirror-to-gitlab.yml` pusht
ausschließlich `HEAD:refs/heads/main`. Damit läuft dort nur eine Nachkontrolle *nachdem*
gemergt wurde. Ein Merge-Gate prüft den Stand *vor* dem Merge — GitLab hat diesen Stand
schlicht nicht. Das ist keine Konfigurationslücke, die man beim Umschalten nachzieht: solange
der Head-SHA eines Feature-Branches nie auf GitLab ankommt, gibt es nichts, woran ein Gate
hängen könnte.

**L2 — Sieben von zehn Gates fehlen.** `.github/workflows/ci.yml` definiert zehn Jobs,
`.gitlab-ci.yml` drei. Ein Umschalten auf den heutigen Stand würde `test-factory-openspec`,
die vier `test-factory-shard`-Legs samt Aggregator, drei der vier `security-scan`-Schritte,
`brett-typescript`, `vitest-website`, `commit-lint` und `lighthouse` **ersatzlos abschalten** —
also die Gate-Abdeckung verkleinern statt sie zu verlagern.

Diese Etappe schließt beide Lücken und stellt GitLab damit auf denselben Prüfumfang wie
GitHub. Sie schaltet **nicht** um.

## What

### Entscheidung: ersatzfähig bauen, Gate-Flip separat

Nach Abschluss dieser Etappe prüft GitLab denselben Head-SHA mit denselben Gates wie GitHub.
Der eigentliche Wechsel — GitLab-Checks als Required in der Branch Protection, Stilllegen der
abgelösten GitHub-Jobs — ist danach ein reiner Konfigurations-Schritt und **nicht Teil dieser
Etappe**.

Der Grund ist nicht Vorsicht um ihrer selbst willen, sondern eine gemessene Eigenschaft des
self-hosted Runners: Fällt er aus, scheitern Jobs nicht, sie bleiben `pending` (belegt in
`scripts/gitlab-pipeline-check.sh`, das `pending` deshalb als "kein Urteil" mit eigenem
Exit-Code führt). Ein Required Check, der stumm wartet, blockiert jeden Merge ohne rotes
Signal. Bevor das an der Branch Protection hängt, muss der Parallelbetrieb belegt haben, dass
beide Seiten auf denselben Commits dieselben Urteile fällen.

### L1: Branch-Spiegelung mit explizitem Refspec

Der Mirror-Workflow triggert zusätzlich auf `feature/**`, `fix/**` und `chore/**` und pusht
den jeweiligen Branch unter seinem eigenen Namen. Die Refspec bleibt **explizit** —
`git push --mirror` ist weiterhin ausgeschlossen, und zwar aus dem in Etappe 1 dokumentierten
Grund: der Checkout trägt `refs/remotes/origin/*`, die `--mirror` unsichtbar nach GitLab
übertrüge, und `--mirror` löscht dort jeden Ref, den die Quelle nicht hat.

Gelöschte Branches werden mitgelöscht (Push auf `delete`-Event mit leerem Quell-Ref). Ohne
das wächst die Branch-Liste auf GitLab unbegrenzt, und jeder tote Branch bleibt als Pipeline-
Trigger stehen.

### L2: Job-Parität — alle vier Gruppen

| GitHub-Job | GitLab-Gegenstück | Anmerkung |
|---|---|---|
| `test-factory-openspec` | `factory-openspec` | `npm run test:openspec` |
| `test-factory-shard` (Matrix 1–4) | `factory-shard` mit `parallel: 4` | `CI_NODE_INDEX`/`CI_NODE_TOTAL` → `SPEC_SHARD`/`SPEC_SHARDS` |
| `test-factory` (Aggregator) | entfällt | GitLab kennt keinen "übersprungen zählt als bestanden"-Fall; der Aggregator existiert auf GitHub nur, um genau das zu verhindern |
| `security-scan` (4 Schritte) | `gitleaks` erweitert um 3 Schritte | Image-Pinning (advisory), git-crypt-Guard (fail-closed), Trivy (advisory) |
| `brett-typescript` | `brett-typescript` | typecheck + test + build, `MOCK_DB=true` |
| `vitest-website` | `vitest-website` | braucht Diff-Basis (siehe unten) |
| `commit-lint` | `commit-lint` | Commit-Range statt PR-Titel-Action (siehe design.md D5) |
| `lighthouse` | `lighthouse` | braucht Website-Build |

### Diff-Basis als gemeinsame Abstraktion

Vier der Gates wählen ihren Umfang aus einem Diff gegen `origin/main`
(`scripts/find-changed-tests.sh`, `task test:changed`, `vitest --changed`,
`commit-lint`-Range). Auf GitHub ist die Basis implizit vorhanden, auf GitLab je nach
Pipeline-Art unterschiedlich benannt oder gar nicht gesetzt.

Statt diese Auflösung in jedem Job zu wiederholen, bekommt sie **eine** Fundstelle:
`scripts/ci-diff-base.sh` löst nach `CI_MERGE_REQUEST_DIFF_BASE_SHA` → `git merge-base
origin/main HEAD` → `origin/main` auf und schreibt das Ergebnis nach stdout. Beide Seiten
rufen dasselbe Skript, damit die Auswahl-Semantik nicht zwischen den Plattformen driftet —
dieselbe Begründung, aus der Etappe 1 `CI_RUNNER_TAG` als einzige Routing-Fundstelle gewählt
hat.

### Leerer Lauf bleibt ein Fehlschlag

Die Etappe-1-Regel gilt weiter und wird auf die neuen diff-skopierten Jobs ausgedehnt: eine
Auswahl, die null Tests ergibt, weil die Diff-Basis fehlschlug, ist von einer Auswahl, die
legitim null Tests ergibt, nur über die Diff-Basis selbst unterscheidbar. Die Jobs prüfen
deshalb zuerst, ob die Basis auflösbar war, und scheitern hart, wenn nicht — statt grün
durchzulaufen.

## Nicht in dieser Etappe (Non-Goals)

- **Kein Gate-Flip.** Keine GitLab-Prüfung wird als Required Check hinterlegt, kein
  GitHub-Workflow deaktiviert, gelöscht oder per `if:` kurzgeschlossen.
- **Keine Verlagerung von Entwicklung oder Review nach GitLab.** Branches entstehen weiter auf
  GitHub; GitLab bleibt Push-Ziel, nie zweites schreibbares Origin.
- **Keine GitLab-MR-Objekte.** Gespiegelte Branches erzeugen Branch-Pipelines. MR-Pipelines
  laufen automatisch mit, sobald auf GitLab reale MRs existieren — die Jobs sind für beide
  Quellen geschrieben, aber diese Etappe legt keine MRs an.
- **Keine Deploy- oder Build-Workflows.** `build-*.yml`, `render-fleet-artifact.yml`, `e2e*.yml`
  und die Factory-Workflows bleiben unberührt; hier geht es ausschließlich um die
  Offline-Gates aus `ci.yml`.

_Ticket: T012405_
