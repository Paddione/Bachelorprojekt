# Proposal: actionlint-workflow-gate

## Why

GitHub-Actions-Workflows werden im Repo nirgends gelintet — weder in CI, noch als
Taskfile-Target, noch als Pre-Commit-Hook. `grep -rn 'actionlint' .github/ Taskfile.yml
taskfiles/ scripts/` liefert am Basis-Commit `f6f7e7f1996ab6beb33501d78c0de48f417d6a9c`
null Treffer.

Entscheidend ist die Fehlerart, nicht die Fehlerzahl. In PR #3979 stand

```yaml
if: steps.detect.outputs.count != '0' && secrets.ARBITRATION_KUBECONFIG != ''
```

Der `secrets`-Kontext ist in `steps.*.if` nicht verfügbar. Die Bedingung ist damit nicht
ungültig, sondern **immer falsch**: der Schritt wird übersprungen, der Job bleibt grün, und
in der Schritt-Liste steht `skipped` — von einem legitimen Skip nicht zu unterscheiden. Bei
einem Schritt, der eine Credential bereitstellt, heißt das: die Absicherung greift nicht und
nichts meldet es. Genau diese Klasse fällt zur Laufzeit auf, und dann lautlos.

## What

Ein einziger Einstiegspunkt `scripts/lint-workflows.sh`, erreichbar über `task
lint:workflows`, verdrahtet in den CI-Job `BATS Unit + Quality Gates` und in die
Änderungs-Selektion von `task test:changed`. Dazu `.github/actionlint.yaml` für das
self-hosted-Label `fleet-gpu`.

**Bestandsmessung — der Gate kann sofort fail-closed eingehen, kein Baseline-Freeze nötig.**
Das Ticket hielt den Bestand für unbekannt und schlug ein Einfrieren analog zum
Quality-Baseline-Muster vor. Gemessen ist der Bestand null:

```bash
# Basis-Commit: f6f7e7f1996ab6beb33501d78c0de48f417d6a9c
# actionlint 1.7.7, aus dem Release-Archiv (nicht apt)
printf 'self-hosted-runner:\n  labels:\n    - fleet-gpu\n' > /tmp/al.yaml
actionlint -config-file /tmp/al.yaml -shellcheck= -oneline | wc -l   # → 0
actionlint -config-file /tmp/al.yaml -shellcheck= >/dev/null; echo $?  # → 0

# ohne Konfiguration und mit gebündeltem shellcheck, zum Vergleich:
actionlint -oneline | wc -l                                          # → 24
actionlint -oneline | grep -o '\[[a-z-]*\]$' | sort | uniq -c
#   22 [shellcheck]     (SC2086/SC2016/SC2129/SC2155 — reiner Stil)
#    2 [runner-label]   (fleet-gpu, in arbitration.yml und opencode.yml)
```

Alle 24 Rohbefunde sind entweder Stil (shellcheck) oder das nicht deklarierte
`fleet-gpu`-Label. **Null** Befunde betreffen Workflow-Korrektheit. Die 27 Workflows sind
in dieser Hinsicht sauber; der Gate schützt ab sofort gegen Rückfälle, statt einen Bestand
zu verwalten.

## Design-Entscheidungen

**Wo der Lint läuft — CI-Schritt plus Taskfile-Target, kein Pre-Commit-Hook.**
Der CI-Schritt liegt im Job `BATS Unit + Quality Gates` und läuft *immer* (nicht nur bei
`pull_request`), wie die Nachbarschritte „Code-quality gates (always)". Ein Pre-Commit-Hook
kommt bewusst nicht dazu: ein Hook, der ohne Binary still überspringt, ist genau die Falle
aus T002506/T002554 (gitleaks lief lokal monatelang fail-open). Workflow-Dateien ändern
sich selten genug, dass CI plus explizites Target genügen.

**Wie das Binary bereitgestellt wird — gepinnt per curl, nie `apt`.**
CI holt `actionlint 1.7.7` aus dem Release-Archiv. Lokal bricht das Skript ohne Binary
**laut** ab und druckt den vollständigen Installationsbefehl; es überspringt nicht still.
`apt` scheidet aus demselben Grund aus wie bei gitleaks: die Distributionsversion weicht ab,
lokal und CI würden unterschiedliche Regeln prüfen.

**shellcheck und pyflakes bleiben aus.**
`openspec/specs/ci-cd.md` trägt die stehende Anforderung „Kein yamllint/shellcheck/
kubeconform in CI — nur task test:all". actionlint bündelt shellcheck für `run:`-Blöcke;
eingeschaltet würde der neue Gate dieser Anforderung widersprechen und 22 Stilbefunde als
Merge-Blocker einführen. `-shellcheck= -pyflakes=` schaltet beide ab. Der Gate zielt auf
Korrektheit (Ausdruckskontexte, Action-Inputs, Runner-Labels), nicht auf Stil.

**`fleet-gpu` wird deklariert, nicht stummgeschaltet.**
`.github/actionlint.yaml` mit `self-hosted-runner.labels: [fleet-gpu]` — die
`runner-label`-Regel bleibt scharf, damit ein *echter* Tippfehler in einem Label weiterhin
auffällt.

_Ticket: T003008_
