---
title: "mishap-incident-rollup-2026-08-15-T006841 — Implementation Plan"
ticket_id: T006841
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-15-T006841 — Implementation Plan

_Container-Ticket: T006841_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-15 05:16 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

### Mishap-Rollup — 10 Eintraege (2026-08-15 05:13 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | drift | openspec | T006368: OpenSpec-Change spec-junit-shard-ignore nie archiviert — einzige Kopie im Hauptcheckout verschwunden |
| 2 | drift | tests/spec/agent-skills | T006348: Plan-Guard-Datei passt nicht zum gemergten Fix — 2/8 Assertions rot |
| 3 | process | scripts/plan-intel.sh | plan-intel s1_limit:0 doppeldeutig (Budget 0 vs. ungated) — Fehlalarm bei .jsonc |
| 4 | degraded | scripts/finetune | eval_harness.ModelBackend ohne CUDA-Transfer — lokaler Adapter-Eval unbrauchbar |
| 5 | suspicious | scripts/finetune | fla von PyPI nicht installierbar (Seite 200, API 404) |
| 6 | degraded | llama.cpp | llama-server --hf lädt keine Repos ohne GGUF |
| 7 | degraded | scripts/finetune/export_gguf.py | export_gguf.py: unsloth schreibt nach outputs/export_gguf/ — Meldung nennt falschen Pfad |
| 8 | degraded | unsloth | unsloth-Direkt-Save verwirft MTP-Köpfe — Base-GGUF-Export doppelt gebrochen |
| 9 | drift | gpu-lock | GPU-Lock während laufendem Export verloren (Parallel-Session?) |
| 10 | suspicious | scripts/devflow-post-merge-finalize.sh | post-merge-finalize Schritt 10 meldete Branch bereits entfernt — Restbranch existierte noch |

**1. T006368: OpenSpec-Change spec-junit-shard-ignore nie archiviert — einzige Kopie im Hauptcheckout verschwunden** (drift, openspec)

Verifiziert: (1) openspec/changes/archive/ enthält auf origin/main und HEAD keinen junit-Eintrag; (2) git grep -l "junit-shard" origin/main -- openspec/specs/ → kein Treffer, das Delta erreichte nie die SSOT (dev-flow-plan.md); (3) find über den Repo-Pfad findet keine Kopie des Change-Verzeichnisses mehr. Verlauf: T006368 wurde per PR #4570 (03:41 UTC) und #4563 (03:43 UTC) gemergt und auf done/shipped gesetzt; der Post-Merge-Archivschritt lief nie (kein Archiv-PR, kein Archiv-Commit). Das Change-Verzeichnis (proposal.md, tasks.md, specs-Delta) lag als untracked im Hauptcheckout und wurde während der Factory-Tick-Aktivität (04:00–04:05 UTC, Tick switchte den Hauptcheckout auf chore/complete-guard-warn-archive-T006031) entfernt, ohne archiviert zu werden. Der eigentliche Fix ist shipped (.gitignore-Zeile via #4563, BATS-Test via #4570 — beide in origin/main); verloren ist nur das SSOT-Delta (Anforderung "spec-junit-shard-* SHALL be ignored" für dev-flow-plan.md). Rekonstruierbar aus den beiden PRs.
**2. T006348: Plan-Guard-Datei passt nicht zum gemergten Fix — 2/8 Assertions rot** (drift, tests/spec/agent-skills)

Die im Plan-Commit 8cdb9a5cc deklarierte Testdatei tests/spec/agent-skills/post-merge-finalize-guards.bats wurde von PR #4572 nicht mitgemergt. Lokaler BATS-Lauf gegen origin/main: 6/8 ok, 2 rot. (1) Test 5 greppt ARCHIVE_PREV_BRANCH (Arbeitsbaum-Restore nach Archiv-Sektion) — existiert auf main nicht, kein Restore-Mechanismus implementiert (Z. 216-246, git checkout -B in Subshell). (2) Test 8 greppt '--repo "$REPO_DIR"' beim branch-reaper-Aufruf — Fix nutzt stattdessen absoluten Skript-Pfad 'bash "$REPO_DIR/scripts/branch-reaper.sh" --ticket "$TICKET_ID"' (Z. 298). Guard-Nachzieh daher abgebrochen, Worktree/Branch/Lock bereinigt. Entscheidung nötig: Assertions an main-Implementierung anpassen oder Restore-Fix nachziehen.
**3. plan-intel s1_limit:0 doppeldeutig (Budget 0 vs. ungated) — Fehlalarm bei .jsonc** (process, scripts/plan-intel.sh)

