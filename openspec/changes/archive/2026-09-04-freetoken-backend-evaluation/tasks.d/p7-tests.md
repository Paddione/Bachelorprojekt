---
title: "BATS guard for FreeToken alias usage telemetry"
ticket_id: "T900087"
domains: ["test", "llm-local-dev"]
status: "draft"
---

# p7 — Tests (alias-telemetry)

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `tests/spec/llm-local-dev/alias-telemetry.bats` | 0 (neu) | kein Limit (`.bats` steht nicht in `gates.yaml` → `s1.limits`, siehe `docs/code-quality/gates.yaml`) |

Kein S1-Druck: die Datei ist neu und ihre Erweiterung trägt keine Zeilenschwelle.

## Problem

Das ADDED-Requirement "Alias Usage Telemetry for the FreeToken Plugin"
(`openspec/changes/freetoken-backend-evaluation/specs/llm-local-dev.md`) trägt
vier Szenarien gegen `.opencode/plugin/freetoken-active.ts` (P2,
`tasks.d/p2-alias-telemetry.md`):

1. Ein `active-thinking`-Request wird unter genau diesem Alias erfasst (mit
   Prompt-Größe + Zeitstempel).
2. Ein `active-fast`-Request wird unter genau diesem Alias erfasst.
3. Der Telemetriepfad liegt nicht innerhalb des Working Tree.
4. Ein Telemetrie-Schreibfehler lässt den Request unverändert und wirft
   keinen Fehler zum Aufrufer.

P2 blockiert P7 (siehe Partial-Manifest in `tasks.md`): dieses Partial
schreibt den Guard, der genau diese vier Szenarien absichert.

## Design-Entscheidungen (Prüfmodus)

**Ausführung statt Source-Grep.** `tests/CLAUDE.md` verbietet Implementierungs-
Grep als primäre Zusicherung ("Output- statt Source-Verifikation"). Der Guard
importiert `freetoken-active.ts` deshalb tatsächlich und ruft seinen `config`-
Hook mit einem Mock-`cfg` auf — er greppt nicht nach `appendFile` oder
`TELEMETRY_PATH` im Quelltext.

**Ausführung über `./node_modules/.bin/tsx`, nicht `node --experimental-strip-types`.**
Beide Idiome existieren bereits im Repo (`tests/spec/openspec-workflow.bats`
nutzt `npx tsx -e`, `tests/spec/sdlc-cockpit/leitstand-help-overlay.bats`
`node --experimental-strip-types`). `tsx` wird gewählt, weil das Plugin über
`export default async () => ({ config: async (cfg) => {...} })` eine
dynamische Objekt-Rückgabe mit `any`-Casts exportiert und `tsx` dafür bereits
an anderer Stelle im Repo für strukturell ähnlichen TS-Code
(`scripts/openspec-validate.ts`) etabliert ist. `tsx` ist Root-`package.json`-
Dependency (`^4.23.1`); der CI-Job `test-bats` installiert sie vor dem BATS-
Lauf via `npm ci` (`.github/workflows/ci.yml` Zeile 104). Trotzdem ein
Verfügbarkeits-Guard in der Rotphase (`grep -rn 'tsx' .github/workflows/`
zeigt keinen direkten Treffer, weil `tsx` nur transitiv über `npm ci`
installiert wird — der Guard schützt gegen lokale Läufe ohne vorheriges
`npm install`):
```bash
[ -x "$REPO/node_modules/.bin/tsx" ] || skip "tsx not installed (run npm ci)"
```

**Kein laufender FreeToken-Server nötig.** `discoverRuntime()` in
`freetoken-active.ts` ruft `:1900`/`:1919` auf, aber der `config`-Hook
installiert den `fetch`-Wrapper (Zeile ~121, vor P2) synchron **bevor** er
`discoverRuntime()` awaited. Schlägt `discoverRuntime()` fehl (kein Server —
Port 1919 ist auf diesem Host tot, verifiziert; in CI läuft nie einer), fängt
der äußere `try`/`catch` (Zeile 110–189) den Fehler ab und der Hook kehrt
zurück — der bereits zugewiesene `fetch`-Wrapper bleibt aber gültig auf
`cfg.provider["freetoken-local"].options.fetch` stehen. Der Guard braucht
deshalb **keinen** Mock-HTTP-Server für `:1900`/`:1919`; ein Fehlschlag dieser
Aufrufe ist der Normalfall in CI und Teil des geprüften Verhaltens, nicht ein
Testrisiko. Einziger Nebeneffekt: jeder Harness-Lauf wartet bis zu ~1,5s pro
gescheitertem `fetchJson`-Aufruf (max. 3 Aufrufe, `AbortSignal.timeout(1500)`
in `freetoken-active.ts` Zeile 34) — bei fünf Testfällen ~20s Overhead,
unkritisch gegenüber dem BATS-Default-Timeout.

