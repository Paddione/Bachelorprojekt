# p3 — Tests (Leitstand-DS-Tokens + API-Inventar-Drift)

**Rolle:** bachelorprojekt-test
**target_files:**
- `tests/spec/sdlc-cockpit/leitstand-ds-tokens.bats` (neu)
- `tests/spec/sdlc-cockpit/api-inventory-drift.bats` (neu)
- `website/src/data/test-inventory.json` (Regenerat via `task test:inventory`)

_Ticket: T007559 · Partial p3 (tests) · IMMER zuletzt · deckt die zwei ADDED-Requirements aus
`openspec/changes/sdlc-leitstand-e1-e2/specs/sdlc-cockpit.md` ab: "Leitstand Design Token Set"
(p1 liefert `website/src/styles/sdlc-leitstand.css` + `design-system.astro`-Umbau) und
"API Connector Inventory" (p2 liefert `scripts/sdlc/api-inventory.mjs` +
`website/src/data/api-inventory.json` + `docs/agent-guide/registry/api-overlay.yaml`)._

Runner: `tests/unit/lib/bats-core/bin/bats` (vendored — NICHT `which bats`). Syntax-Probe fuer
neue Dateien: `tests/unit/lib/bats-core/bin/bats --count <datei>` (T002351-M2 — `bash -n` ist
fuer `.bats` kein gueltiger Syntax-Check). Beide Dateien liegen unter `tests/spec/sdlc-cockpit/`
gemaess der Verzeichniskonvention (T002416, eine Datei pro Vorgang, kein Anhaengen an eine
Sammeldatei).

## Schnittstellen-Kontrakt fuer p2 (RED definiert das Verhalten, nicht umgekehrt)

Weil diese Tests **vor** p2 committet werden (RED-Beleg), legen sie folgende CLI-/Ausgabe-
Schnittstelle **verbindlich** fest — p2 implementiert dagegen, nicht der Test gegen eine
geratene p2-Form:

- Aufruf: `node scripts/sdlc/api-inventory.mjs` — Default-Output
  `website/src/data/api-inventory.json`, Default-Overlay
  `docs/agent-guide/registry/api-overlay.yaml`.
- Override fuer isolierte Testlaeufe (Muster `TEST_INVENTORY_OUT` aus
  `scripts/build-test-inventory.sh`): Env-Var `API_INVENTORY_OUT=<pfad>` fuer den Zielpfad,
  `API_OVERLAY_PATH=<pfad>` fuer die Overlay-Datei.
- JSON-Form: Top-Level-Keys `routes` (Array, je Eintrag mind. `path`, `methods`, `backend`),
  `mcpServers` (Array), `factoryTools` (Array, Laenge 7 lt. `design.md` S5). Keine
  Top-Level-Zeitstempel-Keys (`generatedAt`/`timestamp`/`date`).
- Exit-Code: `0` bei Erfolg; `!= 0` bei einem Overlay-Eintrag ohne gescannten Endpunkt, dabei
  nennt `$output` den verwaisten Endpunkt-String woertlich.

Weichen die tatsaechlichen p2-Namen ab, ist das ein Merge-Konflikt zwischen p2 und p3 — nicht
stillschweigend in p2 umbenennen; die Namen hier gelten, bis ein Review sie aendert.

## File `tests/spec/sdlc-cockpit/leitstand-ds-tokens.bats` (neu)

Header dokumentiert zwei Pruefmodi: die Token-Struktur- und Disziplin-Checks sind
Quelltext-Pruefung (dokumentierte Ausnahme T002448-M4 — ein CSS-Custom-Property-Set *ist*
sein Quelltext, es gibt ohne Playwright-Browserlauf gegen den Dev-Stack keinen separaten
Laufzeit-Nachweis offline; Analogie zu `build-target-runtime-env.bats`); die Prod-Isolation
(Szenario 2) ist ebenfalls Quelltext-Pruefung ueber `website/src/pages`, aus demselben Grund.

