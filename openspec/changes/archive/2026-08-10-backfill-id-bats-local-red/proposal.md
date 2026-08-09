# Proposal: backfill-id-bats-local-red

## Why

`tests/spec/ticket-system/backfill-id-sequence.bats` (drei Verhaltenstests, T002732) schlägt in
jedem Checkout mit erreichbarem `k3d-mentolder-dev`-Cluster fehl — reproduziert im sauberen
main-Checkout (`ee4a9a80d`) sowie im Worktree dieses Tickets. `task test:changed` ist damit lokal
rot, obwohl PR #3942 (16/16 Checks) grün war.

**Root Cause (verifiziert, nicht Hypothese):** Die drei Verhaltenstests rufen
`scripts/ticket.sh backfill-id --brand mentolder` auf, ohne vorher `TICKET_TEST_DB_OK=1` zu
exportieren. `scripts/vda/ticket/_ticket-core.sh:30` enthält einen fail-closed BATS-Guard
(T002224): läuft der Prozess unter BATS und ist `TICKET_TEST_DB_OK != 1`, wird `CTX`
zwangsweise auf den nicht auflösbaren Sentinel `bats-no-cluster-t002224` umgebogen — unabhängig
vom `--context`-Flag des Aufrufers. Beleg (`bats --verbose-run`):

```
not ok 2 T002732: backfill-id assigns an external_id to a row that lacks one
# ERROR: no shared-db pod found in namespace workspace (context bats-no-cluster-t002224)
```

Die Schwesterdatei `tests/spec/ticket-system/list-test-data-filter.bats` macht es korrekt vor:
sie setzt `export TICKET_TEST_DB_OK=1`, bevor sie denselben Skriptpfad real gegen den Cluster
testet. Der backfill-id-Test vergisst genau diese eine Zeile.

**Warum lokal rot, aber PR #3942 grün — die eigentliche Divergenz:** Nicht Umgebungsabhängigkeit
im Sinne von "CI hätte anders geprüft und wäre auch rot geworden", sondern: **CI hat diese drei
Tests noch nie tatsächlich als `ok`/`not ok` ausgeführt.**

- PR #3873 (`19e792cdb`) ist der einzige Commit, der die Datei berührt. GitHub Actions hat dort
  keinen erreichbaren k3d-Cluster; der dateieigene Skip-Guard `cluster_running()`
  (`kubectl --context k3d-mentolder-dev get nodes`) schlägt fehl → alle drei Tests werden mit
  `# skip` übersprungen, nicht ausgeführt.
- Bei jedem anderen PR (verifiziert an #3942 per `gh run view <id> --log --job <shard-id>`) läuft
  `task test:spec:changed`, das über `scripts/find-changed-tests.sh spec` **diff-scoped** nur
  Dateien auswählt, die der jeweilige PR verändert. Rührt ein PR `backfill-id-sequence.bats`
  nicht an, taucht sie in `$CHANGED_FILES` gar nicht auf — die Datei wird nicht einmal
  selektiert, geschweige denn ausgeführt oder geskippt.

Lokal existiert dagegen ein echter erreichbarer `k3d-mentolder-dev`-Cluster (im Gegensatz zu
GH Actions) — der Skip-Guard greift also nicht, und der Test läuft tatsächlich, sabotiert sich
aber selbst über den vergessenen `TICKET_TEST_DB_OK`-Opt-in.

**Scope-Entscheidung (Ergebnis Brainstorming):** Die CI-Bindungslücke selbst — dass
cluster-abhängige `tests/spec/*.bats`-Dateien in GitHub Actions strukturell nie grün verifiziert
werden — ist ein größeres, potenziell repo-weites Thema (verwandtes Muster: T002723,
`e2-local-stack.bats`, wo ein Skip-Guard auf Kontextnamen statt Erreichbarkeit prüft). Das
gehört **nicht** in dieses `fix/minor`-Ticket. Sie wurde als eigenes Ticket **T002922**
ausgegliedert (`relates_to` T002871 verlinkt) und dort mit vollem Befund dokumentiert.

## What

Ergänze `setup()` in `tests/spec/ticket-system/backfill-id-sequence.bats` um
`export TICKET_TEST_DB_OK=1` — analog zu `list-test-data-filter.bats` — damit die drei
Verhaltenstests bei erreichbarem Cluster tatsächlich gegen die echte DB laufen, statt sich über
den T002224-Guard selbst zu blockieren. Kein Code außerhalb der Testdatei ändert sich; der
Fix-Ansatz ist reine Testkorrektur (Level-2-Fix), keine Verhaltensänderung von
`scripts/ticket.sh backfill-id` selbst.

Nachweis: RED (aktueller Stand, 3 `not ok`) → GREEN (nach der Ergänzung, 3 `ok`) via
`tests/unit/lib/bats-core/bin/bats -r tests/spec/ticket-system.bats tests/spec/ticket-system/`
(erfasst beide BATS-Konventionsformen, T002696).

_Ticket: T002871_
