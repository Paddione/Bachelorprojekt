# Verifikationsblock — lokale CI-äquivalente Prüfung (SSOT)

Der operative Verify-Block vor jedem Commit/PR. Skills (`dev-flow-execute` Schritt 3,
`dev-flow-chore` Schritt 3, `git-workflow` Schritt 1) verlinken hierher statt die Sequenz
zu duplizieren. Die Gate-*Mathematik* (S1–S4, Baseline-Ratchet) ist in
[`plan-quality-gates.md`](plan-quality-gates.md) dokumentiert — diese Datei ist die
*Ausführungs*-Referenz.

## Die vier Befehle

```bash
task workspace:validate     # Kustomize-Manifeste (nur wenn k8s-Manifeste berührt)
task test:changed           # Gezielte Tests für geänderte Domains (vitest --changed + BATS + quality)
task freshness:regenerate   # Generierte Artefakte aktualisieren — sonst CI "stale artifact"
# → Artefakte committen (git add + git commit), siehe Freshness-Artefakte unten
task freshness:check        # CI-Äquivalent: Freshness + S1–S4-Ratchet + Baseline-Key-Count-Assertion
```

**Wichtig:** Nach `regenerate` müssen die generierten Artefakte **gecommittet** werden, bevor `check` läuft — sonst vergleicht `check` gegen HEAD und sieht die frischen Artefakte als "stale". Siehe Abschnitt „Freshness-Artefakte — git add nach `regenerate`" unten.

**Beide Freshness-Befehle sind nötig:**
- `regenerate` aktualisiert die generierten Artefakte (Liste unten) — ohne sie ist CI rot.
- `check` failt lokal **genau wie CI** — insbesondere am S1-Zeilen-Ratchet gegen
  `docs/code-quality/baseline.json`. Ohne lokalen `check` wird eine Limit-Überschreitung
  erst nach dem Push sichtbar → Firefight-Modus.

**Bei NEUEN Dateien (`git add` noch nicht passiert):** `task freshness:regenerate` baut
seine Datei-Universe aus `git ls-files` — untracked Dateien werden nicht erfasst. Das
führt zu einem zweiten Durchlauf: erst `git add` der neuen Datei, dann `task
freshness:regenerate` erneut, dann `freshness:check`. Planbar zwei Runden einplanen.

Bei Änderungen unter `website/` zusätzlich: **`cd website && npx astro check`** [T002694].

> **`tsc --noEmit` ist dafür kein Ersatz.** Der CI-Job heißt `Vitest (website)`, führt aber
> `vitest + astro check + Knip` aus. `astro check` ist strenger als `tsc` und prüft zusätzlich
> `.astro`-Dateien. Am 2026-08-08 fiel PR #3823 mit `ts(2322)` in `astro check`, während `tsc`
> und die gezielt ausgeführte Testdatei lokal grün waren — der Jobname führte die Diagnose in
> die Vitest-Ergebnisse, die grün waren.
>
> Der Job wird **nicht** umbenannt: `Vitest (website)` ist ein Required Check der
> Branch-Protection (siehe `docs/superpowers/references/gotchas-footguns.md`). Ein neuer Name
> erschiene als neuer Check, während die Protection weiter auf den alten wartet — das blockiert
> jeden PR. Eine Umbenennung wäre nur zusammen mit einer Änderung der Branch-Protection möglich
> und ist diese Kopplung nicht wert.
>
> Besonders relevant bei Änderungen an **exportierten Typen**: Die Menge der betroffenen Dateien
> ist dann per Konstruktion unbekannt, eine gezielt ausgewählte Testdatei greift zu kurz.

Bei Manifest-Änderungen zusätzlich: `./tests/runner.sh local <TEST-ID>` für die relevanten Tests.

Bei Änderungen an `tests/spec/` zusätzlich: `task test:spec:changed` — CI fährt eine separate spec-Suite, die `test:changed` nicht abdeckt. Ohne diesen Schritt werden spec-Guard-Verletzungen erst nach dem Push sichtbar (T002291).

### Zwei rote Ergebnisse, die keine sind [T002375-p4]

**(a) Neue Dateien und der Freshness-Index.** Seit T002375-p4 zählt das Scan-Universum auch
untracked-aber-nicht-ignorierte Dateien, der Regelfall braucht also nur **einen** Durchlauf.
Das Netz bleibt trotzdem stehen — wer mit `.gitignore`-Ausnahmen arbeitet, kann weiterhin in
das alte Muster laufen. Dann gilt die Reihenfolge: erst `git add <neue Datei>`, dann
`task quality:index`, dann `task freshness:check`. Symptom des alten Musters: `file_count`
steigt beim zweiten Lauf um genau 1 (beobachtet 548 → 549, T002255/T002267).