- [ ] **T1 — Signal-Kern vollstaendig (`--ls-signal-{green,amber,red,info}`).**
      Positiv-Anker: Datei `website/src/styles/sdlc-leitstand.css` existiert. Dann je
      Signalname eine eigene Assertion (kein Sammel-Count, damit ein fehlender Einzelname
      benennbar bleibt):
      ```bash
      for sig in green amber red info; do
        grep -qE -- "--ls-signal-${sig}\s*:" "$CSS_FILE" \
          || { echo "fehlt: --ls-signal-${sig}"; return 1; }
      done
      ```

- [ ] **T2 — Token-Struktur deckt Surface-/Linien-/Text-Stufen, Mono-Typo, Abstands- und
      Radius-Schritte ab (Requirement-Text: "tiers", "steps", 2-4px).**
      ```bash
      surface_n=$(grep -cE -- '--ls-surface-[a-z0-9]+\s*:' "$CSS_FILE")
      line_n=$(grep -cE -- '--ls-line[a-z0-9-]*\s*:' "$CSS_FILE")
      text_n=$(grep -cE -- '--ls-text-[a-z0-9]+\s*:' "$CSS_FILE")
      mono_n=$(grep -icE -- '--ls-[a-z0-9-]*mono[a-z0-9-]*\s*:' "$CSS_FILE")
      space_n=$(grep -cE -- '--ls-space-[a-z0-9]+\s*:' "$CSS_FILE")
      [ "$surface_n" -ge 2 ]   # Stufen = Plural, mind. 2
      [ "$line_n" -ge 1 ]
      [ "$text_n" -ge 2 ]
      [ "$mono_n" -ge 1 ]
      [ "$space_n" -ge 3 ]     # "Schritte" = mind. 3 kompakte Abstufungen
      # Radii: jeder --ls-radius-* Wert liegt in [2px, 4px]
      grep -oE -- '--ls-radius-[a-z0-9]+\s*:\s*[0-9.]+px' "$CSS_FILE" | \
        awk -F: '{ gsub(/px| /,"",$2); if ($2+0 < 2 || $2+0 > 4) { print; exit 1 } }'
      ```
      Positiv-Anker liegt bereits in T1 (Datei existiert); dieser Test baut direkt darauf auf.

