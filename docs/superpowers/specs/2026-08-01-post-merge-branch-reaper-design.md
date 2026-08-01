# Post-Merge-Branch-Reaper — Design

- **Ticket:** T002520
- **Datum:** 2026-08-01
- **Status:** approved

## Problem

`delete_branch_on_merge=true` ist auf Repo-Ebene gesetzt, und jeder Merge-Pfad im Repo ruft
`gh pr merge --delete-branch`. Trotzdem lagen am 2026-08-01 26 Remote-Branches auf `origin`,
24 davon ohne jeden PR.

Die Ursache ist strukturell, nicht ein defekter Hook: Beide Mechanismen greifen nur, wenn der
Branch **selbst** gemergt wird. Plan- und Factory-Branches werden aber regelmäßig über einen
Sammel-PR nach `main` geführt — auf ihrem eigenen Ref findet nie ein Merge-Event statt. Damit
existiert kein Zeitpunkt, an dem irgendein Mechanismus sie abräumt.

## Befund

Gemessen an den 20 manuell gereapten Refs (archiviert unter `refs/archive/reaped/*`):

| Beobachtung | Wert |
|---|---|
| Branches an Tickets mit Status `done`/`archived` | 20 von 26 |
| Blob-Abweichungen unter `openspec/changes/**` oder generierten Pfaden | 66 von 69 |
| Echte abweichende Quelldateien | **1** |

Die eine Ausnahme ist `tests/spec/t2431-k1-vector-db/verify.bats` auf
`feature/t2431-k1-vector-db-T002431`. Deren Ticket steht auf `done · shipped`, obwohl weder der
Test noch sein Deliverable `docs/diagrams/k1-vector-db.md` auf `main` existieren — ein separater
Prozess-Drift-Befund, der hier nur als Beleg dient.

Daraus folgt die Kriterienwahl unmittelbar:

- **„Blob-Diff muss leer sein"** hätte 1 von 20 Leichen erfasst — praktisch wirkungslos.
- **„Ticket `done` genügt"** hätte alle 20 erfasst, aber auch T002431 — und damit die einzige
  Kopie eines nie gemergten Deliverables, leise im CI, ohne Widerspruch.

Ein tragfähiger Reaper braucht deshalb **beide** Signale: das Ticket-Signal *und* eine
Inhaltsprüfung, die zwischen „Plan-Artefakt, gehört nie einzeln nach `main`" und „echte
Quelldatei, fehlt in `main`" unterscheidet.

## Lösung

Ein neuer Job `reap-branches` in `.github/workflows/post-merge.yml`, der
`scripts/branch-reaper.sh` aufruft.

### Löschkriterium

Ein Branch wird gelöscht, wenn **alle vier** Bedingungen gelten:

1. Der Branch trägt die Ticket-ID des Merge-Commits im Namen (case-insensitiv).
2. Es gibt keinen offenen PR auf dem Branch.
3. Der Ticket-Status ist `done` oder `archived`.
4. **Jede** Blob-Abweichung zu `origin/main` matcht die Allowlist:
   - `openspec/changes/**`
   - `docs/code-quality/**`
   - `website/src/data/**`
   - `.release-please-manifest.json`
   - `website/CHANGELOG.md`
   - `website/package.json`

Trifft eine Bedingung nicht zu, wird der Branch **nicht** gelöscht, sondern mit Begründung in
der Job-Summary gemeldet. Der gerade gemergte Head-Branch ist immer ausgenommen.

Der Blob-Vergleich läuft über Hash-Gleichheit pro Datei gegen `origin/main`, nicht über
`git diff <commit> -- <pfad>` und nicht über einen Three-Dot-Diff. Beides ist in diesem Repo
dokumentiert fehleranfällig: Three-Dot misst gegen den Abzweigpunkt, der sich beim Squash-Merge
nicht verschiebt, und ein Arbeitsbaum-Diff verwechselt git-Fehler mit Inhaltsänderung.

### Sicherheitsnetz

Vor jedem Delete wird der Branch-SHA als `refs/tags/reaped/<branch>` nach `origin` gepusht.
Gelöschte Branch-Refs sind auf GitHub nicht garantiert wiederherstellbar; Tags überleben
dauerhaft und sind für das ganze Team zugänglich.

### Aufbau

Die Logik lebt in `scripts/branch-reaper.sh`, der Workflow ruft nur auf. Das macht sie lokal
gegen ein Fixture-Repo testbar, aus `repo-hygiene` heraus manuell aufrufbar und hält
`post-merge.yml` lesbar — dieselbe Trennung, die `devflow-post-merge-ticket-closure.sh` schon
vorlebt.

Das Skript unterstützt einen Dry-Run-Modus, in dem es die Löschkandidaten samt Begründung
ausgibt, ohne Refs anzufassen. Dieser Modus ist zugleich die Testoberfläche.

### Berechtigungen

Der Job braucht `contents: write`, um Refs zu löschen und Tags zu pushen. `post-merge.yml` steht
workflowweit auf `contents: read`; die Erweiterung bleibt **auf diesen Job begrenzt** — aus
demselben Grund, den der Kommentar bei `render-artifact` im selben Workflow dokumentiert.

### Fehlerverhalten

Der Job hängt nur an `mark-awaiting`, nicht am Deploy-Pfad, und ist non-fatal: ein Fehler beim
Reapen darf einen Deploy nie blockieren. Das entspricht dem Verhalten der übrigen
Post-Merge-Schritte.

## Tests

`tests/spec/ci-cd/branch-reaper.bats`, output-verifizierend nach Repo-Konvention — geprüft wird,
welche Branches das Skript im Dry-Run zum Löschen vorschlägt, nicht welche Muster im Quelltext
stehen.

Fixture-Repo mit vier Branches:

| Fall | Erwartung |
|---|---|
| Ticket `done`, nur Allowlist-Abweichungen | wird zum Löschen vorgeschlagen |
| Ticket `done`, echte Quelldatei weicht ab | wird verschont, mit Begründung |
| offener PR | wird verschont, mit Begründung |
| Ticket offen | wird verschont, mit Begründung |

Der erste Fall ist der Positiv-Anker und muss durchlaufen, bevor die drei Negativ-Aussagen
gelten — sonst bestehen sie vakuos, wenn das Skript gar nichts findet.

## Bekannte Grenze

Der Merge-Trigger erfasst 17 der 20 beobachteten Fälle. Drei Branches (T000252, T002351 zweimal)
tragen ihre ID in keiner `main`-Commit-Message, weil ihre Arbeit über einen Sammel-PR mit fremder
ID nach `main` kam. Ein zeitbasierter Sweeper würde diese Lücke schließen, wurde aber bewusst
abgewählt. Die Grenze wird dokumentiert, nicht geschlossen.

## Bewusst nicht Teil dieser Arbeit

- Ein periodischer Sweep über alle Remote-Branches.
- Das Aufräumen lokaler Branches — das leistet `repo-hygiene` §2.
- Der Prozess-Drift bei T002431 (Ticket `done` ohne Deliverable auf `main`). Eigener Vorgang.
