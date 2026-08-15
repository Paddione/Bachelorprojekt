# P1 — lmstudio-Slots fuer Gemma-4-12B und Qwen3.5-4B (T006840)

Rolle: **impl**. S2 aus dem Design: die beiden Unterstuetzermodelle aus E6
(Gemma-4-12B UD-IQ3_XXS, ~4,64 GB, PK-Tablet; Qwen3.5-4B Q6_K, ~3,3 GB, PK-L-1) werden als
benannte Slots im bestehenden `lmstudio`-Provider-Block von `.opencode/agent-models.jsonc`
registriert — Muster exakt wie `qwen3-14b@q4_k_m` (Zeilen 250–256 im Ist-Stand von 577
Zeilen): name-Feld (Modell + Quant + Geraet) plus `limit` ohne baseURL. Kein Subagent wird
umgehaengt (D2); die Provider-Definition in `.opencode/opencode.jsonc` bleibt unangetastet.

## File `.opencode/agent-models.jsonc` (geaendert)

### Task P1.1 — Zwei Slot-Eintraege in den `lmstudio`-Provider-Block eintragen

- [ ] Einfuegestelle: im `lmstudio`-Provider (Ist-Stand Zeilen 227–272) nach dem letzten
      Eintrag `gemma-4-12b-agentic-fable5-composer2.5-v2-3.5x-tau2@q4_k_m` (Zeilen 264–270),
      direkt vor der schliessenden `}` des `models`-Objekts (Zeile 271). Genau dieser Block
      wird eingefuegt (ein gemeinsamer Kommentar ueber beiden Eintraegen, erste Eintrag endet
      mit Komma, zweiter ohne — Stil der Datei):

```jsonc
        // Konservatives Limit (32768/8192) bis zur Vulkan-Messung (K3, User-Task
        // in T006840). Nach der Messung hier die GEMESSEN-Werte eintragen und im
        // Kommentar Messlauf + Datum notieren — Konvention der Datei, vgl. Zeile 26.
        "gemma-4-12b@ud-iq3_xxs": {
          "name": "Gemma 4 12B UD-IQ3_XXS (~4,64 GB, PK-Tablet)",
          "limit": {
            "context": 32768,
            "output": 8192
          }
        },
        "qwen3.5-4b@q6_k": {
          "name": "Qwen3.5-4B Q6_K (~3,3 GB, PK-L-1)",
          "limit": {
            "context": 32768,
            "output": 8192
          }
        }
```

- [ ] Keine baseURL in den Eintraegen, keine Backend-Port-Literale — weder `127.0.0.1:`/
      `localhost:` mit `1234|8093|8081|8095|8096` in aktiven Zeilen (der
      `gateway-consumer-lint` in `tests/spec/local-llm-proxy/gateway-consumer-lint.bats`
      prueft `.opencode/agent-models.jsonc` als SURFACE mit) noch im Kommentar.
- [ ] Schreibweise in der Datei wie im Bestand: ASCII-Transliteration (`ue` statt Umlaut) in
      Kommentaren und name-Feldern, Einrückung 8/10/12 Leerzeichen wie bei
      `qwen3-14b@q4_k_m`.
- [ ] Commit-Message nach Repo-Konvention (`feat(<scope>): … [T006XXX]`, vgl.
      `feat(mcp): port mcp-task-runner … [T006664]`):
      `feat(ops): lmstudio-Slots fuer Gemma-4-12B (PK-Tablet) und Qwen3.5-4B (PK-L-1) [T006840]`
      — Scope `ops`, nicht `llm`: commitlint konsolidiert `llm` → `ops` (T002328); `llm`
      wuerde abgelehnt.
      — Scope auf diese Datei begrenzt (nur `.opencode/agent-models.jsonc`; der
      `support-model-slots.bats`-Guard kommt im p2-Partial dazu).

### Task P1.2 — Verifikation (konkrete Test-Schritte)

S1-Budget: `.opencode/agent-models.jsonc` (Ist 577 Zeilen) ist **ungated und unbaselined**
(T002265) — die wirksame Schwelle existiert nicht, deshalb kein Zahlen-Claim:

- `docs/code-quality/gates.yaml` → `s1.limits` kennt keine `.jsonc`-Extension (nur
  .astro/.ts/.svelte/.sh/.mjs/.mts/.py/.js/.jsx/.tsx/.cjs/.bash/.java/.php);
  Gegenprobe: `grep -n 'jsonc' docs/code-quality/gates.yaml` liefert keine Limitzeile.
- `docs/code-quality/baseline.json` ist leer (`{}`, auch auf origin/main verifiziert:
  `git show origin/main:docs/code-quality/baseline.json`) — kein S1-Eintrag fuer die Datei.
