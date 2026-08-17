# Design: GitLab-CI-Migration Etappe 1

## Goals

- Die **Compute-Ebene** der CI auf eigene Hardware verlagern, mit Cloud-Compute als Rückfall.
- Die Tragfähigkeit an drei echten, sicherheitsrelevanten Jobs nachweisen, bevor ein Gate umzieht.
- Den Rückfall so bauen, dass er im Ernstfall **eine Variablenänderung** ist und nichts weiter.
- Jede Zusicherung dieser Etappe an einen maschinellen Guard hängen, der ohne GitLab-Zugang läuft.

## Non-Goals

- Migration der übrigen GitHub-Workflows (Build, E2E, Release, Factory).
- Umzug des Merge-Gates, von Auto-Merge, release-please oder Renovate.
- Kubernetes-Executor auf fleet — Etappe 2.
- self-hosted GitLab CE.
- Abschaltung irgendeines GitHub-Workflows.

## Decisions

### D1 — gitlab.com SaaS als Steuerebene, nicht self-hosted GitLab CE

**Entscheidung:** Repo-Hosting und Pipeline-Orchestrierung liegen auf gitlab.com. Migriert wird
nur, wo die Jobs *rechnen*.

**Begründung:** Self-hosted GitLab CE (Omnibus) belegt dauerhaft ≥ 4 GB RAM auf fleet, und
Backups sowie Upgrades werden zur Dauerbetriebslast. Der Cloud-Fallback — das ausdrückliche
Ziel dieser Arbeit — müsste dann als Autoscaling-Runner selbst gebaut werden, statt vorhanden
zu sein.

**Trade-off:** Ein Datenschutzargument für CE trägt hier nicht, weil der Quelltext bereits bei
GitHub liegt. Wir tauschen einen US-Hoster gegen zwei, gewinnen dafür den Fallback geschenkt.
Die Entscheidung ist umkehrbar: Ein späterer CE-Umzug erbt `.gitlab-ci.yml` und die
Runner-Registrierung unverändert, weil beide instanz-agnostisch sind.

### D2 — Fallback über Tag-Routing, nicht über Retry oder zweite Pipeline

**Entscheidung:** Jeder Job deklariert `tags: [$CI_RUNNER_TAG]`. Die Projekt-Variable
`CI_RUNNER_TAG` steht normal auf dem self-hosted Tag und wird im Störfall auf
`saas-linux-small-amd64` gesetzt.

**Begründung:** GitLab hat **keinen** nativen „Runner offline → nimm einen Shared Runner"-
Automatismus. Variablen-Expansion in `tags:` ist der von GitLab dokumentierte Weg für dynamische
Runner-Auswahl. Die betrachteten Alternativen scheitern jeweils an einem konkreten Punkt:

| Alternative | Warum verworfen |
|---|---|
| `retry:` mit anderem Tag | `retry` kann keine Tags wechseln — es wiederholt denselben Job auf derselben Zielmenge. |
| Zwei Job-Sätze mit `rules:` | Verdoppelt jede Jobdefinition; jede spätere Änderung muss an zwei Stellen gleich erfolgen — genau die Drift-Klasse, die D3 zu verhindern versucht. |
| Zweite Pipeline-Datei | Dieselbe Verdopplung, zusätzlich zwei Wahrheiten darüber, was „die CI" ist. |

**Trade-off:** Das Umschalten ist **manuell**, nicht automatisch. Das ist bewusst: Ein
automatisches Ausweichen würde den Ausfall des self-hosted Runners verbergen, und ein
Ausfall, den niemand bemerkt, wird nicht behoben. Der Rückfall gehört ins Runbook, nicht in
eine Selbstheilung.

### D3 — Werkzeug-Parität wird erzwungen, nicht dokumentiert

**Entscheidung:** Ein BATS-Guard vergleicht die gitleaks-Version in `.github/workflows/ci.yml`
mit der in `.gitlab-ci.yml` und schlägt bei Abweichung fehl.

**Begründung:** Zwei CI-Systeme, die denselben Arbeitsbaum mit unterschiedlichen
Scanner-Versionen prüfen, liefern zwei verschiedene Sicherheitsurteile über denselben Code.
Genau diese Asymmetrie hat im Repo schon einmal Schaden angerichtet (T002506/T002554: lokal
8.16.0 gegen CI 8.18.2, 85 Fehlalarme). Eine Konvention in Prosa hätte das nicht verhindert.

**Trade-off:** Ein Versions-Bump kostet künftig zwei Änderungen statt einer. Das ist der Zweck.

### D4 — Der Spiegel läuft die volle Menge, nicht die Diff-Auswahl

**Entscheidung:** Die GitLab-Jobs rufen die vollständige Testmenge auf, nicht
`scripts/find-changed-tests.sh`, `task test:changed` oder dessen Alias `task test:all`.

