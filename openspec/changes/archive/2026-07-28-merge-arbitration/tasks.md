---
title: "merge-arbitration — Implementation Plan"
ticket_id: T002423
domains: [scripts, ci, factory, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# merge-arbitration — Implementation Plan

_Ticket: T002423 · Design-Spec: `docs/superpowers/specs/2026-07-28-merge-arbitration-design.md`_

## File Structure

| Datei | Art | Zielgröße | Limit |
|---|---|---|---|
| `scripts/arbitration/cluster-schema.json` | neu | ~60 Zeilen | — |
| `scripts/arbitration/detect.sh` | neu | ~180 Zeilen | 500 (`.sh`) |
| `scripts/arbitration/synthesize.mjs` | neu | ~200 Zeilen | 500 (`.mjs`) |
| `scripts/arbitration/apply.sh` | neu | ~220 Zeilen | 500 (`.sh`) |
| `scripts/factory/shared-state-paths.txt` | neu | ~10 Zeilen | — |
| `.github/workflows/arbitration.yml` | neu | ~70 Zeilen | — |
| `tests/spec/merge-arbitration/detect-clustering.bats` | neu | ~90 Zeilen | — |
| `tests/spec/merge-arbitration/detect-threshold.bats` | neu | ~60 Zeilen | — |
| `tests/spec/merge-arbitration/detect-generated-exclusion.bats` | neu | ~70 Zeilen | — |
| `tests/spec/merge-arbitration/apply-escalation.bats` | neu | ~90 Zeilen | — |
| `tests/spec/merge-arbitration/apply-idempotency.bats` | neu | ~70 Zeilen | — |
| `tests/spec/merge-arbitration/synthesize-syntax-gate.bats` | neu | ~60 Zeilen | — |
| `website/src/data/test-inventory.json` | generiert | — | — |

Alle Skript-Dateien sind neu und damit nicht gebaselined; die wirksame Schwelle ist das
statische Extension-Limit. Die Zielgrößen liegen bewusst unter der Hälfte davon, damit
spätere Erweiterungen (weitere Dateityp-Syntaxprüfungen) nicht sofort an S1 stoßen.

## Bewusst nicht angefasst

Der Conflict-Check der Factory, die Factory-Pipeline und das Taskfile bleiben unverändert.
Die ersten beiden liegen in T002418 offen, das Taskfile in zwei weiteren PRs — sie zu
ändern erzeugte genau die Mehrwege-Kollision, die dieses Feature auflöst. Die
S4-Erreichbarkeit der neuen Skripte ist über `.github/workflows/arbitration.yml` gegeben,
ein Taskfile-Einsprung ist dafür nicht nötig.

## Vorbedingung

T002418 (Teil A aus T002413) muss gemergt sein. Dessen A4 persistiert
`scout.touched_files` ins Ticket; ohne dieses Gedächtnis läuft die präventive Stufe leer
und jede Kollision landet ungefiltert beim Arbiter. Das Ticket ist per `blocked_by`
verknüpft — `dev-flow-execute` startet erst nach dem Merge.

## Tasks

### 1. Cluster-Schema einfrieren

Vor jeder Implementierung das JSON-Schema festschreiben, das `detect.sh` ausgibt und
`synthesize.mjs`/`apply.sh` konsumieren. Es ist die Naht zwischen allen drei Komponenten;
wird sie später verschoben, müssen alle drei nachziehen.

Anlegen: `scripts/arbitration/cluster-schema.json` mit einem Objekt pro Cluster:

```json
{
  "cluster_key": "sha256-hex",
  "files": ["website/src/lib/x.ts"],
  "eligible_prs": [
    {"number": 3461, "head_sha": "abc123", "ticket": "T002330", "branch": "chore/…"}
  ],
  "ineligible_prs": [
    {"number": 3472, "reason": "draft"}
  ]
}
```

`ineligible_prs` ist bewusst Teil des Schemas, nicht weggeworfen: die Spec verlangt, dass
ein Draft-PR die Kollision sichtbar macht, ohne als Stimme zu zählen.

### 2. Risiko-Pfadliste anlegen

`scripts/factory/shared-state-paths.txt` mit einem Glob-Präfix pro Zeile: `k3d/`, `prod`,
`environments/`, `flux/`, `Taskfile`. Kopfkommentar hält fest, dass dieselbe Liste derzeit
zusätzlich als `VALUES`-Ausdruck im SQL von `conflict-check.sh` steht und die
Zusammenführung ein Folge-Ticket nach dem T002418-Merge ist — damit der Duplikat-Zustand
nicht später als gewachsene Drift gelesen wird.

### 3. `detect.sh` — Cluster-Erkennung

Liest offene PRs über `gh-axi pr list` (Felder: `number`, `headRefName`, `headRefOid`,
`isDraft`, `labels`, `statusCheckRollup`, `title`), ermittelt je PR
`git diff --name-only origin/main...origin/<head>` und bildet die Datei→PR-Abbildung.

Reihenfolge der Filter, bevor gezählt wird:

1. PRs mit Label `arbitration` fallen raus (Schleifen-Ausschluss).
2. Pfade, die `.gitattributes` mit `merge=ours` markiert, fallen raus. Die Liste wird zur
   Laufzeit aus `.gitattributes` gelesen — eine zweite gepflegte Kopie driftet garantiert.
3. Stimmberechtigt ist ein PR, wenn `isDraft=false` und der Check-Rollup grün ist.

Cluster ab **drei** stimmberechtigten PRs. `cluster_key` ist der sha256 über sortierte
Dateipfade + PR-Nummern + head-SHAs. Cluster unterhalb der Schwelle werden auf stderr
protokolliert, nicht ausgegeben — damit sich später beantworten lässt, ob 3 die richtige
Schwelle ist.

Das Skript schreibt nichts und ruft kein LLM. Es muss allein aufrufbar nützlich sein.

### 4. `synthesize.mjs` — LLM-Synthese

Nimmt einen Cluster auf stdin, holt je PR die Dateiversion
(`git show origin/<head>:<pfad>`) plus die main-Version als gemeinsamen Bezugspunkt, und
baut daraus einen Prompt mit dem Zweck jedes Tickets als Kontext.

Aufruf gegen den llm-proxy auf `127.0.0.1:18235`, Antwort strikt als
`{merged, confidence, rationale, per_pr_notes}` — bei Schema-Abweichung Exit ungleich
null statt Reparaturversuch. Modell ist über eine Env-Variable wählbar, Vorgabe ist das
Factory-Standardmodell.

Rein funktional: JSON rein, JSON raus, kein GitHub-, Ticket- oder Git-Schreibzugriff. So
ist die Komponente ohne Cluster und ohne Netzwerk testbar.

### 5. `apply.sh` — Entscheiden und ausführen

Reihenfolge der Gates, jedes einzeln abbrechend:

1. **Idempotenz** — `cluster_key` bereits in einem offenen `arbitration`-PR oder
   Eskalations-Ticket? Dann Ende ohne Aktion.
2. **Risiko-Pfad** — trifft eine Cluster-Datei ein Präfix aus
   `shared-state-paths.txt`? Dann Eskalation.
3. **Confidence** — `< 0.8`? Dann Eskalation.
4. **Syntax-Gate** — die synthetisierte Version wird nach Dateityp geprüft:
   `node --check` für `.js`/`.mjs`, `bats --count` für `.bats` (**nicht** `bash -n`,
   das an `@test`-Blöcken irreführend scheitert, T002351-M2), `bash -n` für `.sh`,
   `jq empty` für `.json`, `kustomize build` für Kustomize-Verzeichnisse. Rot → Eskalation.

Eskalation heißt: Ticket `type=task` mit dem N-Wege-Briefing (Diffs, Rationale, Grund der
Eskalation, `cluster_key`) plus ein Kommentar an jedem beteiligten PR. Kein Code.

Sonst: Branch `chore/merge-arbitration-<ticket>` aus aktuellem `origin/main`, nur die
Cluster-Dateien, PR mit Label `arbitration` und dem `cluster_key` im Body, Auto-Merge an.
Danach je Quell-PR ein Kommentar mit seiner `per_pr_note`; `gh pr update-branch` nur, wenn
es konfliktfrei durchläuft.

Harte Grenzen im Skript: kein `--force`, kein Push auf fremde Branches, kein Exit ungleich
null bei fehlender LLM-Antwort — der Arbiter darf keinen PR blockieren.

### 6. Workflow

`.github/workflows/arbitration.yml`, `runs-on: [self-hosted, fleet-gpu]` (derselbe Pool wie
`opencode.yml`; der llm-proxy ist an `127.0.0.1` gebunden und von einem GitHub-hosted
Runner nicht erreichbar). Trigger: `pull_request` mit `opened`, `synchronize`,
`ready_for_review` plus `schedule` alle 30 Minuten. `continue-on-error: true` auf allen
Schritten, damit ein Ausfall nie gegen einen PR zählt.

### 7. Tests (RED zuerst)

Sechs BATS-Dateien unter `tests/spec/merge-arbitration/` — eine pro Vorgang, nach der
Verzeichniskonvention aus T002416. Gemeinsames Fixture: ein temporäres Git-Repo mit vier
Branches und ein `gh-axi`-Stub, der eine feste PR-Liste liefert; damit laufen die Tests
offline.

Jeder Negativtest trägt seinen Positiv-Anker im **selben** `@test`-Block (T002356-M1). Bei
`detect-threshold` ist das nicht Formalität, sondern notwendig: fehlt die Cluster-Logik
ganz, ist die Kandidatenliste leer und „kein Cluster bei 2 PRs" gilt trivial.

| Datei | Prüft | Positiv-Anker |
|---|---|---|
| `detect-clustering.bats` | 3er-Cluster erkannt; Draft-PR und `arbitration`-Label ignoriert | Cluster entsteht mit den drei gültigen PRs |
| `detect-threshold.bats` | 2 stimmberechtigte PRs → kein Cluster | derselbe Aufbau mit 3 PRs feuert |
| `detect-generated-exclusion.bats` | `docs/code-quality/repo-index.json` in 3 PRs → kein Cluster | dieselben 3 PRs mit `scripts/agent-lock.sh` → Cluster |
| `apply-escalation.bats` | `k3d/foo.yaml` eskaliert bei Confidence 0.99 | identischer Lauf mit `website/src/lib/x.ts` öffnet den PR |
| `apply-idempotency.bats` | zweiter Lauf ohne Push tut nichts | nach head-SHA-Wechsel wird erneut arbitriert |
| `synthesize-syntax-gate.bats` | kaputtes JS in der LLM-Antwort → Eskalation | valides JS derselben Antwortform → PR |

Zuerst schreiben und rot laufen lassen:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/merge-arbitration/
# expected: FAIL (rot — scripts/arbitration/ existiert noch nicht)
```

Danach Task 3–6 umsetzen, bis derselbe Aufruf grün ist.

### 8. Finale Verifikation

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/merge-arbitration/
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
```

`task test:inventory` ist Pflicht, weil sechs neue Test-Dateien entstehen und CI
`website/src/data/test-inventory.json` gegen den committeten Stand vergleicht.

<!-- vitest: kein neuer Test nötig, weil das Vorhaben keine Dateien unter website/src/ anlegt oder ändert — die Komponenten sind Shell/Node-Skripte und ein Workflow. -->