**(b) Rote E2E-Services bei reinen Manifest-Änderungen sind KEIN PR-Blocker.**
`task test:changed` startet bei `k3d/`-, `environments/`- oder `VideoVault/`-Änderungen die
Gruppe `test:e2e:services` gegen `localhost:4321`. Ohne laufenden Dev-Stack sind 13
`ERR_CONNECTION_REFUSED` das erwartete Ergebnis. Seit T002375-p4 überspringt `test:changed`
die Gruppe mit sichtbarer Meldung, wenn der Port nicht antwortet.

Der Grund, warum das kein Blocker ist: **CI führt für PRs nur `test:spec:changed` plus
`tests/unit/manifests.bats` und `changed-manifests.bats` aus — nicht das volle
`task test:changed`.** Der lokale Lauf ist damit strenger als das Gate, das er simuliert. Die
CI-äquivalenten Kommandos:

```bash
task test:spec:changed
tests/unit/lib/bats-core/bin/bats tests/unit/manifests.bats tests/unit/changed-manifests.bats
```

## S1-Ratchet — Kurzform

Das Ratchet vergleicht gegen den **eingefrorenen Baseline-Wert**, nicht nur gegen das statische
Extension-Limit. Eine bereits gebaselinete (gewachsene) Datei hat **0 Zeilen Budget** — schon
+1 Zeile macht CI rot. Dann die Datei **echt verkleinern/aufteilen**, nicht kosmetisch Zeilen
zusammenziehen. Details + Budget-Mathematik: [`plan-quality-gates.md`](plan-quality-gates.md) §S1.

**Restbudget-Check ohne Plan** (z. B. Chores — kein plan-lint vorhanden), pro geänderter Datei
mit derselben Mathematik wie der Linter:

```bash
for f in $(git diff --name-only); do
  PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget "$f" 2>/dev/null \
    | awk -v f="$f" '{print f": Restbudget "$0}'
done
```

Bei Restbudget ≤ 0: Datei echt verkleinern.

## Freshness-Artefakte — git add nach `regenerate`

Diese Pfadliste lebt NUR hier (wartungskritisch — bei neuen Generatoren hier ergänzen):

```bash
git add \
  website/src/data/test-inventory.json \
  website/src/data/openspec-status.json \
  website/src/data/route-manifest.json \
  website/src/lib/learning-assets.generated.json \
  "website/public/learning-assets/THIRD-PARTY-ASSETS.md" \
  docs/code-quality/repo-index.json \
  docs/agent-guide/10-ziele.md \
  docs/agent-guide/20-werkzeuge.md \
  docs/agent-guide/30-bausteine.md \
  docs/agent-guide/maps/goals-map.md \
  docs/agent-guide/maps/tools-map.md \
  docs/agent-guide/maps/danger-map.md \
  website/src/lib/agent-guide.generated.json \
  website/src/lib/platform-descriptions.generated.json \
  docs/generated/graph.json \
  docs/generated/api-map.json \
  docs/generated/blast-radius.md \
  docs/diagrams/architecture.md \
  website/src/lib/sdlc/goals-data.generated.json 2>/dev/null || true
git diff --cached --quiet || git commit -m "chore: regenerate freshness artifacts [$TICKET_ID]"
```

> Der Pre-commit-Hook automatisiert `regenerate` nach `task secrets:install-hooks` —
> ohne Hook immer manuell ausführen, wenn `.ts/.svelte/.astro/.sh/.mjs`-Dateien geändert wurden.

## Post-Commit-Verifikation (Pflicht)

Nach `git commit` (oder nachdem der Pre-commit-Hook gelaufen ist) prüfen, dass die
regenerierten Artefakte wirklich im Commit liegen:

```bash
git show --stat HEAD   # PFLICHT: bestätigt, dass die regenerierten Artefakte
                        # tatsächlich im Commit liegen — ein grüner `git commit` allein
                        # belegt das NICHT (T002284: pre-commit kann eine gestagte
                        # Änderung lautlos zu einem Leer-Diff neutralisieren).
```

### Log-Aktualitäts-Regel [T002495-M8]

Vor jedem Hintergrund- oder Elevated-Lauf (z. B. PowerShell, background `task`, async `run_command`), dessen Ergebnis über eine Log- oder Transkriptdatei ausgelesen wird:
1. Die alte Logdatei löschen (`rm -f <log-path>`).
2. Vor dem Lesen des Logs prüfen, ob die Logdatei neu angelegt wurde. Die bloße Existenz eines alten Logs ist kein Beweis für einen erfolgreichen/fehlgeschlagenen neuen Lauf.