**`LOCALAPPDATA` wird PRO Testfall über einen eigenen `tsx`-Subprozess
gesetzt, nicht innerhalb eines gemeinsamen Prozesses umgeschaltet.**
`TELEMETRY_PATH` in `freetoken-active.ts` ist eine Modul-Top-Level-`const`,
ausgewertet **beim Import**, nicht pro Request. Ein zweiter `import()`
desselben Pfads im selben Node-Prozess träfe den Modul-Cache und würde
`TELEMETRY_PATH` NICHT neu berechnen — ein Test, der `LOCALAPPDATA` innerhalb
eines Prozesses zwischen zwei Aufrufen ändert, prüfte dann für beide Aufrufe
denselben (ersten) Pfad und würde die falsche Sache belegen. Jeder der vier
Testfälle startet deshalb einen eigenen `tsx`-Subprozess mit eigenem,
isoliertem `LOCALAPPDATA`. Auf dem CI-Runner (Linux) ist `LOCALAPPDATA`
ohnehin nicht gesetzt — der Guard setzt ihn für jeden Lauf explizit auf ein
`mktemp -d`-Verzeichnis, statt sich auf den echten Windows-Wert des
Entwicklerrechners zu verlassen (der reale FreeToken-Log-Ordner darf nicht
von Testläufen beschrieben werden).

**Positiv-Anker vor den Szenario-Assertions.** Bevor irgendein Szenario
geprüft wird, bestätigt ein erster Test, dass `freetoken-active.ts` sich
laden lässt und `config` eine aufrufbare Funktion ist — sonst liefen alle
Folge-Assertions (z. B. "keine `alias-telemetry.jsonl` im Repo-Baum") über
einer leeren Grundmenge trivial durch, sobald das Modul aus irgendeinem Grund
gar nicht erst importierbar ist.

## Implementation Steps

1. **Scratch-Harness in `setup()` schreiben.** Kein zusätzliches committetes
   Fixture — die Datei entsteht pro Testlauf unter `$BATS_TEST_TMPDIR` (Muster
   aus `tests/spec/sdlc-cockpit/leitstand-help-overlay.bats`). Sie importiert
   das Plugin, baut ein Mock-`cfg` mit einem Stub-`upstreamFetch`
   (`options.fetch`), ruft `hooks.config(cfg)` auf, entnimmt den installierten
   Wrapper aus `cfg.provider["freetoken-local"].options.fetch`, ruft ihn mit
   einem Body `{ model: <ALIAS>, messages: [...] }` auf und schreibt ein
   Ergebnis-JSON (`threw`, `status`, `upstreamBody`) nach `$RESULT_FILE`:
   ```js
   // $BATS_TEST_TMPDIR/telemetry-harness.mjs
   import { writeFileSync } from "node:fs";
   const [, , pluginPath, alias] = process.argv;
   const { default: createPlugin } = await import(pluginPath);
   const hooks = await createPlugin();

   let upstreamCall = null;
   const cfg = {
     provider: {
       "freetoken-local": {
         models: { active: { limit: { context: 100000 } } },
         options: {
           fetch: async (url, init) => {
             upstreamCall = { url: String(url), body: init?.body ?? null };
             return new Response(JSON.stringify({ ok: true }), { status: 200 });
           },
         },
       },
     },
   };

   await hooks.config(cfg);
   const wrapped = cfg.provider["freetoken-local"].options.fetch;
   const body = JSON.stringify({
     model: alias,
     messages: [{ role: "user", content: "x".repeat(37) }],
   });

   let threw = false;
   let res;
   try {
     res = await wrapped("http://127.0.0.1:1919/v1/chat/completions", { body });
   } catch {
     threw = true;
   }

   writeFileSync(process.env.RESULT_FILE, JSON.stringify({
     threw,
     status: res ? res.status : null,
     upstreamBody: upstreamCall ? upstreamCall.body : null,
   }));
   ```
   Ein Helper `_run_harness <alias> <localappdata_dir>` in der `.bats`-Datei
   kapselt den Subprozess-Aufruf (`LOCALAPPDATA="$2" RESULT_FILE="$out"
   "$TSX" "$BATS_TEST_TMPDIR/telemetry-harness.mjs" "$PLUGIN" "$1"`) und gibt
   den Pfad zur Ergebnisdatei zurück.

