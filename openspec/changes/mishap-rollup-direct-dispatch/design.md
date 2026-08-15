# Design: mishap-rollup-direct-dispatch

Ergebnis der Analyse nach dem Vorfall vom 2026-08-15 (Rollup-Pipeline ~1h blockiert,
danach manueller PR + Freshness-Follow-up pro Zyklus). Entscheidungen:

## 1. Dispatch: Staged-Lane statt PR-Merge (Teil-Rücknahme von T004898)

Der Generator erzeugt den Plan unverändert (Zyklus-Branch, Blockquote-Einbettung,
plan-lint-Gate, commit+push via `rollup-publish.sh`). Der Unterschied: Statt den
Container zu schließen, staged der Generator den Plan auf den Container:

```
ticket.sh stage-plan --id "$CONTAINER_ID" --branch "$BRANCH" \
  --plan "$CHANGE_DIR/tasks.md" --no-hold
```

Der Container (`type=chore`) ist in der Staged-Lane dispatchbar — `queue.sh` nimmt
`type NOT IN ('project','incident') AND status='plan_staged' AND
execution_released=true`. `--no-hold` setzt `execution_released=true` (Default).

Der Executor arbeitet die Mishap-Fixes als normalen Lauf ab: Implementierung,
Feature/Fix-PR, Auto-Merge, Post-Merge-Finalizer archiviert den Change
(`openspec/changes/archive/…`) und schließt das Ticket (Merge=Closure,
`resolution=fixed`). Der Finalizer regeneriert dabei die Status-Map — die
Freshness-Gap des Generator-Wegs entfällt ersatzlos. Der manuelle PR-Schritt entfällt
ebenfalls: Die Factory behandelt das Ticket wie jedes andere gestagte Ticket.

## 2. Container-Lifecycle: Collect-Mode statt Generator-Closure

Der Container bleibt über die Ausführung hinweg offen und ist zugleich Sammler UND
Dispatch-Ticket. Der Suchfilter in `ticket.sh rollup-container` muss deshalb
**dispatchte Container ausschließen**, sonst hängen neue Flushes an einen bereits
laufenden Executor-Lauf:

- **Collect-Mode:** `status IN ('triage','backlog','planning')` — hier darf der
  Flusher anhängen.
- **`blocked` nur ohne FACTORY-PLAN-REF:** Ein vor dem Staging blockierter Container
  (Anomalie-Fall) bleibt auffindbar; ein mitten in der Ausführung blockierter
  Container trägt den FACTORY-PLAN-REF-Kommentar und wird nicht erneut gefunden.
- **`plan_staged`/`in_progress`/`qa_review`/`awaiting_deploy`:** nie im Suchergebnis —
  der Container ist dispatcht.

Invariante: höchstens **ein** Collect-Mode-Container pro Brand.

## 3. Was unverändert bleibt

- **Batching:** Buffer-Datei, 10er-Schwelle, 7-Tage-Alters-Flush via Factory-Tick.
- **Sofort-Dispatch-Ablehnung:** Die Gründe (serielle Lane, DoR-Gap, Race mit dem
  auslösenden Lauf) sind in der Proposal dokumentiert.
- **Generator-Kern:** Slug/Branch pro Zyklus, Wegwerf-Worktree mit trap-cleanup,
  plan-lint als Hard Gate, Blockquote-Einbettung (T007000), Lock-Release aus dem
  Repo-Root (T007000).
- **Incident-Pfad:** `incident`/`broken`/`security` erzeugen weiterhin sofort Tickets.

## 4. Risiken und offene Fragen

- **Executor-Fähigkeit:** Der Plan enthält die Mishap-Beschreibungen als Blockquotes;
  der Executor muss daraus konkrete Fixes ableiten. Das ist derselbe Anspruch wie bei
  `auto-chore-plan`-Plänen — akzeptiert.
- **Mehrere Zyklen parallel:** Ein dispatchter Container blockiert die Lane nicht —
  neue Batches landen in einem frischen Container und warten auf den nächsten Tick.
  Serielle Abarbeitung durch die Lane ist gewollt.
- **Archivierung:** Der Finalizer archiviert pro Change; der Rollup-Change hat
  `.ticket = Container-ID`. Merge=Closure schließt den Container erst NACH dem
  Archiv-Schritt im Finalizer (Reihenfolge wie bei dev-flow-execute üblich).
- **DoR-Abhängigkeit:** `stage-plan` verlangt einen validierten Plan — plan-lint läuft
  bereits im Generator davor (Hard Gate, unverändert).