plan-intel.sh meldete fuer .opencode/agent-models.jsonc (Ist 577 Zeilen) `s1_limit: 0` — was nach "Budget 0, jede Nettozeile trippt das CI-Ratchet" aussieht. Tatsaechlich ist die Datei ungated UND unbaselined: gates.yaml kennt keine .jsonc-Extension, baseline.json ist leer (auch auf origin/main), s1-filesize.mjs Zeile 38 ueberspringt Extensionen ohne Limit-Eintrag. Der Plan-Subagent musste das evidenzbasiert aufloesen (grep gates.yaml, git show origin/main:docs/code-quality/baseline.json, Quelllese s1-filesize.mjs). Ohne diese Klaerung haette der Plan zeilenneutrale Kuerzung historischer Kommentarbloecke geplant — Churn ohne Gate-Wirkung, oder eine Baseline-Anpassung, die die Key-Count-Assertion von freshness:check Phase 3 verletzt. Friction: das Intel-Bundle unterscheidet im Feld s1_limit nicht zwischen "gegated, Budget 0" und "nicht gemessen (ungated)" — dieselbe 0, zwei entgegengesetzte Handlungsanweisungen. Vorschlag: plan-intel.sh sollte fuer ungated Dateien s1_limit auf null/nicht-vorhanden setzen statt 0, oder ein explizites Feld s1_gated:false ergaenzen.
**4. eval_harness.ModelBackend ohne CUDA-Transfer — lokaler Adapter-Eval unbrauchbar** (degraded, scripts/finetune)

ModelBackend lädt ohne .to(cuda) (torch_dtype="auto", kein Device-Transfer) und Qwen3.5-Hybrid-Attention fällt ohne fla-Kernel auf 1.4 tok/s zurück (CPU 0.27 tok/s) — lokaler --adapter-Eval für Qwen3.5-4B praktisch unbrauchbar. Umweg: llama.cpp-Fixture-Modus (gen_fixtures + eval_harness --fixture-*). T006361.
**5. fla von PyPI nicht installierbar (Seite 200, API 404)** (suspicious, scripts/finetune)

Das fla-Paket (Flash-Linear-Attention, für Qwen3.5-hybrid nötig) hat auf PyPI keine Releases: Projektseite HTTP 200, JSON-API 404 → "from versions: none". Kernel fehlt damit lokal; lineare Attention fällt auf langsamen torch-Pfad zurück. T006361.
**6. llama-server --hf lädt keine Repos ohne GGUF** (degraded, llama.cpp)

llama-server -hf <repo>:<quant> scheitert mit "exactly one out metadata, path_model, and file must be defined" bei Repos ohne GGUF-Dateien (techwithsergiu/Qwen3.5-text-4B hat nur safetensors) — die on-the-fly-Konvertierung existiert in dieser Build nicht. Umweg: GGUFs selbst exportieren. T006361.
**7. export_gguf.py: unsloth schreibt nach outputs/export_gguf/ — Meldung nennt falschen Pfad** (degraded, scripts/finetune/export_gguf.py)

unsloth save_pretrained_gguf schreibt die GGUF-Datei unabhängig vom übergebenen Ausgabeverzeichnis nach outputs/export_gguf/; die Umbenennung auf den Slot-Namen greift dadurch ins Leere (glob auf out_path.parent findet nichts) und die Meldung "GGUF-Export abgeschlossen" nennt einen Pfad, an dem die Datei nicht existiert. Workaround: glob auf outputs/export_gguf/. T006361.
**8. unsloth-Direkt-Save verwirft MTP-Köpfe — Base-GGUF-Export doppelt gebrochen** (degraded, unsloth)

unsloth save_pretrained_gguf schreibt im Direkt-Save-Pfad ("Model is not a PEFT model") eine config.json OHNE mtp_num_hidden_layers (auch wenn das Feld am Modellobjekt gesetzt wurde) und verwirft die MTP-Köpfe (0 MTP-Tensoren in den Shards). Folge: (a) Konverter-Assert conversion/qwen.py:297 (opt_num_mtp_layers != 0), (b) nach config-Patch ein GGUF mit blk.32-Kopf aber ohne Gewichte → llama-server "missing tensor blk.32.attn_norm.weight". Workaround: Konverter direkt auf die Original-HF-Cache-Shards richten (enthält MTP-Tensoren + korrekte Config). T006361.
**9. GPU-Lock während laufendem Export verloren (Parallel-Session?)** (drift, gpu-lock)

Während des laufenden T006361-Exports war der GPU-Lock (mit Grund "T006361 eval+export" gehalten) plötzlich weg (/tmp/gpu-training-lock.json nicht mehr vorhanden) und die chat-gpu-Loadouts waren auto-restored (gemma26 lief wieder auf 8092) — vermutlich von einer Parallel-Session released. Der Export lief ungestört weiter; für das Eval-Fenster wurde der Lock re-acquirt. MESSUNG: `ls /tmp/gpu-training-lock.json` am 2026-08-15 ~06:37.
**10. post-merge-finalize Schritt 10 meldete Branch bereits entfernt — Restbranch existierte noch** (suspicious, scripts/devflow-post-merge-finalize.sh)

Beim Finalize von T006840 (PR #4589) meldete das Skript in Schritt 10 "lokaler Branch bereits entfernt", obwohl feature/unterstuetzermodelle-inbetriebnahme-T006840 lokal noch existierte (Upstream gone, zeigte auf den verwaisten Archiv-Commit b521e0937). Der Finalizer musste den Restbranch manuell per git branch -D entfernen. Friction: die Schritt-10-Erkennung (Branch-Existenz-Check) stimmt nicht mit dem tatsaechlichen Zustand ueberein — entweder prueft sie nur den Upstream-Status oder sie lief nach einem vorherigen Teil-Remove. Der Inhalt des verwaisten Commits war vollstaendig ueber main/PR #4589 und den Archiv-PR #4595 abgedeckt, es ging also nichts verloren — aber die Fehlmeldung verleitet dazu, einen echten Restbranch zu uebersehen.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