2. **T0 — Positiv-Anker: Plugin lädt, `config` ist aufrufbar.**
   ```bash
   @test "T0 freetoken-active.ts laedt und config ist eine Funktion (Positiv-Anker)" {
     [ -x "$REPO/node_modules/.bin/tsx" ] || skip "tsx not installed (run npm ci)"
     [ -f "$PLUGIN" ]
     run "$TSX" -e "
       const { default: createPlugin } = await import(process.argv[1]);
       const hooks = await createPlugin();
       process.exit(typeof hooks.config === 'function' ? 0 : 1);
     " "$PLUGIN"
     [ "$status" -eq 0 ]
   }
   ```

3. **T1 — `active-thinking`-Request wird unter diesem Alias mit
   Prompt-Größe + Zeitstempel erfasst (Requirement-Szenario 1).**
   ```bash
   @test "T1 active-thinking Request wird unter eigenem Alias mit ts+promptChars erfasst" {
     [ -x "$REPO/node_modules/.bin/tsx" ] || skip "tsx not installed (run npm ci)"
     LOCALAPP_T1="$(mktemp -d)"
     out="$BATS_TEST_TMPDIR/t1-result.json"
     LOCALAPPDATA="$LOCALAPP_T1" RESULT_FILE="$out" \
       "$TSX" "$BATS_TEST_TMPDIR/telemetry-harness.mjs" "$PLUGIN" "active-thinking"
     jq -e '.threw == false and .status == 200' "$out"

     jsonl="$LOCALAPP_T1/FreeToken/logs/alias-telemetry.jsonl"
     [ -f "$jsonl" ]
     last="$(tail -n1 "$jsonl")"
     echo "$last" | jq -e '.alias == "active-thinking"'
     echo "$last" | jq -e '.promptChars | type == "number" and . > 0'
     echo "$last" | jq -e '.ts | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T")'
   }
   ```

4. **T2 — `active-fast`-Request wird unter diesem Alias erfasst
   (Requirement-Szenario 2).** Eigenes `mktemp -d` (isoliert von T1, siehe
   Design-Entscheidung oben).
   ```bash
   @test "T2 active-fast Request wird unter eigenem Alias erfasst" {
     [ -x "$REPO/node_modules/.bin/tsx" ] || skip "tsx not installed (run npm ci)"
     LOCALAPP_T2="$(mktemp -d)"
     out="$BATS_TEST_TMPDIR/t2-result.json"
     LOCALAPPDATA="$LOCALAPP_T2" RESULT_FILE="$out" \
       "$TSX" "$BATS_TEST_TMPDIR/telemetry-harness.mjs" "$PLUGIN" "active-fast"
     jq -e '.threw == false and .status == 200' "$out"

     jsonl="$LOCALAPP_T2/FreeToken/logs/alias-telemetry.jsonl"
     [ -f "$jsonl" ]
     tail -n1 "$jsonl" | jq -e '.alias == "active-fast"'
   }
   ```

5. **T3 — Telemetriepfad liegt nicht innerhalb des Working Tree
   (Requirement-Szenario 3).** Behaviouraler Proxy statt Zugriff auf die
   nicht exportierte `TELEMETRY_PATH`-Konstante: die JSONL-Datei landet
   nachweislich außerhalb von `$REPO` (Datei existiert unter dem isolierten
   `LOCALAPPDATA`) UND es entsteht nachweislich keine gleichnamige Datei
   irgendwo im Repo-Baum.
   ```bash
   @test "T3 Telemetriedatei liegt ausserhalb des Working Tree" {
     [ -x "$REPO/node_modules/.bin/tsx" ] || skip "tsx not installed (run npm ci)"
     LOCALAPP_T3="$(mktemp -d)"
     out="$BATS_TEST_TMPDIR/t3-result.json"
     LOCALAPPDATA="$LOCALAPP_T3" RESULT_FILE="$out" \
       "$TSX" "$BATS_TEST_TMPDIR/telemetry-harness.mjs" "$PLUGIN" "active-thinking"
     jq -e '.threw == false' "$out"

     [ -f "$LOCALAPP_T3/FreeToken/logs/alias-telemetry.jsonl" ]
     inside_repo="$(find "$REPO" -name 'alias-telemetry.jsonl' 2>/dev/null)"
     [ -z "$inside_repo" ]
   }
   ```

