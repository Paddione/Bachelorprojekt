# p1 — Diff-Basis-Skript

**target_files:** `scripts/ci-diff-base.sh`

## Warum getrennt

Vier Gates waehlen ihren Umfang aus einem Diff gegen `origin/main`. Auf GitLab heisst die
Basis je nach Pipeline-Art anders oder existiert gar nicht. Wuerde jeder Job das selbst
aufloesen, gaebe es vier Fundstellen fuer eine Semantik, die zwischen den Plattformen exakt
gleich sein muss — dieselbe Duplikations-Falle, gegen die Etappe 1 `CI_RUNNER_TAG` als
einzige Routing-Fundstelle gesetzt hat.

## Aufgaben

- [ ] `scripts/ci-diff-base.sh` anlegen. Aufloesungsreihenfolge und Exit-Codes exakt nach der
      Vertragstabelle in `tasks.md` § „Kontext fuer alle Partials". Das Skript schreibt
      **ausschliesslich** den SHA nach stdout; Diagnosen gehen nach stderr, damit
      `BASE="$(bash scripts/ci-diff-base.sh)"` verwendbar bleibt.

- [ ] Die `main`-Erkennung nicht an einer einzelnen Variable festmachen. Auf GitLab ist es
      `$CI_COMMIT_BRANCH`, auf GitHub `$GITHUB_REF_NAME`, lokal `git branch --show-current`.
      Das Skript prueft der Reihe nach und faellt auf den git-Aufruf zurueck.

- [ ] `set -euo pipefail` **nicht** blind setzen: Das Skript ruft `git merge-base` und
      `git rev-parse` in Faellen auf, in denen ein Fehlschlag ein regulaerer Zweig ist
      (kein `origin/main` im flachen Klon). Fehlschlaege werden explizit abgefangen und in
      den vorgesehenen Exit-Code uebersetzt, statt das Skript unter `-e` abbrechen zu lassen.
      Ein unter `-e` abgebrochenes Skript liefert Exit 1 — und 1 ist in der Vertragstabelle
      nicht vergeben, der Aufrufer koennte es also keinem Fall zuordnen.

- [ ] Shebang `#!/usr/bin/env bash`, ausfuehrbar (`chmod +x`), Kopfkommentar mit Ticket-Nummer
      und Verweis auf `openspec/specs/ci-cd.md` — Konvention der uebrigen Skripte unter
      `scripts/`.

- [ ] S4-Erreichbarkeit sicherstellen: Das Skript wird von `.gitlab-ci.yml` (p3) aufgerufen und
      im Runbook (p4) dokumentiert. Ohne mindestens eine dieser Referenzen meldet
      `task freshness:check` eine Orphan-Violation.

## Abnahme

```bash
bash -n scripts/ci-diff-base.sh              # Syntax
[ -x scripts/ci-diff-base.sh ]               # ausfuehrbar

# Fall "main-Push": leere Ausgabe, Exit 3
out="$(CI_COMMIT_BRANCH=main bash scripts/ci-diff-base.sh 2>/dev/null)"; rc=$?
echo "main-Push: rc=$rc out='${out}'"; [ "$rc" -eq 3 ] && [ -z "$out" ]

# Fall "MR-Basis vorgegeben": genau dieser Wert, Exit 0
sha="$(git rev-parse HEAD)"
out="$(CI_MERGE_REQUEST_DIFF_BASE_SHA="$sha" bash scripts/ci-diff-base.sh)"; rc=$?
echo "MR-Basis: rc=$rc out=$out erwartet=$sha"; [ "$rc" -eq 0 ] && [ "$out" = "$sha" ]
```

Die Abnahme gibt bei jedem Fall `rc` **und** die Ausgabe aus. Eine Pruefung, die nur auf
„Exit 0" schaut, kann nicht zwischen „hat den richtigen SHA geliefert" und „hat irgendetwas
geliefert" unterscheiden.
