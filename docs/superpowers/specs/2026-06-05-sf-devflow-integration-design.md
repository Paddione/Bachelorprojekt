# Design-Spec: dev-flow ↔ Software Factory Integration

- **Datum:** 2026-06-05
- **Branch:** `feature/sf-devflow-integration`
- **Vorhaben-Ticket:** T000413 (Software Factory)
- **Status:** Entwurf zur Review

---

## 1. Kontext & Problem

Im Repo existieren **zwei parallele Implementierungen desselben Feature-Lebenszyklus**:

- **dev-flow** — vier mensch-im-Loop-Skills (`.claude/skills/dev-flow-{plan,execute,iterate,e2e}`): Pfad-Wahl → Worktree → Brainstorm → Spec → Plan → Ticket → (Failing-Test bei Fixes) → Implement → Code-Review-Gate → PR → Squash-Merge → Archive-Plan → Deploy → E2E.
- **Software Factory** — ein autonomer Workflow-Tool-Pipeline (`scripts/factory/pipeline.js`: Scout→Design→Plan→Implement→Verify→Deploy) plus der gemergte Phase-2-Dispatcher (`scripts/factory/dispatcher.js` + `queue/slots/schedule/watchdog/metrics.sh`).

Die beiden teilen sich **nur** Artefakt-Verzeichnisse (`docs/superpowers/{specs,plans}`) und wenige Glue-Skripte (`ticket.sh`, `plan-frontmatter-hook.sh`, `conflict-check.sh`). Die Factory ruft **keinen einzigen** dev-flow-/superpowers-Skill auf — sie re-formuliert jede Stufe als Inline-Agent-Prompt, weil Skills interaktiv sind und der Workflow-Harness die `Skill`-Tool nicht aufrufen kann.

Daraus folgen drei Klassen von Problemen:

1. **Die Factory läuft nicht** (siehe §2, empirisch belegt). P1+P2 sind nach `main` gemergt, aber `pipeline.js`/`dispatcher.js` wurden **nie ausgeführt** — nur `node --check` + grep-Contract-Tests. Diese sind grün, obwohl die Skripte als Workflow ein No-op sind.
2. **Entry-Point entkoppelt.** `dev-flow-plan` erzeugt Tickets als `type='task' / status='triage'`. Die Factory-Queue (`queue.sh:17`) pollt ausschließlich `type='feature' AND status='backlog'`. → Was ein Mensch plant, landet **nie** in der Factory-Queue; die Factory erzeugt selbst keine Tickets. Die Systeme teilen eine Tabelle, aber keinen Zeilen-Lebenszyklus.
3. **Konkrete Bugs & Drift** in der Naht (siehe §6, Phase D4).

### Scope dieser Spec

Stoßrichtung (mit dem User festgelegt): **D → A — erst beweisen, dann verbinden.** Phase D macht die Factory nachweislich lauffähig und gefahrlos probebar; Phase A verbindet den dev-flow mit der Factory-Queue. Konkrete Bugs (E) werden in Phase D eingefaltet. Eine Spec, ein Plan, sequenziert D vor A.

---

## 2. Verifizierter Befund: die Factory ist ein No-op (Root Cause)

Sowohl `pipeline.js` als auch `dispatcher.js` kapseln ihren gesamten Body in einen **fire-and-forget-IIFE**:

```js
export const meta = { ... }
;(async () => {
  phase('Scout')
  const scout = await agent(...)
  ...
  return { status: 'done', ... }   // ← dieser return verlässt nur die Arrow-Funktion
})()
```

Der Workflow-Harness führt den **Skript-Body** aus und betrachtet den Workflow als fertig, sobald die Top-Level-Statements durch sind. Ein nicht-awaiteter IIFE-Body endet *synchron* — er plant die async-Arbeit ein und gibt ein nicht-awaitetes Promise zurück. Konsequenz: **kein einziger `agent()`/`phase()`/`workflow()`-Aufruf wird tatsächlich ausgeführt, und der `return`-Wert geht verloren.**