- `scripts/code-quality/gates/s1-filesize.mjs` (Zeile 38) ueberspringt Erweiterungen ohne
  Limit-Eintrag komplett — die Datei wird vom Ratchet gar nicht gemessen; plan-lint
  `residual_budget` liefert fuer ungated & unbaselined Dateien leer.

Damit ist weder zeilenneutrale Kuerzung (historische Kommentarbloecke, z. B. die
gptoss-context-/devstral-quality-Erklaerungen ab Zeile 275, entfernen) noch eine
Baseline-Anpassung noetig oder zulaessig: Kuerzung waere Churn ohne Gate-Wirkung, und ein
neuer Baseline-Eintrag faellt in der Baseline-Key-Count-Assertion von `freshness:check`
(Phase 3) und verstoesst gegen die Regel „Niemals eine Baseline-/Ignore-Ausnahme einplanen".
Das Netto-Wachstum von 17 Zeilen (3 Kommentar- + 14 Eintragszeilen, siehe P1.1) ist
S1-gate-neutral.

- [ ] Test-Schritt A — JSONC-Syntax + Slot-Praesenz + Limits (Output-Verifikation,
      T002448-M4): exakt der Mechanismus, den `tests/spec/agent-roster.bats` (P4.3,
      `j5.parse`) fuer diese Datei nutzt — node + json5. Der Befehl bricht bei
      Syntaxfehler mit Exit != 0 ab und gibt die Modell-Schluessel aus:
      `node -e "const fs=require('fs');const j5=require('json5');const d=j5.parse(fs.readFileSync('.opencode/agent-models.jsonc','utf8'));console.log(Object.keys(d.provider.lmstudio.models).join('\n'));"`
      Erwartung: rc 0 und beide Namen `gemma-4-12b@ud-iq3_xxs` und `qwen3.5-4b@q6_k` im
      Output. Danach die Limits abpruefen (muss 32768/8192 je Slot liefern):
      `node -e "const fs=require('fs');const j5=require('json5');const d=j5.parse(fs.readFileSync('.opencode/agent-models.jsonc','utf8'));const m=d.provider.lmstudio.models;for(const k of ['gemma-4-12b@ud-iq3_xxs','qwen3.5-4b@q6_k']){const e=m[k];if(!e||e.limit.context!==32768||e.limit.output!==8192){console.error('FEHLER '+k);process.exit(1)}}console.log('limits ok');"`
- [ ] Test-Schritt B — Erreichbarkeit mit Skip-Guard (Semantik des
      `llm_endpoint_healthy`-Helpers aus `tests/spec/local-llm-proxy/helpers/llm-endpoint.bash`:
      HTTP-Status statt Exit-Code; ist der Proxy nicht erreichbar, wird der Schritt
      uebersprungen, nicht als Fehler gewertet):
      `code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:18235/v1/models 2>/dev/null); case "$code" in 2??) ;; *) echo "llm-proxy nicht erreichbar (HTTP ${code:-000}) — Erreichbarkeits-Check uebersprungen"; exit 0 ;; esac; curl -s --max-time 5 http://127.0.0.1:18235/v1/models | jq -r '.data[].id'`
      Erwartung bei erreichbarem Proxy: beide Slot-Namen erscheinen (Substring-Vergleich,
      LM Studio kann die IDs mit Datei-/Repo-Praefix melden, z. B. `gemma-4-12b-it-UD-IQ3_XXS`
      oder `lmstudio-community/…`).
- [ ] Test-Schritt C — Discovery-ID-Abgleich (D1): weicht die von `:18235/v1/models`
      gemeldete Modell-ID von den Slot-Namen ab, folgt der Eintrag der gemeldeten ID — Key
      und name-Feld werden umbenannt, dann laufen Schritt A und B erneut. Die gemeldete ID
      ist die Konvention des Eintrags, nicht der im Plan geratene Name.
- [ ] Test-Schritt D — Bestandsschutz: die bestehenden Guards bleiben gruen (beide Formen,
      T002696):
      `tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy* tests/spec/agent-roster.bats`
      Darin inbegriffen: `gateway-consumer-lint.bats` (keine Backend-Port-Literale in den
      neuen Eintraegen), `opencode-agent-model-drift.bats` (prueft nur `"model":`-Felder der
      Agenten, nicht `provider.*.models`), `opencode-routes-via-proxy.bats` (prueft nur die
      `llamacpp`-baseURLs und den `gemma26-factory`-Kontext — die lmstudio-Slots sind keine
      Loadouts, fuer sie gilt die statische Deklaration, D3) sowie `agent-roster.bats`
      (Registry-Agenten; neue Slots sind keine Agenten-Eintraege).
- [ ] Die drei CI-Gates aus der Final Verification der Haupt-`tasks.md` (`task test:changed`,
      `task freshness:regenerate`, `task freshness:check`) laufen gruen; die
      Test-Inventory-Regenerierung liegt beim p2-Partial (neue Guard-Datei).