- [ ] **T3 — Glow/Puls nur fuer "laeuft gerade" (Requirement: "only for currently-running
      states") [Negativtest + Positiv-Anker, T002356-M1: Anker zuerst].**
      Kontrakt fuer p1: jede Regel mit `glow`/`pulse` im Selektor- oder Keyframe-Namen traegt
      zusaetzlich die Teilzeichenkette `running` im selben Selektor/Keyframe-Namen.
      ```bash
      # Positiv-Anker zuerst: es GIBT ueberhaupt eine running-gebundene Glow/Puls-Regel.
      awk '/\{/{sel=$0} /glow|pulse/ && sel ~ /running/{found=1} END{exit !found}' "$CSS_FILE"
      # Negativ: keine Glow/Puls-Deklaration OHNE "running" im umschliessenden Selektor.
      awk '
        /\{/ { sel=$0 }
        /(glow|pulse)/ && sel !~ /running/ { print NR": "sel; bad=1 }
        END { exit bad }
      ' "$CSS_FILE"
      ```

- [ ] **T4 — Print-Light ist Report-Layer, kein zweites interaktives Theme (Requirement:
      "solely as a report stylesheet (@media print scope), not as a second interactive
      theme") [Negativtest + Positiv-Anker].**
      ```bash
      # Positiv-Anker zuerst: @media print existiert und redefiniert mind. 1 --ls-Token.
      awk '/@media print/{inblock=1} inblock{print} /\}/{if(inblock)exit}' "$CSS_FILE" \
        | grep -qE -- '--ls-[a-z0-9-]+\s*:'
      # Negativ: ausserhalb von @media print kein Theme-Umschalt-Selektor.
      awk '
        /@media print/ { depth=1; next }
        depth { if (/\{/) depth++; if (/\}/) depth--; next }
        { print }
      ' "$CSS_FILE" | grep -qiE 'data-theme|theme-light' && return 1 || true
      ```

- [ ] **T5 — `design-system.astro` laedt `sdlc-leitstand.css` (Szenario "Showcase renders
      from tokens", erster Teil). Prüfmodus: Quelltext-Konvention, dokumentierter
      Ausnahmefall — Astro-Imports sind buildzeitig, kein Laufzeitnachweis offline noetig.**
      ```bash
      grep -qF 'sdlc-leitstand.css' website/src/pages/sdlc/design-system.astro
      ```

- [ ] **T6 — Komponenten-Previews nutzen `--ls-*` statt Ad-hoc-Hex (Szenario "Showcase
      renders from tokens", zweiter Teil; Muster `document-tokens-only.bats`)
      [Negativtest + Positiv-Anker].**
      ```bash
      # Positiv-Anker: Token-Datei definiert ueberhaupt Werte (T1 belegt das strukturell,
      # hier zusaetzlich lokal fuer Testunabhaengigkeit).
      grep -qE -- '--ls-[a-z0-9-]+\s*:' "$CSS_FILE"
      # Negativ: kein Hex-Farbwert im <style>-Block von design-system.astro.
      awk '/<style/{inblock=1} inblock{print} /<\/style>/{if(inblock)exit}' \
        website/src/pages/sdlc/design-system.astro \
        | grep -cE '#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?' | grep -qx 0
      ```

- [ ] **T7 — Prod-Build bleibt frei vom Leitstand-Stylesheet (Szenario "Prod build stays
      free of the Leitstand stylesheet") [Negativtest + Positiv-Anker].**
      ```bash
      # Positiv-Anker zuerst: SDLC-Seiten referenzieren die Datei ueberhaupt (T5 real).
      sdlc_hits=$(grep -rl 'sdlc-leitstand.css' website/src \
        --include='*.astro' --include='*.svelte' --include='*.ts' 2>/dev/null \
        | grep -c '/pages/sdlc/')
      [ "$sdlc_hits" -ge 1 ]
      # Negativ: ausserhalb von pages/sdlc/ referenziert NICHTS die Datei.
      prod_hits=$(grep -rl 'sdlc-leitstand.css' website/src \
        --include='*.astro' --include='*.svelte' --include='*.ts' 2>/dev/null \
        | grep -vc '/pages/sdlc/')
      [ "$prod_hits" -eq 0 ]
      ```

## File `tests/spec/sdlc-cockpit/api-inventory-drift.bats` (neu)

Header dokumentiert Output-Verifikation (T002448-M4): jeder Test FUEHRT den Scanner aus und
prueft `$status`/`$output`/erzeugtes JSON — kein Grep auf `scripts/sdlc/api-inventory.mjs`.
Verfuegbarkeits-Guard je Test: `command -v node >/dev/null 2>&1 || skip "node not installed"`.

- [ ] **T1 — Szenario "Deterministic regeneration": zwei Laeufe sind byte-identisch
      [Positiv-Anker vor der Gleichheitsaussage].**
      ```bash
      out1="$BATS_TEST_TMPDIR/a.json"; out2="$BATS_TEST_TMPDIR/b.json"
      API_INVENTORY_OUT="$out1" run node scripts/sdlc/api-inventory.mjs
      [ "$status" -eq 0 ]
      API_INVENTORY_OUT="$out2" run node scripts/sdlc/api-inventory.mjs
      [ "$status" -eq 0 ]
      # Positiv-Anker: es wurde tatsaechlich etwas gescannt — sonst waere Gleichheit trivial
      # (zwei leere Dateien sind auch "identisch").
      [ "$(jq '.routes | length' "$out1")" -gt 0 ]
      diff -q "$out1" "$out2"
      ```

- [ ] **T2 — Kernfelder: Routen mit Pfad/Methoden/Backend, MCP-Server-Liste,
      7 factory-mcp-Tools.**
      ```bash
      out="$BATS_TEST_TMPDIR/inv.json"
      API_INVENTORY_OUT="$out" run node scripts/sdlc/api-inventory.mjs
      [ "$status" -eq 0 ]
      # jede Route traegt path/methods/backend, methods ist nicht leer
      [ "$(jq '[.routes[] | select((has("path") and has("methods") and has("backend"))|not)] | length' "$out")" -eq 0 ]
      [ "$(jq '[.routes[] | select((.methods|length)==0)] | length' "$out")" -eq 0 ]
      # MCP-Server-Anzahl deckt sich mit der Registry (dynamischer Abgleich statt harter
      # Zahl — T002716, Semantik statt Darstellung: die Registry waechst ueber die Zeit)
      registry_n=$(awk '/^clients:/{f=1;next} f && /^[a-z]/{exit} f && /^  [a-zA-Z0-9_-]+:$/{n++} END{print n+0}' \
        docs/agent-guide/registry/mcp.yaml)
      [ "$(jq '.mcpServers | length' "$out")" -eq "$registry_n" ]
      # factory-mcp-Tools: 7 lt. design.md S5 (openspec_find_similar, factory_ask,
      # factory_enqueue, factory_queue, factory_recent, factory_status, factory_trigger)
      [ "$(jq '.factoryTools | length' "$out")" -eq 7 ]
      ```

- [ ] **T3 — Deterministisch sortiert, keine Zeitstempel.**
      ```bash
      out="$BATS_TEST_TMPDIR/inv.json"
      API_INVENTORY_OUT="$out" run node scripts/sdlc/api-inventory.mjs
      [ "$status" -eq 0 ]
      jq -e '.' "$out" >/dev/null   # Positiv-Anker: gueltiges, nicht-leeres JSON
      sorted=$(jq -r '[.routes[].path] | sort | join(",")' "$out")
      actual=$(jq -r '[.routes[].path] | join(",")' "$out")
      [ "$sorted" = "$actual" ]
      grep -qiE '"(generatedAt|timestamp|date)"' "$out" && return 1 || true
      ```

- [ ] **T4 — Szenario "Drift fails the gate" [Negativtest + Positiv-Anker; mutiert den
      committeten Artefaktpfad wie `task freshness:check` selbst — teardown stellt
      IMMER zurueck, siehe Taskfile-Kommentar zu Phase 1 der freshness:check-Task].**
      ```bash
      REAL="$REPO/website/src/data/api-inventory.json"
      setup() { [ -f "$REAL" ] && cp "$REAL" "$BATS_TEST_TMPDIR/orig.json" || true; }
      teardown() {
        if [ -f "$BATS_TEST_TMPDIR/orig.json" ]; then
          cp "$BATS_TEST_TMPDIR/orig.json" "$REAL"
        fi
        git -C "$REPO" checkout -- website/src/data/api-inventory.json 2>/dev/null || true
      }
      # Positiv-Anker: frisch regeneriert == committeter Stand (kein falsches Drift-Signal).
      run node scripts/sdlc/api-inventory.mjs
      [ "$status" -eq 0 ]
      run git -C "$REPO" diff --quiet -- website/src/data/api-inventory.json
      [ "$status" -eq 0 ]
      # Committerten Stand kuenstlich veralten lassen (simuliert "passt nicht mehr zu den
      # aktuellen Routen").
      jq '.routes = []' "$REAL" > "$BATS_TEST_TMPDIR/stale.json"
      cp "$BATS_TEST_TMPDIR/stale.json" "$REAL"
      run node scripts/sdlc/api-inventory.mjs   # regeneriert ueber den veralteten Stand
      [ "$status" -eq 0 ]
      run git -C "$REPO" diff --quiet -- website/src/data/api-inventory.json
      [ "$status" -eq 1 ]   # Abweichung erkannt
      run git -C "$REPO" diff --name-only -- website/src/data/api-inventory.json
      echo "$output" | grep -qF 'website/src/data/api-inventory.json'
      ```
      Zusaetzlich (Verdrahtung, Quelltext-Ausnahme dokumentiert — Konfigurationsaussage,
      analog `build-target-runtime-env.bats`):
      ```bash
      awk '/^  freshness:regenerate:/{f=1;next} f && /^  [a-z][a-zA-Z0-9:_-]*:$/{exit} f' \
        "$REPO/Taskfile.yml" | grep -qi 'api-inventory'
      ```

- [ ] **T5 — Szenario "Orphaned overlay entry fails" [Negativtest + Positiv-Anker, gueltiger
      Fall zuerst im selben Test].**
      ```bash
      valid="$BATS_TEST_TMPDIR/valid-overlay.yaml"
      invalid="$BATS_TEST_TMPDIR/invalid-overlay.yaml"
      cat > "$valid" <<'EOF'
      entries:
        - endpoint: /sdlc/api/qa-queue
          description: "Testfixture"
          tier: internal
      EOF
      cat > "$invalid" <<'EOF'
      entries:
        - endpoint: /sdlc/api/qa-queue
          description: "Testfixture"
          tier: internal
        - endpoint: /sdlc/api/does-not-exist-xyz
          description: "Verwaister Eintrag"
          tier: internal
      EOF
      # Positiv-Anker: gueltiges Overlay laeuft durch.
      API_OVERLAY_PATH="$valid" API_INVENTORY_OUT="$BATS_TEST_TMPDIR/ok.json" \
        run node scripts/sdlc/api-inventory.mjs
      [ "$status" -eq 0 ]
      # Negativ: verwaister Eintrag laesst die Generierung fehlschlagen und wird benannt.
      API_OVERLAY_PATH="$invalid" API_INVENTORY_OUT="$BATS_TEST_TMPDIR/bad.json" \
        run node scripts/sdlc/api-inventory.mjs
      [ "$status" -ne 0 ]
      echo "$output" | grep -qF 'does-not-exist-xyz'
      ```
      `/sdlc/api/qa-queue` ist eine real existierende Route
      (`website/src/pages/sdlc/api/qa-queue.ts`) — der Positiv-Fall haengt nicht an p2s
      Scan-Ergebnis, sondern an einer bereits im Repo vorhandenen Datei.

## RED — Failing-Test-Step (STRUCT2)

Beide Dateien werden mit diesem Plan committet (Stage-Commit) und laufen auf dem aktuellen
Branch rot, weil weder `sdlc-leitstand.css` noch `scripts/sdlc/api-inventory.mjs` noch
`docs/agent-guide/registry/api-overlay.yaml` existieren:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit*
# expected: FAIL (red — leitstand-ds-tokens.bats: website/src/styles/sdlc-leitstand.css fehlt
# (T1-T7 scheitern am Positiv-Anker "Datei existiert" bzw. am grep auf design-system.astro,
# das die Datei noch nicht laedt); api-inventory-drift.bats: scripts/sdlc/api-inventory.mjs
# fehlt (node-Aufruf schlaegt fehl, T1-T5 scheitern am ersten `run node ...`))
```

Nach p1 (Token-Set + `design-system.astro`-Umbau) sind T1-T7 in `leitstand-ds-tokens.bats`
gruen; nach p2 (Scanner + Overlay + Freshness-Verdrahtung) sind T1-T5 in
`api-inventory-drift.bats` gruen. Beide Partials sind laut `design.md` S8 disjunkt/parallel,
also kann jede Datei unabhaengig gruen werden.

## Test-Inventar

- [ ] **Inventar regenerieren.** Nach dem Anlegen beider `.bats`-Dateien:
      ```bash
      task test:inventory
      ```
      `website/src/data/test-inventory.json` mitcommitten — CI failt sonst am
      Inventar-Drift-Check.

## Finale Verifikation (STRUCT3)

- [ ] **Alle drei Pflicht-Gates.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