### Empirischer Beweis (zwei Probe-Workflows, throwaway, nur `/tmp`)

Ein Parent-Workflow nestet via `workflow({scriptPath}, args)` (identisch zu `dispatcher.js:85`) ein triviales Kind, einmal in **IIFE-Form** und einmal in **kanonischer Form** (Top-Level-`await`, kein Wrapper):

| Messung | IIFE-Form (wie gemergt) | Kanonische Form |
|---|---|---|
| `workflow()`-Rückgabe | `undefined` | `{childStatus:'done', echoedArg, agentText:'PONG'}` |
| Kind-Agent läuft? | **Nein** — 0 Tokens, 22 ms | **Ja** — 29 392 Tokens, 1 499 ms, echtes „PONG" |
| `return` propagiert? | **Nein** | **Ja** |
| `workflow()`-Nesting selbst | wirft nicht (`nestingWorks:true`) | wirft nicht |

→ **`dispatcher.js` würde `pipeline.js` als 0-Sekunden-No-op nesten.** Die gesamte Model-A-Architektur ist, so wie auf `main`, nicht funktional. Die `node --check`+grep-Tests fangen das nicht, weil der IIFE syntaktisch valide ist.

**Fix (verifiziert):** IIFE auspacken → Body auf Top-Level mit `await`/`return`. Das ist die in der Tabelle nachweislich funktionierende Form. Dies ist der Dreh- und Angelpunkt von Phase D.

---

## 3. Ziele / Non-Goals

### Ziele
- **G1** Die Factory (`pipeline.js` standalone **und** via `dispatcher.js`-Nesting) führt nachweislich ihre Stufen aus.
- **G2** Ein **Dry-Run-Modus** erlaubt vollständige Scout→Verify-Läufe ohne jegliches Prod-Risiko (kein Merge, kein Deploy).
- **G3** Eine Regression dieser No-op-Klasse kann **nie wieder still** durch CI rutschen.
- **G4** Ein Mensch kann ein via dev-flow geplantes Ticket an die Factory **übergeben**; die Factory **verwendet den vorhandenen Plan wieder** statt neu zu planen.
- **G5** Beide Seiten sehen die in-flight-Arbeit der jeweils anderen für die Conflict-Gate (geteilte Registry-Dateien).
- **G6** Die drei konkreten Bugs (E) sind behoben.

### Non-Goals (Out of Scope / P3)
- Layer-4-Canary-Smoke + Auto-Rollback (bereits P3).
- Semantische Dedup / `embedTicket`-Backfill (GPU-abhängig, bereits P3).
- Daemon/Cron/Webhook-Trigger für den Dispatcher (P3 — bleibt `/loop`-session-bound).
- Vollständige Extraktion *aller* dev-flow-Schritte in eine geteilte Quelle der Wahrheit (Theme B) — bewusst zurückgestellt; diese Spec reduziert Drift nur punktuell (Plan-Reuse, geteilte `conflict-check.sh`), refaktoriert aber nicht die Review-/Deploy-Prompts.
- Echter Prod-Deploy-Lauf der Factory — erst nach erfolgreichem Dry-Run, als separate, bewusste Entscheidung.

---

## 4. Phase D — Beweisen, dass die Factory läuft

### D1 — IIFE-Fix (Kernsache)
`scripts/factory/pipeline.js` und `scripts/factory/dispatcher.js`: den `;(async () => { … })()`-Wrapper entfernen; der Body läuft auf Top-Level mit direktem `await` und Top-Level-`return` (kanonische Workflow-Form). `args` und die injizierten Globals (`agent/parallel/pipeline/phase/log/workflow`) bleiben Top-Level-Globals. Die `meta`-Export-Konstante bleibt unverändert oben.

