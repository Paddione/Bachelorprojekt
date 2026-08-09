---
title: "main-direct-push-guard — Implementation Plan"
ticket_id: T002889
domains: [ci, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# main-direct-push-guard — Implementation Plan

## Partials

| # | Rolle | Zieldateien |
|---|-------|-------------|
| 1 | fix | `.github/workflows/freshness-regen.yml`, `scripts/check-branch-protection.sh`, `Taskfile.yml` |
| 2 | tests | `tests/spec/ci-cd/main-direct-push-guard.bats` |

Zwei Partials. Der Guard-Test liegt bereits rot vor (siehe Task 1) und wird in Partial 2 nur um
die Abdeckung der Bot-Umstellung ergänzt; Partial 1 trägt die Implementierung. Die Zieldateien
sind disjunkt.

Die Scharfstellung der Branch Protection selbst ist **kein Partial**: sie ist keine Dateiänderung,
sondern ein API-Aufruf gegen GitHub, und sie muss nach dem Merge erfolgen (Task 5). Ein Partial
dafür würde einen leeren Diff erzeugen.

## File Structure

```
.github/workflows/freshness-regen.yml        (geändert — Direkt-Push → Branch + PR + Auto-Merge)
scripts/check-branch-protection.sh           (neu    — Protection-Audit, API oder JSON-Datei)
Taskfile.yml                                 (geändert — Task-Eintrag, S4-Erreichbarkeit)
tests/spec/ci-cd/main-direct-push-guard.bats (vorhanden, rot — wird erweitert)
openspec/specs/ci-cd.md                      (beim Archivieren — Delta aus specs/ci-cd.md)
```

**S1-Budgets** (wirksame Schwelle = statisches Limit, keine der Dateien ist gebaselined):

| Datei | Ist | Wirksame Schwelle | Budget |
|---|---|---|---|
| `.github/workflows/freshness-regen.yml` | 76 | `.yml` steht nicht in `s1.limits` — nicht S1-gegated | frei |
| `scripts/check-branch-protection.sh` | 0 (neu) | `.sh` 800 | 800 |
| `tests/spec/ci-cd/main-direct-push-guard.bats` | 82 | `.bats` steht nicht in `s1.limits` — nicht S1-gegated | frei |

Das Prüfskript ist auf rund 90 Zeilen angelegt und bleibt damit weit unter der Schwelle; eine
Aufteilung ist nicht vorzusehen.

<!-- vitest: kein neuer Test nötig, weil dieser Vorgang keine Datei unter website/src/ berührt —
     der gesamte Diff liegt in .github/workflows/, scripts/ und tests/spec/. -->

---

## Task 1 — Rot-Nachweis bestätigen (Ausgangslage)

Der Failing Test liegt bereits im Branch (`tests/spec/ci-cd/main-direct-push-guard.bats`,
Commit des Plan-Stage). Vor jeder Änderung den roten Stand reproduzieren, damit der spätere
Umschlag auf grün etwas belegt:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/main-direct-push-guard.bats
# expected: FAIL — beide Tests
#   Test 1 scheitert am fehlenden PR-Schritt in freshness-regen.yml (Zeile 45)
#   Test 2 scheitert an der noch nicht existierenden scripts/check-branch-protection.sh (Zeile 57)
```

Schlägt hier bereits nur einer der beiden fehl, ist der Ausgangszustand nicht der angenommene —
dann zuerst klären, warum, statt weiterzubauen.

---

## Task 2 — `scripts/check-branch-protection.sh` anlegen

Neues Skript, das die Protection-Einstellungen eines Branches bewertet.

Kontrakt (vom Test in Partial 2 festgeschrieben):

- `--from-json <datei>` liest die Einstellungen aus einer Datei statt aus der API. Das ist der
  Pfad, den der Test benutzt, und zugleich der einzige, der ohne Admin-Scope funktioniert.
- Ohne `--from-json` holt es `repos/<owner>/<repo>/branches/<branch>/protection` über `gh api`.
  Standard-Branch ist `main`.
- Exit 0, wenn `enforce_admins.enabled` wahr ist **und** `required_pull_request_reviews`
  vorhanden ist. Sonst Exit 1.
- Im Fehlerfall wird **jeder** unerfüllte Punkt einzeln benannt, nicht nur der erste. Grund: wer
  nach dem ersten Treffer abbricht, schließt eine Lücke und lässt die andere offen — genau der
  Zustand, den dieser Vorgang behebt.
- Fehlt `gh` oder schlägt der API-Aufruf fehl, endet das Skript mit einer eigenen Meldung und
  Exit 2, damit „nicht prüfbar" nicht als „geprüft und in Ordnung" durchgeht.

Registrierung für S4 (jedes neue `scripts/*.sh` muss erreichbar sein): Task-Eintrag in
`Taskfile.yml`, der das Skript ohne Argumente gegen die Live-API aufruft.

---

## Task 3 — `freshness-regen.yml` auf den PR-Pfad umstellen

Der heutige Schritt „Commit and push if changed" (Zeilen 56–76) endet mit `git commit` gefolgt von
nacktem `git push`. Er wird ersetzt durch: Branch anlegen, committen, Branch pushen, PR öffnen,
Auto-Merge aktivieren.

Dabei zwingend beachten:

- **Die `[skip ci]`-Logik entfällt vollständig** (heute Zeilen 64–74). Unter Required Status
  Checks meldet ein übersprungener Lauf nie ein Ergebnis, und der PR bliebe unbegrenzt offen.
  Der ursprüngliche Zweck der Bedingung — `build-website.yml` nicht bei jedem Artefakt-Lauf
  auszulösen — entfällt mit dem PR-Pfad, weil der Push nicht mehr auf `main` erfolgt.
- **Der Branchname muss je Lauf eindeutig sein**, sonst kollidieren zwei Läufe auf demselben Ref.
  `github.run_id` ist dafür der vorgesehene Wert.
- **Kein PR ohne Änderung.** Der bestehende `steps.diff.outputs.changed == 'true'`-Guard bleibt
  die Bedingung des gesamten Schritts; ohne Diff entsteht weder Branch noch PR.
- `secrets.GH_PAT` bleibt als Token nötig — nicht wegen der Admin-Rechte, sondern damit der
  eröffnete PR die Workflows auslöst (mit `GITHUB_TOKEN` erzeugte PRs tun das nicht).

Der PR-Titel folgt der Conventional-Commit-Konvention, weil der Check „Conventional Commits" zu
den sieben Required Checks gehört und sonst nie grün wird.

---

## Task 4 — Guard-Test um die Bot-Umstellung erweitern (Partial 2)

`tests/spec/ci-cd/main-direct-push-guard.bats` deckt bisher ab, dass ein PR-Schritt existiert und
kein nacktes `git push` mehr vorkommt. Ergänzen um zwei Aussagen, jeweils mit Positiv-Anker im
selben Test:

- Auto-Merge wird auf dem erzeugten PR aktiviert — ohne das bliebe der PR liegen und der Bot wäre
  faktisch tot, während der Test grün meldet.
- `[skip ci]` kommt in der Datei nicht mehr vor. Positiv-Anker davor: der Commit-Schritt existiert
  überhaupt noch (sonst ist die Abwesenheit trivial erfüllt).

Danach muss der Test grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/main-direct-push-guard.bats
```

---

## Task 5 — Protection scharfstellen (NACH dem Merge, in dieser Reihenfolge)

Diese Reihenfolge ist der Kern des Vorgangs, nicht Formsache: `enforce_admins` vor der
Bot-Umstellung zu aktivieren legt die Freshness-Läufe still.

1. PR dieses Vorgangs ist auf `main` gemergt.
2. Einen Freshness-Lauf abwarten oder manuell auslösen und belegen, dass er einen PR öffnet und
   dieser durch Auto-Merge landet. Erst wenn das nachweislich funktioniert, weiter.
3. Protection setzen:
   ```bash
   gh api -X PATCH repos/Paddione/Bachelorprojekt/branches/main/protection/enforce_admins
   gh api -X PATCH repos/Paddione/Bachelorprojekt/branches/main/protection \
     --input <json mit required_pull_request_reviews und den sieben bestehenden contexts>
   ```
   Der zweite Aufruf ersetzt die gesamte Protection — die sieben vorhandenen
   `required_status_checks.contexts` müssen darin unverändert enthalten sein, sonst gehen sie
   verloren.
4. Ergebnis belegen und im Ticket festhalten:
   ```bash
   bash scripts/check-branch-protection.sh
   # erwartet: Exit 0
   ```

Schlägt Schritt 2 fehl, wird Schritt 3 **nicht** ausgeführt und der Bot-Pfad zuerst repariert.

---

## Task 6 — Verifikation

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd/
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich manuell gegen die Ausgangslage prüfen: `scripts/check-branch-protection.sh` meldet vor
Task 5 Exit 1 mit beiden benannten Mängeln und nach Task 5 Exit 0. Beide Ausgaben gehören als
Beleg ans Ticket T002889 — ohne sie ist die Behauptung „Protection steht" unbelegt.