**Begründung:** Der Mirror pusht `main`. Eine Diff-Auswahl gegen `main` selektiert dort die
leere Menge — die Pipeline wäre grün, ohne einen Test ausgeführt zu haben. Das ist dieselbe
Falle, die bei Vitest bereits einmal zugeschlagen hat (Memory: „Vitest grün ohne Testlauf").
Deshalb fordert die Delta-Spec ausdrücklich, dass ein leerer Lauf als Fehlschlag gilt.

### D5 — Registrierung über `glrt-`-Authentication-Token

**Entscheidung:** `scripts/gitlab-runner-setup.sh` registriert mit `--token`, nie mit
`--registration-token`.

**Begründung:** Der Registration-Token-Fluss ist seit GitLab 16 veraltet und aus aktuellen
Versionen entfernt. Ein darauf gebautes Skript würde genau dann fehlschlagen, wenn es zum
ersten Mal gebraucht wird.

**Zusatz:** Das Skript bekommt einen `--dry-run`-Modus, der den Registrierungsbefehl **ausgibt**
statt ihn auszuführen. Damit prüft der Guard das *Verhalten* des Skripts statt seinen Quelltext
zu greppen — die Repo-Konvention „Output- statt Source-Verifikation" (T002448-M4) wird
eingehalten, obwohl CI-Konfiguration von ihr ausgenommen wäre.

## Architecture

```
GitHub (SSOT, Merge-Gate)                     GitLab (Spiegel, Zweitprüfung)
┌────────────────────────────┐                ┌─────────────────────────────┐
│ PR ─► ci.yml (10 Jobs)     │                │ .gitlab-ci.yml (3 Jobs)     │
│      └─ Required Checks    │                │   bats-unit                 │
│                            │                │   manifests                 │
│ merge ─► main              │                │   gitleaks                  │
│         │                  │  push --mirror │      │                      │
│         └─ mirror-to-gitlab├───────────────►│      ▼ tags: [$CI_RUNNER_TAG]│
└────────────────────────────┘   (Deploy-     └──────┬──────────────────────┘
                                  Token)             │
                                          ┌──────────┴───────────┐
                                          ▼                      ▼
                              self-hosted Runner       gitlab.com Shared
                              (Docker-Executor)        Runner  ── Fallback
                              CI_RUNNER_TAG=           CI_RUNNER_TAG=
                              bachelorprojekt-local    saas-linux-small-amd64
```

Der Steuerpfad ist bewusst einseitig: GitLab hat keinen Rückkanal nach GitHub. Damit kann eine
Fehlkonfiguration auf GitLab-Seite den Merge-Pfad nicht beschädigen.

## Error Handling

| Fehlerfall | Verhalten | Sichtbarkeit |
|---|---|---|
| Mirror-Secret fehlt | Workflow bricht ab und benennt das Secret | GitHub-Actions-Log; kein stiller Nicht-Spiegel |
| self-hosted Runner offline | Jobs bleiben `pending` | Runbook: `CI_RUNNER_TAG` umschalten |
| gitleaks-Versionsdrift | BATS-Guard rot | GitHub-PR-Gate — der Guard läuft auf GitHub, nicht auf GitLab |
| Leerer Testlauf | gilt als Fehlschlag | Testzahl > 0 ist Teil der Zusicherung |
| Token fehlt im Setup-Skript | Exit ≠ 0 mit Benennung der Variable | Terminal des Betreibers |

Die Guards laufen **auf GitHub**. Das ist Absicht: Sie sichern die Migration ab und dürfen
nicht von dem System abhängen, dessen Aufbau sie prüfen.

## Testing

Alle Guards liegen unter `tests/spec/ci-cd/` als je eine eigene Datei pro Vorgang (T002416) und
laufen ohne GitLab-Zugang, ohne Netz und ohne installierten `gitlab-runner`:

1. **Versions-Parität gitleaks** — extrahiert die Version aus beiden CI-Dateien und vergleicht.
   Mit Positiv-Anker: Der Test belegt zuerst, dass aus *beiden* Dateien überhaupt eine Version
   extrahiert wurde, bevor er sie vergleicht — sonst bestünde er vakuos, wenn eine Datei fehlt
   (T002356-M1).
2. **Tag-Routing** — jeder Job in `.gitlab-ci.yml` referenziert die Variable statt eines
   Literals. Positiv-Anker: Es muss mindestens ein Job existieren.
3. **Runner-Setup-Dry-Run** — führt das Skript aus und prüft dessen **Ausgabe**: enthält
   `--token`, enthält nicht `--registration-token`, Exit-Code 0.
4. **Mirror-Workflow** — Trigger auf `main`-Push, Push-Richtung nach GitLab.
5. **Nicht-Blockieren** — kein GitHub-Workflow wurde entfernt oder dauerhaft kurzgeschlossen.

Die Guards prüfen **Semantik statt Darstellung** (T002716): Versionsvergleich statt fixer
Zeichenkette, YAML-Struktur statt Zeilenanker, Exit-Code und Ausgabeinhalt statt exaktem
Wortlaut.

## Offene Punkte für Etappe 2

- Kubernetes-Executor auf fleet als zweiter self-hosted Runner (Konvention: eigenes
  Stack-Verzeichnis `k3d/<name>-stack/` mit eigenem `namespace.yaml`, eingebunden über die
  Brand-Overlays — nicht über `k3d/kustomization.yaml`, das ist workspace-only).
- Entscheidung, welcher Gate-Typ zuerst umzieht.