### D2 — Regressions-Schutz
- **(a) Struktureller CI-Guard (BATS, FA-SF):** ein Test, der für alle Factory-Workflow-Skripte (`pipeline.js`, `dispatcher.js`) den fire-and-forget-Wrapper `;(async` / `(async () =>` als Body-Hülle **verbietet** und ein Top-Level-`await agent(`/`await workflow(` **verlangt**. Billig, läuft im bestehenden offline-Testpfad.
- **(b) Ausführungs-Smoke (lokal, via Workflow-Tool):** ein dokumentiertes Selbsttest-Rezept (der Nesting-Probe aus §2, produktiv): ein Parent nestet ein triviales Kind und assertet Return-Propagation (`childStatus==='done'`). Dies ist der echte End-to-End-Beweis, der in CI nicht möglich ist (kein Workflow-Harness in BATS) — er gehört zu D5 und wird als wiederholbares lokales Gate beschrieben.

### D3 — Dry-Run-Modus (`FACTORY_DRY_RUN=1`)
`pipeline.js` liest ein Dry-Run-Flag (Env-Var, vom dispatcher/`task`-Aufruf durchgereicht, Default **aus**). Verhalten im Dry-Run, **Deploy-Phase**:
- **Kein** `git push`, **kein** `gh pr merge`, **kein** `task workspace:deploy`.
- Optional: nur einen **Draft-PR** öffnen (nie mergen).
- Stattdessen **reporten**: geplanter Diff (`git diff origin/main...HEAD`) + Review-Findings + Zusammenfassung.
- **Kein** Ticket-Close / Archive.
- Den **Slot freigeben** (`ticket.sh release-slot`) und das Ticket auf `backlog` zurücksetzen — nichts wurde geshipped, also bleibt das Ticket schedulebar.

### D4 — Konkrete Bugs (E)
- **E1** `scripts/ticket-attach.sh:19`: Default-Context `mentolder` (laut CLAUDE.md TOT) → `fleet`, konsistent mit `ticket.sh:18`. Betrifft beide Pfade (dev-flow-plan Asset-Attach **und** Factory-Design-Phase).
- **E2** `scripts/factory/pipeline.js:114`: toter Fallback auf nicht existierendes `ticket.sh update --touched-files` entfernen (nur `set-touched-files` existiert) — sonst verbrennt der Agent garantiert einen Turn auf einem `Unknown command`-Fehler.
- **E3** `scripts/factory/README.md`: Phase 2 (Dispatcher) wird noch als „geplant" beschrieben (ist gemergt, #1330); Raw-SQL-Quickstart (`psql UPDATE … touched_files`) durch `ticket.sh set-touched-files` ersetzen (CLAUDE.md-Gotcha gegen Raw-SQL).

### D5 — Dry-Run end-to-end (der Beweis)
1. **`pipeline.js` standalone** im Dry-Run gegen ein triviales Fixture-/Test-Ticket (`--is-test-data`) ausführen → auftauchende Runtime-Bugs fixen.
2. **Dispatcher → genestete `pipeline.js`** im Dry-Run einmal ausführen (Model-A-Pfad) → Nesting + Slot-Claim + Watchdog verifizieren.
3. Beobachtungen + verbleibende Runtime-Fixes dokumentieren. Dies validiert G1/G2.

---

## 5. Phase A — Entry-Point verbinden

### A1 — Handoff: Enqueue-Primitive + Skill-Angebot + Plan-Reuse
**Mechanik:**
- **Neues Primitive** `scripts/ticket.sh enqueue --id T### --branch feature/<slug> --plan <plan-path>`: flippt das Ticket auf `type=feature`, `status=backlog` und hinterlegt eine **Plan-Referenz** (Source-Branch + Plan-Pfad), die `pipeline.js` später liest. *(DDL-frei: bevorzugt ein parsebarer strukturierter Ticket-Kommentar `FACTORY-PLAN-REF branch=… plan=…`; Alternative: ein vorab-`ticket_plans`-Eintrag. Die exakte Speicherform ist die zentrale Implementierungs-Entscheidung dieses Tasks — siehe §8.)*
- **`task factory:enqueue -- T###`** als bequemer Wrapper.
- **`dev-flow-plan` SKILL.md, Schritt 5 (STOP-Punkt):** eine dritte Wahl „an Factory übergeben" anbieten, die `ticket.sh enqueue` mit dem gerade erzeugten Branch + Plan aufruft. Default bleibt der heutige Hinweis „rufe `dev-flow-execute` auf".

