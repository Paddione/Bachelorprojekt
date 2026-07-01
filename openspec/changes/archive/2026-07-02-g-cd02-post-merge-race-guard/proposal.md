# Proposal: g-cd02-post-merge-race-guard

## Why

Der `post-merge.yml`-Workflow läuft bei jedem Push auf `main` und besteht aus zwei Jobs:
`mark-awaiting` (Ticket → `awaiting_deploy` via `scripts/ticket.sh update-status`) und
`deploy-manifests` (deployt geänderte Manifeste zu beiden Brands via `task workspace:deploy`,
setzt Ticket → `done`, ruft `scout-drift`). Der Trigger ist `on: push: branches: [main]` —
**ohne `concurrency`-Guard**.

Folge: Bei schnell aufeinanderfolgenden Merges (Auto-Merge-Welle, Batch-Closes) starten **zwei
oder mehr `post-merge`-Runs gleichzeitig**. Beide rufen parallel `task workspace:deploy ENV=mentolder`
und `ENV=korczewski` gegen denselben Fleet-Cluster → konkurrierende `kubectl apply --server-side`-Operationen
am selben Namespace. Das erzeugt sporadische `Operation cannot be fulfilled … the object has been modified`-
und ServerSideApply-Konflikt-Fehler. Zusätzlich sind die zwei `scripts/ticket.sh update-status`-Aufrufe
nur mit `|| echo WARNING (non-fatal)` abgesichert: ein einzelner transienter API-/Netz-Timeout lässt
den Status-Übergang still ausfallen, ohne Retry.

**Impact:** Die G-CD02-Erfolgsquote liegt bei **93 %** (gemessen über die letzten Post-Merge-Runs auf
`/admin/dora`). ~7 % der Runs brechen in der Deploy-Phase ab oder hinterlassen ein Ticket im falschen
Status. Ziel des DORA-Delivery-Ratchets: **≥ 95 %**.

## What

Dreiteiliger, low-risk Fix — nur `.github/workflows/post-merge.yml` (plus ein neuer BATS-Guard):

1. **Concurrency-Group (Kern-Fix):** Top-level `concurrency:`-Block mit statischer Group
   (`post-merge-${{ github.ref }}`, effektiv `refs/heads/main`) und **`cancel-in-progress: false`**.
   Damit serialisiert GitHub Actions alle Post-Merge-Runs: ein laufender Deploy läuft zu Ende,
   bevor der nächste startet → keine konkurrierenden `kubectl apply` mehr. `cancel-in-progress: false`
   (nicht `true`) ist bewusst gewählt: ein laufender Deploy darf **nie** mitten im Apply abgebrochen
   werden — das wäre schlimmer als die Race-Condition. Neue Runs warten in der Queue.

2. **Retry mit Exponential-Backoff für Status-Updates:** Eine kleine inline-`retry()`-bash-Funktion
   wrappt beide `scripts/ticket.sh update-status`-Aufrufe (`mark-awaiting` + `mark-done`). 5 Versuche,
   Start-Delay 2 s, Verdopplung pro Versuch (2/4/8/16 s). Die Funktion bleibt **non-fatal** (return 0
   nach Erschöpfung — exakt das bisherige `|| echo WARNING`-Verhalten), fängt aber transiente
   API-Timeouts ab, statt beim ersten Fehlschlag aufzugeben.

3. **Drift-Guard (BATS):** Neuer `tests/spec/ci-cd.bats` verifiziert statisch, dass `post-merge.yml`
   (a) eine `concurrency:`-Group deklariert, (b) `cancel-in-progress: false` setzt, (c) beide
   Status-Updates durch `retry` laufen. Cluster-frei (reines `grep` gegen die Workflow-Datei) →
   läuft in PR-CI via `task test:changed`. Verhindert, dass der Guard versehentlich wieder entfernt wird.

**Out of scope:** (a) Refactoring der duplizierten kubeconfig-Setup-Schritte in einen Composite-Action
(orthogonal, eigenes Ticket); (b) Änderung der Ticket-Lifecycle-Semantik (Merge = Abschluss bleibt
Quelle der Wahrheit, post-merge-Status-Updates sind belt-and-suspenders); (c) Retry um `task workspace:deploy`
selbst (durch Serialisierung adressiert — der Deploy ist idempotent via server-side apply).

## Tests

- **Failing test (rot → grün):** `tests/spec/ci-cd.bats` — drei Checks gegen `post-merge.yml`.
  Initial **rot**, weil der Workflow noch keine `concurrency`-Group und kein `retry` hat. Nach Task 1+2 grün.
- **No regression:** Der Guard ist additiv und cluster-frei; er beeinflusst keine bestehenden Tests.
- **CI-Integration:** `task test:changed` führt `tests/spec/ci-cd.bats` aus (BATS-Konvention: ein
  Spec-File pro OpenSpec-SSOT-Spec `openspec/specs/ci-cd.md`).

## Akzeptanzkriterien

- [ ] `tests/spec/ci-cd.bats` ist grün (3/3) nach Task 1+2.
- [ ] `post-merge.yml` hat einen top-level `concurrency:`-Block mit `cancel-in-progress: false`.
- [ ] Beide `scripts/ticket.sh update-status`-Aufrufe laufen durch `retry` (Exponential-Backoff).
- [ ] `task test:changed` + `task freshness:regenerate` + `task freshness:check` grün.
- [ ] `bash scripts/openspec.sh validate` ohne Errors.
- [ ] PR-Titel: `fix(cd): serialize post-merge runs + retry ticket status updates [T001203]`.

## Risk

- **Gering.** Reine Workflow-Änderung + additiver Test. Kein Manifest-, Secret- oder Code-Change.
- **Bekannte Concurrency-Semantik:** Bei `cancel-in-progress: false` hält GitHub pro Group **genau einen**
  pending Run; bei einer Welle von ≥ 3 schnellen Merges wird ein zwischenliegender *pending* Run verworfen
  (der jeweils neueste pending überschreibt den vorherigen pending), während der *laufende* unangetastet
  bleibt. Heißt: der **letzte** Merge der Welle deployt garantiert, ein zwischenliegender Deploy kann
  übersprungen werden. Für `task workspace:deploy` ist das unkritisch (idempotent, der finale Stand wird
  appliziert). Für Ticket-Status ist es unkritisch, weil **Merge = Abschluss** (CLAUDE.md / T001092) das
  Ticket bereits beim Merge schließt — der post-merge-`done`-Übergang ist redundante Absicherung. Diese
  Trade-offs sind im Plan unter "Risk & Concurrency-Semantik" dokumentiert.
- **Rollback:** Revert des einen Workflow-Commits stellt das alte Verhalten wieder her; der BATS-Guard
  ist additiv und schadet bei Revert nicht (er würde dann rot, was den Revert sichtbar macht).

## Sub-spec / Cross-cutting

- `openspec/specs/ci-cd.md` — Requirement "Post-Merge Ticket-Lifecycle und Manifest-Deploy" wird um
  ein Concurrency-/Retry-Szenario ergänzt (Spec-Delta unter `specs/`).
- `openspec/changes/dora-delivery-pipeline` — G-CD02 ist dort als Goal erfasst; nach Fix sichtbare
  Erholung der Erfolgsquote auf `/admin/dora`.

_Ticket: T001203_
