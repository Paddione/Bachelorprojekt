# P1 — opencode-Konfiguration

Rolle: **impl** (Konfiguration). Disjunkter Partial des Change
`freetoken-agent-roster-cleanup` (T016419). Dieser Partial trägt die beiden
opencode-Dateien: Katalog-Ausmistung in der SSOT `agent-models.jsonc` und den
Default-Umzug in `opencode.jsonc`. Mirror/Docs/Disk gehören P2, Tests P3 — hier
stehen bewusst KEINE Failing-Test- oder Verify-Tasks.

Alle Schritte sind **netto Löschungen** (Katalogeinträge, Agentenblöcke,
veraltete Prosa); keine der Dateien ist im Code-Quality-Baseline erfasst
(`S1:*`-Keys: nicht baselined) — jedes Budget bleibt damit unangetastet grün.
JSONC-Gültigkeit nach jedem Schritt über Node-JSON5-Parse prüfen (Abschluss-
Schritt V1).

---

## File `.opencode/agent-models.jsonc` (883 Zeilen · nicht baselined)

### Schritt 1.1 — Vier tote Katalogmodelle entfernen

Im Provider `provider["llamacpp-local"].models` diese vier Einträge komplett
löschen (Keys inklusive Name/Limit-Kommentaren):

- `gptoss-context`
- `gemma26-factory`
- `gemma4`
- `gemma26-throughput`

Begründung je Key (steht teils schon im Kommentar): GGUF-Verzeichnisse
`gptoss20/`, `gemma4-26A4-it/`, `gemma4-26A4-qat/` existieren nicht mehr auf
Disk; die Loadouts sind in `scripts/llm/loadouts.json` durchweg
`enabled: false`.

**Behalten** (Gewichte vorhanden, dokumentierte Rückfallebene):
`hauhau-qwen36`, `gemma12-vision`, `qwen38-220k`. Der Provider-Block selbst
bleibt samt `baseURL http://127.0.0.1:18235/v1`.

### Schritt 1.2 — Header-/Zwischenkommentare auf FreeToken-Realität heben

- Blockkommentar über `llamacpp-local` („Ersetzt die früheren Blöcke …",
  max_inflight-Prosa): um einen Absatz ergänzen — „Seit T014028/T014105 läuft
  der lokale Stack auf FreeToken-native (:1919); dieser Provider ist nur noch
  Rückfallebene mit deaktivierten Loadouts. Die Einträge `gptoss-context`,
  `gemma26-factory`, `gemma4`, `gemma26-throughput` wurden T016419 entfernt —
  deren GGUFs sind von der Platte."
- Zwischenkommentar bei den Familiensubagenten (2026-08-04-Block + T003204-
  Notizen bei `gptoss` und `devstral`): Sätze streichen, die auf die
  gelöschten Loadouts verweisen (`fährt seit dem Abschalten … das Loadout
  gemma26-throughput/gptoss-context`), ersetzen durch „modellagnostisch auf
  dem FreeToken-Alias, siehe freetoken-local-Provider".
- Kommentar über `qwen38`: Verweis auf Loadout qwen38-220k/Port 8094 streichen,
  Alias-Formulierung wie bei den anderen Familien.

Keine semantischen Änderungen an verbleibenden Agentenblöcken.

### Schritt 1.3 — Sieben Klon-Primaries entfernen

Im Objekt `agent` diese sieben Blöcke komplett löschen:

`gemma26-primary` · `gemma26-vision` · `gptoss-primary` · `devstral-primary` ·
`gemma12-primary` · `gemma26-throughput-primary` · `qwen38-primary`

Alle sieben sind seit T014105 byte-identische Klone von `freetoken-primary`
(modell `freetoken-local/active`, Prompt `primary-agent.md`, temp 0.3, steps
50, gleiche Permissions) — ihre Namen referenzieren retired Loadouts.

**Behalten:** `freetoken-primary` (einziger lokaler Primary), sämtliche
Subagenten-Familien (`gptoss`, `devstral`, `gemma`, `gemma12`, `qwen38`),
`qwen-cloud`, alle `deepseek-*`, `orchestrator`, `big-pickle`,
`ox-alpha-free`, `ox-alpha`, `alibaba-primary`. Permission-Listen nirgends
anfassen (Primaries tauchen in keiner Task-Allowlist auf).

---

## File `.opencode/opencode.jsonc` (218 Zeilen · nicht baselined)

### Schritt 2.1 — Default-Modell umziehen

Zeile `"model": "llamacpp-local/qwen38-220k",` →
`"model": "freetoken-local/active",`

### Schritt 2.2 — Kommentarblock darüber neu fassen

Den WARUM-Block zum exclusiveGroup-Loadout-Verdrängungsproblem (llama.cpp-Ära)
ersetzen durch Kurznotiz: „Default = FreeToken-Alias `active`: serviert immer
das residente Modell auf pk-desktop (:1919); Kontext-Limit setzt beim Start das
Plugin `plugin/freetoken-active.ts` auf die gemessenen KV-Werte. Der alte
llama.cpp-Stack (:18235) ist stillgelegt — Default darauf wäre ein toter
Backend-Aufruf (T016419)."

---

## Abschluss-Verifikation dieses Partials

```bash
node -e "const j5=require('./.opencode/node_modules/json5'||'json5');const fs=require('fs');
for (const f of ['.opencode/agent-models.jsonc','.opencode/opencode.jsonc']) {
  const o=j5.parse(fs.readFileSync(f,'utf8'));
  console.log(f,'OK');
}"
grep -c 'gptoss-context\|gemma26-factory\|gemma26-throughput\|"gemma4"' .opencode/agent-models.jsonc   # expected: 0 (nur Historien-Kommentare dürfen bleiben: Ziel 0 in Keys)
grep -n 'mode": "primary"' .opencode/agent-models.jsonc | wc -l                                        # lokale Primaries: nur freetoken-primary + Cloud-Primaries übrig
```