**Zwei Eingänge in `pipeline.js`:**
- **(1) self-planning** (heute): Ticket ohne Plan-Referenz → volle Scout→Design→Plan-Pipeline (factory-originierte Backlog-Features). Unverändert.
- **(2) plan-reuse** (neu): Ticket **mit** Plan-Referenz → Scout/Design/Plan **überspringen**; im Worktree auf dem **vorhandenen Menschen-Branch** `feature/<slug>` arbeiten; den Menschen-Plan laden und direkt in **Implement** starten (im Geist von `dev-flow-execute` Schritt 2), dann Verify → Deploy (Dry-Run). Der Menschen-Plan ist die Task-Quelle; die disjunkte-Dateien-Annahme der Implement-Phase wird gegen die Plan-Tasks geprüft.

`schedule.sh` / `queue.sh` / der Dispatcher reichen die Plan-Referenz an die genestete `pipeline.js` als child-arg durch (`has_plan`, `branch`, `plan_path`).

### A2 — Beidseitige Conflict-Sichtbarkeit
- `dev-flow-plan` / `dev-flow-execute`: beim Anlegen/Start eines Features `touched_files` aufs Ticket schreiben (`ticket.sh set-touched-files`), ableitbar aus dem Plan.
- `scripts/factory/conflict-check.sh`: Filter erweitern, sodass **jedes** in-flight-Ticket (`type IN ('feature','task')`) mit nicht-leeren `touched_files` als Konflikt-Kandidat zählt — nicht nur `type='feature'`. Damit erkennen beide Seiten Kollisionen auf den bekannten geteilten Registry-Dateien (`k3d/configmap-domains.yaml`, `environments/schema.yaml`), die heute beidseitig blind sind.

