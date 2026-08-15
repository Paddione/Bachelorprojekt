# P2 — Guards: support-model-slots.bats (T006840)

Rolle: **tests**. Trägt den STRUCT2-Failing-Test-Step des Gesamtplans (D5 aus design.md): eine
neue BATS-Datei `tests/spec/local-llm-proxy/support-model-slots.bats` (Konvention T002416 —
eigene Datei pro Vorgang im Verzeichnis `tests/spec/local-llm-proxy/`; der Runner erfasst sie
automatisch über `bats -r tests/spec/`, ein Registry-Eintrag ist nicht nötig — der
`proxy-tests-registered`-Guard deckt nur `scripts/llm-proxy/*.test.mjs` ab).

BATS-Runner: `tests/unit/lib/bats-core/bin/bats` (vendored — NICHT `which bats`).
Syntax-Probe für die neue Datei: `tests/unit/lib/bats-core/bin/bats --count
tests/spec/local-llm-proxy/support-model-slots.bats` (`bash -n` taugt nicht für `.bats`,
T002351-M2).

**S1-Budget (wirksame Schwelle):** Die neue Datei ist **nicht S1-gemessen**. Beleg:
`jq -r 'keys[]' docs/code-quality/baseline.json` liefert nichts (baseline.json ist `{}`, 4
Bytes), und `docs/code-quality/gates.yaml` → `s1.limits` kennt keine `.bats`-Extension
(nur .astro/.ts/.svelte/.sh/.mjs/.mts/.py/.js/.jsx/.tsx/.cjs/.bash/.java/.php);
`scripts/code-quality/gates/s1-filesize.mjs` überspringt Extensions ohne Limit
(`if (limit === undefined) return null`). Es gilt also **kein Zeilenlimit und keine
Baseline** — kein Budget-Claim im B1a-Sinn. Größenorientierung am Bestand des Verzeichnisses:
`bge-role-routes.bats` 145 Zeilen, `gemma-kv-quant.bats` 268 Zeilen; die neue Datei bleibt
deutlich darunter (~120–160 Zeilen inkl. Kopfkommentar).

**S3:** Alle Snippets nutzen ausschließlich `127.0.0.1`/localhost — keine Brand-Domain-Literale.

## File `tests/spec/local-llm-proxy/support-model-slots.bats` (net-new)

Kopfkommentar der Datei dokumentiert: Ticket T006840, SSOT `openspec/specs/local-llm-proxy.md`,
Prüfmodus je Test (T002448-M4) und den Skip-Guard (T002716 — CI hat weder Geräte noch
Proxy, dort skippt nur Testfall 3; die rot→grün-Entscheidung des Changes tragen die
Testfälle 1 und 2, die ohne laufenden Proxy auskommen).

### Task P2.1 — Testfall 1 (RED, Positiv-Aussage): Slots im `lmstudio`-Block deklariert

- [ ] Prüfmodus im Kopf: **Quelltext-Lint auf eine Konfigurationsdatei** — die dokumentierte
      T002448-M4-Ausnahme (der Prüfgegenstand IST der Dateiinhalt von
      `.opencode/agent-models.jsonc`; dasselbe Muster wie `gateway-consumer-lint.bats`).
- [ ] `setup()`: `REPO_ROOT` auflösen (wie in den Bestandsdateien des Verzeichnisses),
      `MODEL_FILE="${REPO_ROOT}/.opencode/agent-models.jsonc"`.
- [ ] Bereich auf den `lmstudio`-Block **eingrenzen** (T003104 — keine Position des ersten
      Zufallstreffers im ganzen Dokument messen): awk-Bereichsmuster von `"lmstudio": {`
      bis zum Ende des Provider-Blocks (Schließmuster am Ist-Stand der Datei verifizieren
      und im Test kommentieren); der `deepseek`-Block ist im selben Dokument und muss
      außen vor bleiben.
- [ ] Kommentarzeilen ausschließen (`grep -vE '^[[:space:]]*(#|//)'` — Muster
      `_active_lines` aus `gateway-consumer-lint.bats`).
- [ ] Assertions (run + `$output`, formatfrei, T002716): der `lmstudio`-Block enthält
      `"gemma-4-12b@ud-iq3_xxs"` UND `"qwen3.5-4b@q6_k"` — je `grep -e '…'` (T003108:
      `-e`, kein `-F '--flag'`-Muster), Trefferzahl == 1 je Slot.
- [ ] Dieser Test ist der **STRUCT2-Failing-Test**: ohne p1 (Slots nicht deklariert)
      schlägt er rot; er wird VOR der p1-Implementierung eingecheckt (siehe Task P2.4).

### Task P2.2 — Testfall 2 (Negativ mit Positiv-Anker, T002356-M1): keine `:1234`-/`:8093`-Literale in den neuen Einträgen

- [ ] **Positiv-Anker zuerst im selben Test** (Reihenfolge-Pflicht T002356-M1): beide Slots
      sind deklariert — dieselbe Assertion wie Testfall 1 (wiederverwendete Helper-Funktion
      aus P2.1). Ohne den Anker wäre „kein Port-Literal in []“ trivial erfüllt, sobald die
      Slots fehlen.
- [ ] Danach die Negativ-Aussage, **gezielt auf die zwei neuen Einträge** (nicht auf die
      ganze Datei — die deckt der `gateway-consumer-lint` T002582 bereits global ab):
      awk-Bereich je Slot-Eintrag (von der Slot-Key-Zeile bis zur schließenden `}` des
      Eintrags, am Ist-Stand verifizieren), Kommentarzeilen ausgeschlossen, dann
      `grep -cE ':1234|:8093'` == 0.
