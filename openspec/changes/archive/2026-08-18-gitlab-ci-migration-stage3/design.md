---
title: "Design: GitLab-CI-Migration Etappe 3"
ticket_id: T012405
domains: [bachelorprojekt-infra, bachelorprojekt-test]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: GitLab-CI-Migration Etappe 3

## Leitplanken

- Jede Zusicherung dieser Etappe hängt an einem maschinellen Guard, der **ohne** GitLab-Zugang
  läuft (Etappe-1-Prinzip: die Guards lesen die YAML-Dateien, nicht die API).
- Keine Änderung an `.github/workflows/ci.yml`. Wo GitHub und GitLab dieselbe Logik brauchen,
  wandert sie in ein Skript, das beide aufrufen — nicht in zwei parallel gepflegte YAML-Blöcke.
- Der Gate-Flip ist explizit ausgeschlossen. Diese Etappe endet mit zwei Pipelines, die auf
  demselben Commit dasselbe prüfen; welche davon den Merge blockiert, entscheidet Etappe 4.

## D1 — Branch-Spiegelung per erweitertem Refspec, nicht per `--mirror`

Der Mirror-Workflow bekommt zusätzliche Trigger (`feature/**`, `fix/**`, `chore/**`) und pusht
den aktuellen Branch unter seinem eigenen Namen:

```
git push --force gitlab-mirror "HEAD:refs/heads/${BRANCH}"
```