### A3 — Telemetrie-Rückschreibung
- `pipeline.js`: PR-Nummer **bei PR-Erstellung** aufs Ticket schreiben (heute erst beim Archivieren), z.B. via `ticket.sh add-comment` / einem PR-Feld.
- Pro Phasen-Grenze einen knappen Status-Kommentar („Phase=Verify; Reviews: 0 blocking") schreiben, sodass ein Mensch, der ein halbfertiges Factory-Ticket übernimmt, eine Spur hat (heute nur `updated_at` + ein einzelner freiform-Kommentar).

---

## 6. Komponenten & Schnittstellen (berührte Dateien)

| Datei | Phase | Änderung |
|---|---|---|
| `scripts/factory/pipeline.js` | D1,D3,E2,A1,A3 | IIFE auspacken; Dry-Run-Zweig in Deploy; toten `update`-Fallback raus; plan-reuse-Eingang; PR#/Phasen-Telemetrie |
| `scripts/factory/dispatcher.js` | D1,A1 | IIFE auspacken; Plan-Referenz an child-args durchreichen |
| `scripts/ticket-attach.sh` | E1 | Default-CTX `mentolder`→`fleet` |
| `scripts/factory/README.md` | E3 | P2-Status; Raw-SQL→`ticket.sh` |
| `scripts/ticket.sh` | A1 | neues `enqueue`-Subcommand |
| `scripts/factory/conflict-check.sh` | A2 | Filter auf `type IN ('feature','task')` mit touched_files |
| `scripts/factory/schedule.sh` / `queue.sh` | A1 | Plan-Referenz durchreichen |
| `.claude/skills/dev-flow-plan/SKILL.md` | A1 | „an Factory übergeben"-Wahl am STOP-Punkt |
| `.claude/skills/dev-flow-execute/SKILL.md` | A2 | `touched_files` aufs Ticket schreiben |
| `Taskfile.factory.yml` | A1,D3 | `factory:enqueue`; Dry-Run-Durchreichung |
| `tests/` + `website/src/data/test-inventory.json` | D2 | struktureller Guard FA-SF-31; Inventory-Regen |

**Verträge:**
- Dry-Run-Flag: `FACTORY_DRY_RUN` (Env), Default leer/aus. Vom `task`- und Dispatcher-Aufruf durchgereicht.
- `pipeline.js`-Args erweitert um optional `has_plan` / `branch` / `plan_path`.
- `ticket.sh enqueue` ist additiv und rückwärtskompatibel; alle anderen `ticket.sh`-Caller unberührt.
- Keine DDL-Änderung (Schema-Eigentum bleibt bei `website/src/lib/tickets-db.ts`).

---

## 7. Testing

- **D2(a)** Struktureller BATS-Guard `FA-SF-31`: verbietet IIFE-Body-Hülle, verlangt Top-Level-`await` in den Factory-Workflow-Skripten. In `test-inventory.json` registrieren (CI-diff-gated).
- **D2(b)** Lokaler Nesting-Ausführungs-Smoke (via Workflow-Tool) — als wiederholbares Rezept dokumentiert; Teil von D5.
- **A1** `ticket.sh enqueue`: offline-Contract-Test (Arg-Parsing, idempotenter Flip, Plan-Ref-Schreibung) im Muster der bestehenden FA-SF-Tests; live-seed-Test mit `--is-test-data`-Fixture, danach gepurged.
- **A2** `conflict-check.sh`-Test: ein `type='task'`-Ticket mit überlappenden `touched_files` muss jetzt als Konflikt erkannt werden (rc1).
- Bestehende `node --check` + grep-Contracts (`FA-SF-20`, `FA-SF-30`) bleiben; D2(a) ergänzt das, was sie nachweislich verfehlen.

---

## 8. Risiken & Offene Implementierungs-Punkte

- **R1 (höchste): Plan-Referenz-Speicherung ohne DDL.** Branch + Plan-Pfad müssen vom `enqueue`-Zeitpunkt bis zum Dispatcher-Pickup überleben, und der Plan liegt auf dem Feature-Branch (nicht auf `main`). Bevorzugt: parsebarer strukturierter Ticket-Kommentar `FACTORY-PLAN-REF`; fragil, aber DDL-frei. In Task 0 final entscheiden.
- **R2: Plan-Reuse-Branch-Handling.** Die Factory arbeitet auf dem Menschen-Branch `feature/<slug>` statt einem frischen `sf-<id>`-Branch — Worktree-Pfad, Branch-Guard und Cleanup müssen das berücksichtigen.
- **R3: Weitere Runtime-Bugs nach dem IIFE-Fix.** D5 ist die erste echte Ausführung; weitere `pipeline.js`-Laufzeitfehler sind zu erwarten und werden dort gefixt (kein separater Task im Voraus planbar).
- **R4: Dual-Brand-Schema-Parität** (Factory-Objekte `pipeline_slot`, `v_active_features`, `fn_lifecycle_ts`, `fn_purge_test_data`) muss auf beiden Brands live sein — vor D5 verifizieren (idempotenter website-boot-init).
- **R5: Dry-Run-Vollständigkeit.** Der Dry-Run lässt die echte Deploy-Phase ungetestet — bewusst (Non-Goal). Erst nach grünem Dry-Run als separate Entscheidung scharf schalten.

---

## 9. Reihenfolge / Meilensteine (für writing-plans)

1. **M-D1** IIFE-Fix beider Skripte + struktureller Guard (D1, D2a). *Unblocked sofort, höchster Wert.*
2. **M-D2** Dry-Run-Modus + Bugs E (D3, D4).
3. **M-D3** Dry-Run end-to-end Proof + Runtime-Fixes (D5, D2b).
4. **M-A1** Enqueue-Primitive + Plan-Reuse-Eingang + Skill-Angebot (A1).
5. **M-A2** Conflict-Sichtbarkeit + Telemetrie (A2, A3).

D ist eigenständig wertvoll (No-op → lauffähig) und kann unabhängig von A geshipped werden.
