# P3 — Tests

Rolle: **tests** (letztes Partial, STRUCT2-Träger). Disjunkter Partial des
Change `freetoken-agent-roster-cleanup` (T016419). Schreibt die Guards auf den
Zielzustand um und liefert den Failing-Test-Step. Keine Produktionsdateien.

RED-Kontrakt: beide Tests werden gegen den Scaffold-Stand des Branches
authored und müssen dort rot liegen — der Roster-Assert zählt genau einen
lokalen Primary, der Default-Assert verlangt `freetoken-local/active`; beides
trifft vor p1/p2 nicht zu.

---

## File `tests/spec/llm-local-dev.bats` (332 Zeilen · nicht baselined)

### Schritt 1.1 — Acht-Locals-Assert auf Ziel-Roster schrumpfen

Test „T014105: … local agents reference the alias" (Liste mit
`'gemma26-primary','gemma26-vision','gptoss-primary','devstral-primary',
'gemma12-primary','gemma26-throughput-primary','qwen38-primary',
freetoken-primary'`): Liste ersetzen durch

```js
['gptoss', 'devstral', 'gemma', 'gemma12', 'qwen38', 'freetoken-primary']
```

### Schritt 1.2 — Neuer Negativ-Assert: Klon-Primaries sind weg

Neuer `@test "T016419: retired clone primaries are gone"`: parse JSONC,
erwarte dass keiner der sieben Keys mit `mode === 'primary'` existiert.
Positiv-Anker im selben Test: `agents['freetoken-primary'].model ===
'freetoken-local/active'` muss erfüllt sein, damit der Negativ-Test nicht
vakuos läuft [T002356-M1].

### Schritt 1.3 — gptoss-context-Messwert-Awk auf Überlebenden umziehen

Test „declares a MEASURED context for the local loadout" (awk-Anker
`/"gptoss-context": *\{/`): Anker → `/"qwen38-220k": *\{/`. Die
Trainingsfenster-Grenze `!= 131072` (war n_ctx_train von gpt-oss-20b) →
`!= 262144` (n_ctx_train von Qwen3.8-27B); Korridor `[50000 < ctx < 200000]`
bleibt (114688 liegt drin).

### Schritt 1.4 — Neuer Assert: tote Katalogkeys fehlen

Neuer `@test "T016419: dead checkpoint catalog entries are removed"`:
`llamacpp-local.models` darf keinen der Keys `gptoss-context`,
`gemma26-factory`, `gemma4`, `gemma26-throughput` mehr deklarieren; Positiv-
Anker: mindestens ein Eintrag bleibt (`hauhau-qwen36`, `gemma12-vision`
oder `qwen38-220k`). Statisch — bewusst KEIN Filesystem-Check gegen GGUF-Pfade,
das würde in CI ohne `/mnt/c`/`~/models` falsch rot.

Unverändert bleiben: „defines the llamacpp-local provider", „points the local
llama.cpp provider at the llm-proxy (:18235)", „three measured checkpoints"
(weiterhin exakt drei FreeToken-Einträge), die T014105-Provider-/Plugin-Guards.

---

## File `tests/spec/local-llm-proxy/qwen38-default-backend.bats` (28 Zeilen · nicht baselined)

### Schritt 2.1 — Default-Pin auf FreeToken umschreiben

Test „project default selects qwen38-220k": grep-Fix auf
`'"model": "freetoken-local/active"'` + Umbenennung zu „project default
selects the freetoken alias". Header-Kommentar (T013141-
Verdrängungs-Begründung) durch T016419-Begründung ersetzen (toter Proxy).

Test „migration registers the qwen38 proxy backend" bleibt UNVERÄNDERT — er
pinnt eine historische Migration, nicht den Ist-Zustand.

---

## Verify (RED → GREEN) dieses Partials

```bash
# RED — vor p1/p2 (Scaffold-Stand):
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev.bats tests/spec/local-llm-proxy/qwen38-default-backend.bats
# expected: FAIL (red — impl partials not applied yet)

# GREEN — nach p1+p2, plus die Roster-/Routing-Nachbarschaft:
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev.bats tests/spec/local-llm-proxy/qwen38-default-backend.bats tests/spec/agent-roster.bats tests/spec/freetoken-local-backend/routing.bats tests/spec/routing-check-freetoken.bats
```
