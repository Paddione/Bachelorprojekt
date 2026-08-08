---
title: "qwen3-coder-loadout — Implementation Plan"
ticket_id: T002645
domains: [bachelorprojekt-ops, bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# qwen3-coder-loadout — Implementation Plan

_Ticket: T002645_

## File Structure

```
scripts/llm/loadouts.json                                    (geändert — +1 Loadout-Eintrag)
scripts/migrations/2026-08-04-llm-proxy-qwen3-coder.sql       (neu)
tests/spec/local-llm-proxy/qwen3-coder-loadout.bats           (neu)
```

### S1-Zeilenbudget

Keine der drei Dateien hat ein S1-Limit: `s1.limits` in `docs/code-quality/gates.yaml` führt nur
`.astro`, `.svelte`, `.mjs`, `.py`, `.jsx`, `.cjs`, `.java`, `.sh` und `.bash`. `.json`, `.sql`
und `.bats` sind nicht erfasst, `scripts/llm/loadouts.json` (Ist 320 Zeilen) ist auch nicht
gebaselined (`jq` auf `docs/code-quality/baseline.json` → `nicht-baselined`). Es gibt damit kein
Zeilenbudget zu wahren und keinen Split einzuplanen.

## Kontext für den Implementierer

Gemessen am 2026-08-04 auf RTX 5070 Ti (16 GB), **unter Konkurrenz durch das gleichzeitig
laufende `gptoss-context`**: Decode 47,9 tok/s, Prefill 912 tok/s bei 4331 Prompt-Tokens. Die
Werte sind eine Untergrenze, keine Bestwerte.

Das GGUF liegt bereits unter `~/models/gguf/qwen3coder30/` (Hardlink, 17 GB) und damit innerhalb
der `modelRoots` aus `loadouts.json`. Kein Download nötig.

Referenzlauf, aus dem die Parameter stammen (Unsloth-Studio-Server, Port 46729):
`--fit on --fit-ctx 65000 --parallel 4 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0
--kv-unified --no-context-shift`.

**Port 8097.** Belegt sind 8091, 8092, 8095, 8096, 8098, 8099 (aus `loadouts.json`) sowie 8081
und 8093 (lauschende Fremdprozesse: bge-Port-Forwards).

**Erwarteter Merge-Konflikt:** `feature/finetune-eval-gguf-bridge-T002634` fügt derselben Datei
die Loadouts `gemma4-base` und `gemma4-tuned` hinzu. Auflösung ist **beide Blöcke behalten**,
danach `task llm:loadouts:format` zur Normalisierung.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Lege `tests/spec/local-llm-proxy/qwen3-coder-loadout.bats` an.
      Der Test führt Kommandos aus und prüft deren Ergebnis (Output-Verifikation), er greppt
      keine Implementierungsquelle. Drei Prüfungen:
      1. `task llm:loadouts:check` läuft mit Status 0 durch (kanonische Form).
      2. Der Eintrag `qwen3-coder` existiert und meldet Port 8097 — via `jq` gegen die
         Konfigurationsdatei, deren Inhalt selbst das Prüfobjekt ist.
      3. **Negativtest mit Positiv-Anker** (Pflicht nach T002356-M1): erst belegen, dass
         `qwen3-coder` überhaupt in der Portliste auftaucht (Positiv-Anker — schlägt rot fehl,
         solange das Loadout fehlt), dann prüfen, dass kein zweites Loadout Port 8097 belegt.
      Der Test muss auf dem aktuellen Branch FEHLSCHLAGEN, weil das Loadout noch nicht existiert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/qwen3-coder-loadout.bats
# expected: FAIL (rot — das Loadout ist noch nicht angelegt)
```

- [ ] **Loadout-Step (GREEN).** Ergänze `scripts/llm/loadouts.json` um den Eintrag `qwen3-coder`:
      Port 8097, `exclusiveGroup: "chat-gpu"`, `model` zeigt auf
      `qwen3coder30/Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL.gguf`, `fit.enabled: true`,
      `args.ctx: null` und `args.ngl: null` (der Guard verbietet das Pinnen bei aktivem `--fit`),
      `cacheTypeK`/`cacheTypeV` auf `q8_0`, `parallel: 4` mit `-kvu` in `extraArgs` (der
      T002286-Guard verlangt `-kvu`, sobald `parallel > 1`), `flashAttention: true`,
      `jinja: true`, `metrics: true`.

      Die `notes` MÜSSEN festhalten: (a) die beiden Messwerte samt der Einschränkung, dass sie
      unter Konkurrenz entstanden sind; (b) dass `fit.targetMarginMib` vom Referenzlauf
      übernommen und **nicht gemessen** ist — anders als bei `gemma26-factory`, wo der Wert aus
      einer `-fitt`-Reihe stammt; (c) warum MoE-Offload hier trägt, obwohl `-ncmoe` für
      `gemma26-factory` verworfen wurde (3B statt 4B aktive Parameter je Token).

      Danach `task llm:loadouts:format` ausführen und das Ergebnis committen — die Datei hat eine
      kanonische Form, die `task llm:loadouts:check` fail-closed erzwingt.

- [ ] **Migrations-Step (GREEN).** Lege
      `scripts/migrations/2026-08-04-llm-proxy-qwen3-coder.sql` nach dem Muster von
      `scripts/migrations/2026-08-03-llm-proxy-gptoss-devstral.sql` an: ein
      `INSERT … ON CONFLICT (name) DO UPDATE` auf `tickets.llm_proxy_backends` mit
      `name = 'llamacpp-qwen3coder'`, `kind = 'llamacpp'`,
      `base_url = 'http://127.0.0.1:8097/v1'`, `enabled = true`, `priority = 1`,
      leerem `fixups` und leerem `model_aliases`.

      `model_aliases` bleibt leer, weil `llama-server` sich unter dem Loadout-Alias meldet und
      der Proxy diesen Namen direkt übernimmt — ein Mapping wäre nur nötig, um einen abweichenden
      Namen nach außen zu tragen.

      Der Kopfkommentar MUSS die Apply-Zeilen für **beide** Brands enthalten (mentolder und
      korczewski haben getrennte Datenbanken) und festhalten, dass der Change reversibel ist
      (`enabled = false`).

      **Kein** `UPDATE` auf `tickets.provider_config` oder `tickets.factory_model_slots` — das
      Routing bleibt unangetastet, das ist die zentrale Zusage dieses Change.

- [ ] **Test wird grün.** Derselbe Aufruf wie im RED-Step läuft jetzt durch:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/qwen3-coder-loadout.bats
# expected: PASS
```

- [ ] **Final Verification.** Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