`--mirror` bleibt verboten — die Begründung aus Etappe 1 (`ci-cd.md`, Requirement „Spiegelung
GitHub → GitLab per Push-Mirror") gilt unverändert und wird durch die Branch-Erweiterung eher
schärfer: Der `fetch-depth: 0`-Checkout trägt jetzt *mehr* fremde `refs/remotes/origin/*`, nicht
weniger.

**Löschung ist Teil der Spiegelung, nicht Aufräumarbeit.** Ein `delete`-Push-Event auf GitHub
löst einen Push mit leerem Quell-Ref aus:

```
git push gitlab-mirror ":refs/heads/${BRANCH}"
```

Ohne das bleibt jeder gemergte Feature-Branch auf GitLab liegen. Das ist nicht nur unordentlich:
Ein toter Branch bleibt ein gültiges Pipeline-Ziel, und beim späteren Gate-Flip zeigt die
GitLab-Branch-Liste einen Zustand, den GitHub längst nicht mehr hat.

| Verworfene Alternative | Warum nicht |
|---|---|
| Pull-Mirroring (GitLab zieht) | Kostenpflichtiges gitlab.com-Feature, auf dem Plan des Projekts nicht verfügbar (Etappe-1-Befund, unverändert). |
| `git push --mirror` | Überträgt `refs/remotes/origin/*` unsichtbar und löscht GitLab-seitige Refs, die die Quelle nicht kennt. |
| Alle Branches spiegeln (`refs/heads/*`) | Zieht Renovate-, Release-Please- und Factory-Batch-Branches mit. Jeder erzeugt eine volle Pipeline auf einem Runner, der schon der Engpass ist. Die drei Präfixe sind exakt die Konvention aus `CLAUDE.md` §Development Rules 7. |

## D2 — `scripts/ci-diff-base.sh` als einzige Fundstelle der Diff-Basis

Vier Gates wählen ihren Umfang aus einem Diff. Die Basis heißt je nach Kontext anders:

| Kontext | Verfügbar | Basis |
|---|---|---|
| GitHub PR | `origin/main` nach `git fetch` | `origin/main` |
| GitLab MR-Pipeline | `CI_MERGE_REQUEST_DIFF_BASE_SHA` | ebendieser SHA |
| GitLab Branch-Pipeline (gespiegelt) | nur der Branch | `git merge-base origin/main HEAD` |
| GitLab `main`-Push | kein Gegenüber | **keine** — volle Menge |

Das Skript löst in dieser Reihenfolge auf und schreibt den SHA nach stdout. Für den
`main`-Push gibt es Exit-Code 3 und leeres stdout — bewusst **nicht** Exit 0, damit ein
aufrufender Job „keine Basis" nicht mit „leerer Diff" verwechselt.

**Das ist die eigentliche Falle dieser Etappe.** Eine fehlgeschlagene Basis-Auflösung und ein
legitim leerer Diff sehen im Aufrufer identisch aus: beide liefern null Dateien und damit null
ausgewählte Tests. Ein Job, der daraus grün ableitet, meldet „geprüft" für einen Commit, den
niemand geprüft hat — und das fällt genau dann nicht auf, wenn es zählt. Deshalb ist die
Unterscheidung im Exit-Code verankert und nicht der Interpretation der Aufrufer überlassen.

Die Etappe-1-Regel „leerer Lauf gilt als Fehlschlag" bleibt für die `main`-Pipeline bestehen
(volle Mengen, null Tests = Fehler) und wird für Branch-Pipelines zu: null Tests ist zulässig,
**wenn** die Basis auflösbar war.

## D3 — `parallel: 4` statt vier Job-Definitionen

GitLabs `parallel:` setzt `CI_NODE_INDEX` (1-basiert) und `CI_NODE_TOTAL`. Beides mappt direkt
auf `SPEC_SHARD`/`SPEC_SHARDS`, die `Taskfile.yml:789` bereits auswertet — es braucht keine
Änderung an `scripts/spec-shard.sh`.

Kein Aggregator-Job. Auf GitHub existiert `test-factory` ausschließlich, weil ein
**übersprungener** Required Check in der Branch Protection als bestanden zählt — der Aggregator
mit `if: always()` schließt dieses Loch. GitLab hat diese Semantik nicht: ein nicht gelaufener
Job lässt die Pipeline nicht grün werden. Den Aggregator trotzdem zu bauen, hieße eine
GitHub-Eigenheit als Struktur zu spiegeln statt ihre Wirkung.

## D4 — `rules:` trennt Vollmenge von Diff-Auswahl

```yaml
.scoped_rules: &scoped_rules
  - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  - if: $CI_COMMIT_BRANCH == "main"          # Vollmenge
  - if: $CI_COMMIT_BRANCH =~ /^(feature|fix|chore)\//
```

Ein Job unterscheidet die beiden Fälle nicht über `rules`, sondern über den Exit-Code von
`ci-diff-base.sh` (D2). Damit gibt es je Job **eine** Definition statt zweier durch `rules`
getrennter Varianten — dieselbe Anti-Duplikations-Entscheidung wie D3 in Etappe 1.

`interruptible: true` auf allen neuen Jobs. Bei mehreren Pushes hintereinander bricht GitLab
die überholte Pipeline ab, statt den Runner mit veralteten Ständen zu belegen. Auf einem
Runner, der laut Etappe-2-Messung ohnehin 2–3× langsamer ist als SaaS, ist das kein Feinschliff.

## D5 — `commit-lint`: Commit-Range statt PR-Titel-Action

`amannn/action-semantic-pull-request` prüft den **PR-Titel** über die GitHub-API. Auf GitLab
existiert dieser Titel bei einer gespiegelten Branch-Pipeline gar nicht — es gibt keinen MR.

Der GitLab-Job prüft deshalb, was auf beiden Seiten existiert: die **Commit-Nachrichten im
Range**, mit denselben Skripten, die der lokale Hook und der GitHub-Job schon aufrufen
(`scripts/validate-commit-msg.sh range`, `scripts/check-commit-vs-diff.sh`). Ist
`CI_MERGE_REQUEST_TITLE` gesetzt (echter MR), wird zusätzlich der Titel gegen dieselbe
Typ-Liste geprüft.

Das ist keine vollständige Parität, und das gehört ins Protokoll: Solange Reviews auf GitHub
stattfinden, bleibt die PR-Titel-Prüfung dort die einzige. Beim Gate-Flip wandert der Titel
mit dem Review nach GitLab und die MR-Zweig des Jobs greift. Ein Nachbauen der GitHub-PR-API
gegen GitLab wäre Aufwand für einen Zustand, den der Flip ohnehin auflöst.

## D6 — Werkzeug-Parität wird von einer Version auf eine Liste erweitert

Der bestehende Guard `tests/spec/ci-cd/gitlab-tool-parity.bats` vergleicht heute genau die
gitleaks-Version zwischen beiden Dateien. Mit sieben neuen Jobs kommen weitere gepinnte
Werkzeuge dazu (Node, pnpm, Go, kubectl, yq, Trivy). Der Guard wird auf eine Tabelle
erweitert: je Werkzeug eine Zeile mit der Fundstelle auf beiden Seiten, verglichen wird der
**Versionswert**, nicht die Zeichenkette der Fundstelle.

## D7 — Was diese Etappe bewusst NICHT absichert

- **Laufzeit.** Sieben zusätzliche Jobs, davon vier parallele Shards, auf einem Runner, dessen
  Cluster-CP-Knoten laut Etappe-2-Befund bei 96 % CPU-Requests liegt. Diese Etappe misst die
  Gesamtlaufzeit und schreibt sie fest, setzt aber **kein** Laufzeit-Budget als Gate. Ob die
  Kapazität für den Flip reicht, ist eine Messung, die erst nach dieser Etappe möglich ist.
- **Urteils-Gleichheit.** Dass beide Pipelines auf demselben Commit dasselbe Urteil fällen, ist
  das Ziel — belegen kann es nur der Parallelbetrieb über mehrere Wochen, nicht ein Guard.

## Offene Punkte für Etappe 4 (Gate-Flip)

- Required Checks in der GitHub-Branch-Protection auf die GitLab-Ergebnisse umhängen (braucht
  eine Status-Rückmeldung GitLab → GitHub Commit-Status, oder den vollständigen Umzug des
  Reviews).
- Entscheidung, ob Review und MR nach GitLab wandern oder GitHub Review-Oberfläche bleibt.
- Stilllegung der abgelösten `ci.yml`-Jobs — erst nach belegter Urteils-Gleichheit.
- Runner-Kapazität: zweiter Runner oder SaaS-Kontingent für die Spitzenlast.