- [ ] Begründung im Kopfkommentar: die Provider-Definition mit baseURL lebt in
      `.opencode/opencode.jsonc` und ist keine tracked surface; die Einträge in
      `agent-models.jsonc` bleiben portfrei (die Slots werden über den llm-proxy :18235
      erreicht, nie direkt über ein Backend).

### Task P2.3 — Testfall 3 (Erreichbarkeit mit Skip-Guard): beide Slots in `:18235/v1/models`

- [ ] `setup()`: `load helpers/llm-endpoint` (bestehender Helper, exakt
      `helpers/llm-endpoint.bash` — KEIN neuer Helper) und
      `PROXY_URL="${LLM_PROXY_URL:-http://127.0.0.1:18235}"` (Muster `bge-role-routes.bats`).
- [ ] `_require_proxy()` exakt nach dem vorhandenen Muster übernehmen:

```bash
_require_proxy() {
  local code
  if ! code=$(llm_endpoint_healthy "${PROXY_URL}/v1/models" 5); then
    skip "llm-proxy auf ${PROXY_URL} nicht erreichbar (HTTP ${code}) — kein Aussagewert"
  fi
}
```

- [ ] Ablauf: `_require_proxy` → `run curl -s --max-time 10 "${PROXY_URL}/v1/models"`
      → `jq -r '.data[].id'` → beide Slot-Namen (`gemma-4-12b@ud-iq3_xxs`,
      `qwen3.5-4b@q6_k`) erscheinen in der Liste (je `grep -e`-Probe, formatfrei).
- [ ] **D1-Verifikationsschritt:** lokal MIT laufenden Geräten ausführen und prüfen, dass
      die Discovery-IDs exakt den Slot-Namen entsprechen; weicht die gemeldete ID ab,
      folgt der Eintrag in `agent-models.jsonc` (p1) — und damit der erwartete String in
      diesem Test — der gemeldeten ID (D1, design.md). Der Live-Check (Befehl + Stand,
      T002717) wird im Kopfkommentar des Tests dokumentiert. In CI skippt dieser Test
      (kein Proxy/Geräte) — das ist gewollt, die rot→grün-Gate-Funktion liegt bei den
      Testfällen 1 und 2.

### Task P2.4 — Failing-Test-Step (STRUCT2, RED) + Inventar

- [ ] Die neue Datei wird VOR der p1-Implementierung geschrieben und eingecheckt.
      Roter Lauf:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/support-model-slots.bats
# expected: FAIL — die Slots "gemma-4-12b@ud-iq3_xxs" und "qwen3.5-4b@q6_k" sind in
# .opencode/agent-models.jsonc noch nicht deklariert; Testfall 1 und der Positiv-Anker
# von Testfall 2 schlagen rot (Testfall 3 skippt ohne erreichbaren Proxy).
```

- [ ] Syntax-Probe vor dem Rot-Lauf: `tests/unit/lib/bats-core/bin/bats --count
      tests/spec/local-llm-proxy/support-model-slots.bats` — meldet 3 Tests, rc 0.
- [ ] Nach p1 (GREEN): derselbe Runner-Aufruf ist grün (Testfall 3 skippt, wenn
      llm-proxy/Geräte offline sind); die bestehenden Guards des Verzeichnisses bleiben
      grün (`tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy/` — beide
      Formen erfassen, T002696: auch die Sammeldatei `tests/spec/local-llm-proxy.bats`
      einmal mitlaufen lassen).
- [ ] **Test-Inventory regenerieren** (CI-Gate): `task test:inventory` ausführen und die
      regenerierte `website/src/data/test-inventory.json` im selben Commit mitcommitten —
      der CI-Inventar-Check failt sonst bei jeder Test-Änderung.

### Task P2.5 — Commit-Konvention und K3-Folge-Bezug (GEMESSEN-Erweiterung)

- [ ] Commit-Konvention (Budget-Integrität B1a/B1b): der Implementer committet die
      Testdatei und das regenerierte Inventar als einen Commit mit dem Präfix
      `test(llm): … [T006840]` (die p1-Config-Änderung bleibt ein eigener
      `feat`/`chore`-Commit — kein Vermischen der Rollen-Partials).
- [ ] **Folge-Schritt-Bezug statt Platzhalter (D3, design.md):** Dieser Guard prüft
      bewusst nur die Slot-**Deklaration**, nicht die `limit`-Werte. Nach dem K3-
      Vulkan-Messschritt (User-Task T006840, Ergebnis als Ticket-Kommentar mit
      ausführbarem Mess-Befehl, T002717) wird die Datei um eine
      **GEMESSEN-Limit-Prüfung** erweitert — als Folge-Task im selben Ticket, der die
      gemessenen `limit.context`/`limit.output`-Werte gegen die Deklaration sichert
      (Muster der llama.cpp-Loadouts, Kommentar mit Messlauf + Datum). Bis dahin gilt
      die statische Deklaration (32768/8192) als Auto-Compact-Grenze für opencode und
      ist bewusst kein Prüfgegenstand dieses Partials.

## Verifikation

Der finale Verify-Task des Gesamtplans (STRUCT3 mit `task test:changed`,
`task freshness:regenerate`, `task freshness:check`) steht in `tasks.md` — dieses Partial
liefert den Failing-Test-Step (Task P2.4) und die lokale GREEN-Verifikation über den
Runner-Aufruf aus Task P2.4.