6. **T4 — Telemetrie-Schreibfehler lässt den Request unverändert und wirft
   keinen Fehler (Requirement-Szenario 4).** `LOCALAPPDATA` zeigt auf ein
   `mktemp -d`-Verzeichnis, dessen `FreeToken/logs`-Unterordner absichtlich
   NICHT existiert (`appendFile` legt keine Elternverzeichnisse an, siehe
   `p2-alias-telemetry.md` Design-Entscheidung "Fire-and-forget"). Vergleich
   mit T1: identischer Alias (`active-thinking`), identischer `upstreamBody`
   in beiden Läufen belegt, dass der Telemetrie-Ausfall die ausgehende
   Anfrage nicht verändert hat.
   ```bash
   @test "T4 Telemetrie-Schreibfehler aendert Request nicht und wirft nicht" {
     [ -x "$REPO/node_modules/.bin/tsx" ] || skip "tsx not installed (run npm ci)"
     LOCALAPP_T4="$(mktemp -d)"
     # FreeToken/logs bleibt bewusst ungeschaffen -> appendFile schlaegt fehl.
     [ ! -d "$LOCALAPP_T4/FreeToken/logs" ]

     out_ok="$BATS_TEST_TMPDIR/t4-ok-result.json"
     LOCALAPP_OK="$(mktemp -d)"
     LOCALAPPDATA="$LOCALAPP_OK" RESULT_FILE="$out_ok" \
       "$TSX" "$BATS_TEST_TMPDIR/telemetry-harness.mjs" "$PLUGIN" "active-thinking"

     out_fail="$BATS_TEST_TMPDIR/t4-fail-result.json"
     LOCALAPPDATA="$LOCALAPP_T4" RESULT_FILE="$out_fail" \
       "$TSX" "$BATS_TEST_TMPDIR/telemetry-harness.mjs" "$PLUGIN" "active-thinking"

     jq -e '.threw == false and .status == 200' "$out_fail"
     [ ! -f "$LOCALAPP_T4/FreeToken/logs/alias-telemetry.jsonl" ]

     body_ok="$(jq -r '.upstreamBody' "$out_ok" | jq -S .)"
     body_fail="$(jq -r '.upstreamBody' "$out_fail" | jq -S .)"
     [ "$body_ok" = "$body_fail" ]
   }
   ```

7. **Rotphase — Guard gegen den unveränderten Branch laufen lassen
   (STRUCT2, `expected: FAIL`).** Vor P2 existiert `recordAliasUsage` nicht:
   T1–T3 scheitern (keine `alias-telemetry.jsonl` entsteht), T4 könnte
   trivial grün sein (kein Schreibversuch), aber die Suite insgesamt ist rot.
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/alias-telemetry.bats
   # expected: FAIL (rot — P2/recordAliasUsage existiert auf diesem Branch noch nicht,
   # T1/T2/T3 finden keine alias-telemetry.jsonl)
   ```

8. **Fix-Step (GREEN) — nach P2.**
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/alias-telemetry.bats
   # expected: PASS
   ```

## Acceptance Criteria

- [x] T0 (Positiv-Anker) bestätigt, dass das Plugin lädt und `config`
      aufrufbar ist, bevor irgendeine Szenario-Assertion greift.
- [x] T1 belegt Requirement-Szenario 1: `active-thinking` → eigener Alias,
      `promptChars` > 0, `ts` im ISO-8601-Präfix.
- [x] T2 belegt Requirement-Szenario 2: `active-fast` → eigener Alias.
- [x] T3 belegt Requirement-Szenario 3: Datei liegt nachweislich außerhalb
      `$REPO`, keine gleichnamige Datei im Repo-Baum.
- [x] T4 belegt Requirement-Szenario 4: kein Wurf, `status == 200`,
      `upstreamBody` identisch zum Erfolgsfall, keine Datei im kaputten
      `LOCALAPPDATA` entstanden.
- [x] Jeder Testfall mit eigenem `LOCALAPPDATA`-Verzeichnis und eigenem
      `tsx`-Subprozess (Modul-Cache-Falle vermieden, siehe Design-
      Entscheidungen).
- [x] Kein laufender FreeToken-Server (`:1919`) und kein `:1900`-Daemon als
      Testvoraussetzung.
- [x] Verfügbarkeits-Guard `[ -x "$REPO/node_modules/.bin/tsx" ] || skip …`
      in jedem `@test`, das `tsx` aufruft.
- [x] Suite läuft vor P2 rot (Schritt 7, `expected: FAIL`) und nach P2 grün
      (Schritt 8).

## Not in Scope

- **Die Plugin-Implementierung selbst** (`recordAliasUsage`,
  `TELEMETRY_PATH`) — das ist P2 (`tasks.d/p2-alias-telemetry.md`), das
  diesem Partial vorausgeht.
- **Auswertung/Aggregation der JSONL-Datei** (Verteilung Alias vs.
  Prompt-Größe) — das ist P6 (Messbericht), das die von P2 erzeugten
  Rohdaten liest; dieser Guard prüft nur, dass die Rohdaten korrekt
  entstehen.
- **Discovery-Verhalten (`discoverRuntime`, `SDLC_CONTEXT_CEILING`,
  Kontext-Limit-Kalibrierung)** — unverändertes Bestandsverhalten des
  Plugins, nicht Teil dieses Requirements und nicht Gegenstand dieses
  Guards.
