# p1 — Push-Mirror GitHub → GitLab

**Zieldatei:** `.github/workflows/mirror-to-gitlab.yml` (neu)

## Aufgabe 1: Mirror-Workflow anlegen

Ein GitHub-Actions-Workflow, der bei jedem Push auf `main` den Stand per **explizitem
Refspec** (nicht `git push --mirror`) zur GitLab-Instanz spiegelt: `HEAD:refs/heads/main`
plus `--tags`, beide mit `--force`. `--mirror` überträgt zusätzlich `refs/remotes/origin/*`
(jeden offenen Feature-Branch) und löscht auf GitLab fehlende Refs — beides mit der
Zusicherung „PR-Stände gehören nicht in den Spiegel" unvereinbar (design.md D6).

**Anforderungen an die Umsetzung:**

- Trigger ausschließlich `push` auf `main` sowie `workflow_dispatch` für manuelles Nachziehen.
  Kein `pull_request`-Trigger — PR-Stände gehören nicht in den Spiegel.
- `actions/checkout` mit `fetch-depth: 0`. Ein flacher Klon lässt den main-Push scheitern,
  weil ihm die vollständige Commit-Kette fehlt.
- Authentifizierung über die Secrets `GITLAB_MIRROR_TOKEN` (GitLab-Project-Access-Token,
  `glpat-`-Präfix) und `GITLAB_MIRROR_URL`.
- **Fail-fast bei fehlendem Secret:** Vor dem Push prüfen, ob beide Secrets gesetzt sind, und
  andernfalls mit einer Meldung abbrechen, die die fehlende Variable **beim Namen nennt**.
  Ohne diesen Schritt endet der Workflow grün, ohne gespiegelt zu haben — genau der stille
  Fehlschlag, den die Delta-Spec ausschließt.
- Das Token darf nicht ins Log geraten: Remote-URL nicht per `echo` ausgeben; das Token über
  eine Umgebungsvariable in die URL einsetzen, nicht als Literal in eine `run`-Zeile schreiben.
- `concurrency` auf eine feste Gruppe setzen, damit zwei schnell aufeinanderfolgende Merges
  sich nicht überholen und der Spiegel nicht auf einem älteren Stand stehen bleibt.

**Prüfung nach der Umsetzung:**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/gitlab-mirror-workflow.bats
```

## Aufgabe 2: Workflow-Selbstlistung beachten

Der Repo-Guard `tests/spec/ci-cd/workflow-self-trigger.bats` verlangt, dass ein Workflow mit
`push.paths`-Filter sich selbst in diesen Pfaden listet. Dieser Workflow verwendet **keinen**
`paths`-Filter (er soll bei jedem `main`-Push laufen), fällt also nicht darunter. Vor dem
Commit dennoch gegenprüfen, dass der Guard grün bleibt:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/workflow-self-trigger.bats
```

## Abgrenzung

Dieses Partial legt **kein** GitLab-Projekt an und hinterlegt **keine** Secrets — das sind
manuelle Abnahmeschritte im Hauptplan. Es ändert **keine** bestehende Workflow-Datei.
