#!/usr/bin/env bats
# tests/spec/local-llm-proxy.bats
# SSOT: openspec/specs/local-llm-proxy.md
# Konvention: eine .bats-Datei pro OpenSpec-SSOT-Spec.

PROXY_MOD="scripts/llm-proxy/server.mjs"
ROUTE="scripts/factory/route-provider.sh"

# Minimaler OpenAI-kompatibler Stub: $1=port $2=label $3=modelId
_start_stub() {
  local port="$1" label="$2" model="$3"
  node -e '
    const [port,label,model]=process.argv.slice(1);
    require("http").createServer((req,res)=>{
      let b=""; req.on("data",c=>b+=c); req.on("end",()=>{
        res.setHeader("content-type","application/json");
        if(req.url.startsWith("/v1/models"))
          return res.end(JSON.stringify({object:"list",data:[{id:model,object:"model"}]}));
        if(req.url.startsWith("/v1/chat/completions")){
          const m=(JSON.parse(b||"{}").model)||null;
          return res.end(JSON.stringify({backend:label,served:model,requested:m,
            choices:[{message:{role:"assistant",content:"ok"}}]}));
        }
        res.statusCode=404; res.end("{}");
      });
    }).listen(Number(port),"127.0.0.1");
  ' "$port" "$label" "$model" >/dev/null 2>&1 &
  echo $!
}

_free_port() { node -e 'const s=require("net").createServer();s.listen(0,()=>{console.log(s.address().port);s.close();})'; }

setup() {
  load 'test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  PORT_A="$(_free_port)"; PORT_B="$(_free_port)"; PROXY_PORT="$(_free_port)"
  PID_A="$(_start_stub "$PORT_A" backendA m1)"
  PID_B="$(_start_stub "$PORT_B" backendB m2)"
  # Registry-Override: der Proxy liest im Testmodus die Backends aus LLM_PROXY_BACKENDS_JSON
  # statt aus der DB (fail-closed auf DB, wenn Env fehlt — im Test immer gesetzt).
  export LLM_PROXY_PORT="$PROXY_PORT"
  export LLM_PROXY_BACKENDS_JSON="[
    {\"name\":\"a\",\"kind\":\"llamacpp\",\"baseUrl\":\"http://127.0.0.1:${PORT_A}/v1\",\"enabled\":true,\"priority\":1,\"fixups\":[],\"modelAliases\":{}},
    {\"name\":\"b\",\"kind\":\"lmstudio\",\"baseUrl\":\"http://127.0.0.1:${PORT_B}/v1\",\"enabled\":true,\"priority\":2,\"fixups\":[],\"modelAliases\":{}}]"
  PROXY_PID=""
}

teardown() {
  [ -n "$PROXY_PID" ] && kill "$PROXY_PID" 2>/dev/null || true
  kill "$PID_A" "$PID_B" 2>/dev/null || true
}

_start_proxy() {
  node "${REPO_ROOT}/${PROXY_MOD}" >/dev/null 2>&1 & PROXY_PID=$!
  for _ in $(seq 1 40); do
    # /livez, NICHT /health (T002336): diese Schleife fragt "laeuft der Prozess
    # schon", nicht "kann er bedienen". Seit /health Readiness meldet, antwortet
    # es mit 503, sobald ein Prio-1-Backend fehlt - und `curl -sf` wertet 503 als
    # Fehlschlag. Der Test "Alle Backends down" killt genau diese Backends VOR
    # dem Start und lief damit in den Timeout, obwohl der Proxy laengst lauschte.
    # Dieser Harnisch ist der erste echte Konsument, der Liveness braucht.
    curl -sf "http://127.0.0.1:${PROXY_PORT}/livez" >/dev/null 2>&1 && return 0
    sleep 0.25
  done
  return 1
}

# Skip if no shared-db pod is reachable (offline / CI without cluster).
# [T002439] Der Phasenfilter ist Teil der BEDINGUNG, nicht Kosmetik: ohne ihn liefert die
# Selektion auch einen Completed-Pod, der Skip bleibt aus, und das folgende `kubectl exec`
# endet mit rc=1 statt in einem sauberen Skip. Genau so entstand der "DB-Nachweis rc=1"
# im Verify von T002418.
_skip_if_no_db() {
  local _pod
  _pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-fleet}" \
    -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running \
    -o name 2>/dev/null | head -1) || true
  if [[ -z "$_pod" ]]; then
    skip "no Running shared-db pod reachable (offline/CI)"
  fi
}

@test "GET /v1/models aggregiert beide Backends (m1 + m2)" {
  _start_proxy
  run curl -sf "http://127.0.0.1:${PROXY_PORT}/v1/models"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"m1"'
  echo "$output" | grep -q '"m2"'
}

@test "Routing: exakte ID m2 -> Backend b via x-llm-proxy-backend" {
  _start_proxy
  run curl -sf -D - -o /dev/null \
    -H 'content-type: application/json' -d '{"model":"m2","messages":[]}' \
    "http://127.0.0.1:${PROXY_PORT}/v1/chat/completions"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi 'x-llm-proxy-backend: b'
  echo "$output" | grep -qi 'x-llm-proxy-served-model: m2'
}

@test "Stale ID -> Verfuegbarkeits-Fallback + x-llm-proxy-served-model" {
  _start_proxy
  run curl -sf -D - -o /dev/null \
    -H 'content-type: application/json' -d '{"model":"does-not-exist","messages":[]}' \
    "http://127.0.0.1:${PROXY_PORT}/v1/chat/completions"
  [ "$status" -eq 0 ]
  # hoechstpriores gesundes Backend ist a (prio 1) -> m1
  echo "$output" | grep -qi 'x-llm-proxy-served-model: m1'
}

@test "Alle Backends down -> 503 mit error.code no_backend" {
  kill "$PID_A" "$PID_B" 2>/dev/null; sleep 0.3
  _start_proxy
  run curl -s -o /tmp/llmproxy_body -w '%{http_code}' \
    -H 'content-type: application/json' -d '{"model":"m1","messages":[]}' \
    "http://127.0.0.1:${PROXY_PORT}/v1/chat/completions"
  [ "$output" = "503" ]
  grep -q '"no_backend"' /tmp/llmproxy_body
}

@test "route-provider.sh factory-implement sonnet -> Pin :18235 (kein :8093)" {
  _skip_if_no_db
  # Bis T002359 gab der Phase-Zweig den Pin bedingungslos zurueck — ohne Claim, ohne
  # Health-Check. Deshalb war eine Laufzeit-Assertion auf die baseUrl hier stabil.
  # Seit T002359 ist der Pin nur noch Kandidat #0: ist sein Slot belegt, waehlt die
  # Kette bewusst den naechsten Provider. Der Test wird darum in zwei Teile zerlegt.

  # Teil 1 — Konfiguration, deterministisch: der Pin fuer die implement-Phase muss auf
  # den Proxy zeigen. Das ist die eigentliche T002277-Aussage und haengt an keinem Slot.
  run bash -c "source '${REPO_ROOT}/scripts/factory/lib.sh'; factory_resolve; \
    factory_psql -t -A -c \"SELECT COALESCE(base_url,'') FROM tickets.factory_model_slots WHERE phase='implement'\""
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '127.0.0.1:18235'

  # Teil 2 — Laufzeit, zustandsabhaengig: welcher Kandidat gewinnt, entscheidet der
  # Slot-Zustand. Invariant bleibt aber, dass NIE das alte direkte llama.cpp-Backend
  # :8093 herauskommt — egal wie weit die Kaskade durchlaeuft.
  run bash "${REPO_ROOT}/${ROUTE}" factory-implement sonnet
  [ "$status" -eq 0 ]

  # Seit T002359 claimt der Aufruf einen echten Slot (vorher gab der Phase-Zweig den Pin
  # ohne Claim zurueck). Dieser Test laeuft gegen die LIVE-Registry — ohne Release traebe
  # ihn jeder Lauf naeher an max_concurrent und reproduzierte damit genau den Slot-Leak,
  # den das Ticket behebt. Freigabe vor den Assertions, damit ein Fehlschlag nichts leakt.
  local _slot; _slot="$(echo "$output" | jq -r '.slotId // empty' 2>/dev/null || true)"
  if [[ -n "$_slot" && "$_slot" != "null" ]]; then
    bash "${REPO_ROOT}/scripts/factory/release-slot.sh" "$_slot" true >/dev/null 2>&1 || true
  fi

  ! echo "$output" | grep -q ':8093'
}

# ── GBNF-Escape-Sanitizer (T002112) ───────────────────────────────────────────
# mcp-kubernetes liefert JSON-Schema-"pattern" mit \- in einer Zeichenklasse.
# In GBNF ist das kein gueltiges Escape -> llama.cpp verwirft die KOMPLETTE
# Tool-Call-Grammatik ("unknown escape") und der Slot laeuft unconstrained.

_sanitize() {  # $1 = pattern -> sanitisiertes Pattern auf stdout
  node -e '
    import("./scripts/llm-proxy/fixups.mjs").then(m => {
      process.stdout.write(m.sanitizeGbnfPattern(process.argv[1]));
    });
  ' "$1" 2>/dev/null
}

@test "sanitizeGbnfPattern: \\- in Zeichenklasse wandert ans Klassenende" {
  run _sanitize '^[/_.\-A-Za-z0-9=, ()!]+$'
  [ "$status" -eq 0 ]
  [ "$output" = '^[/_.A-Za-z0-9=, ()!-]+$' ]
}

@test "sanitizeGbnfPattern: erzeugt KEINE ungewollte Range (.-A)" {
  run _sanitize '^[/_.\-A-Za-z0-9=, ()!]+$'
  # Ein naives \- -> - haette '[/_.-A...' erzeugt: .-A waere eine Range 0x2E-0x41.
  ! echo "$output" | grep -q '\.-A'
}

@test "sanitizeGbnfPattern: \\- ausserhalb einer Klasse wird zum Literal -" {
  run _sanitize 'a\-b'
  [ "$output" = 'a-b' ]
}

@test "sanitizeGbnfPattern: Pattern ohne \\- bleibt unveraendert" {
  run _sanitize '^[a-z0-9-]+$'
  [ "$output" = '^[a-z0-9-]+$' ]
}

@test "sanitizeGbnfPattern: andere Escapes bleiben erhalten" {
  run _sanitize '^\d+\.\d+[\w\-]$'
  [ "$output" = '^\d+\.\d+[\w-]$' ]
}

@test "sanitizeGbnfPattern: negierte Klasse behaelt ^ und bekommt - ans Ende" {
  run _sanitize '[^\-a]'
  [ "$output" = '[^a-]' ]
}

@test "sanitizeToolSchemaPatterns: patcht verschachtelte tools[].pattern" {
  # node assertiert selbst und exit-codet - erspart das Escaping des
  # Erwartungswerts durch bash/bats hindurch.
  run node --input-type=module -e '
    import assert from "node:assert";
    import { sanitizeToolSchemaPatterns } from "./scripts/llm-proxy/fixups.mjs";
    const BS = String.fromCharCode(92);
    const pat = "^[/_." + BS + "-A-Za-z0-9=]+$";
    const body = { tools: [{ type: "function", function: { name: "pods_list",
      parameters: { type: "object", properties: {
        labelSelector: { type: "string", pattern: pat } } } } }] };
    const out = sanitizeToolSchemaPatterns(body);
    const got = out.tools[0].function.parameters.properties.labelSelector.pattern;
    assert.strictEqual(got, "^[/_.A-Za-z0-9=-]+$", "Pattern nicht korrekt entschaerft");
    assert.strictEqual(body.tools[0].function.parameters.properties.labelSelector.pattern,
      pat, "Original-Body wurde mutiert");
  ' 2>/dev/null
  [ "$status" -eq 0 ]
}

@test "sanitizeToolSchemaPatterns: Body ohne tools bleibt unangetastet" {
  run node -e '
    import("./scripts/llm-proxy/fixups.mjs").then(m => {
      const body = { messages:[{role:"user",content:"hi"}] };
      process.stdout.write(JSON.stringify(m.sanitizeToolSchemaPatterns(body)));
    });
  '
  [ "$output" = '{"messages":[{"role":"user","content":"hi"}]}' ]
}

@test "server.mjs wendet den Sanitizer unbedingt an (nicht als DB-Opt-in)" {
  # Ein Korrektheits-Fix, den man erst in llm_proxy_backends.fixups aktivieren
  # muss, ist genau dann aus, wenn er gebraucht wird.
  grep -q 'sanitizeToolSchemaPatterns' "${BATS_TEST_DIRNAME}/../../scripts/llm-proxy/server.mjs"
}

# ── systemd-Unit + Registry-Migration (T002277) ───────────────────────
# Der Proxy lief bis 2026-07-27 ausschliesslich als manuell gestarteter
# Node-Prozess; nach jedem Reboot war die Factory ohne Zutun tot.

@test "llm-proxy.service existiert und startet server.mjs (T002277)" {
  local unit="${BATS_TEST_DIRNAME}/../../scripts/llm-proxy/llm-proxy.service"
  [ -f "$unit" ]
  grep -qE '^ExecStart=.*/node .*/scripts/llm-proxy/server\.mjs$' "$unit"
  grep -qE '^WantedBy=default\.target$' "$unit"
}

@test "llm-proxy.service hat kubectl im PATH (T002277)" {
  # Die Backend-Registry wird per `kubectl exec ... psql` gelesen
  # (scripts/factory/lib.sh). kubectl liegt unter /usr/local/bin, das die
  # systemd-Default-PATH NICHT enthaelt - ohne diese Zeile laeuft der Proxy
  # dauerhaft mit leerer Backend-Liste und meldet trotzdem /health ok.
  grep -qE '^Environment=PATH=.*(/usr/local/bin)' \
    "${BATS_TEST_DIRNAME}/../../scripts/llm-proxy/llm-proxy.service"
}

@test "proxy:start erkennt eine bereits laufende systemd-Instanz (T002277)" {
  # Das PID-File kennt nur die nohup-Instanz. Ohne Port-Pruefung wuerde ein
  # zweiter Start mit EADDRINUSE sterben und ein PID-File hinterlassen, das auf
  # einen toten Prozess zeigt.
  # T002336, zwei Korrekturen an diesem Guard:
  #   1. Der grep lief ueber die GANZE Datei und war damit falsch-gruen: er fand
  #      das Muster in proxy:status, waehrend proxy:start laengst /livez nutzte.
  #      Jetzt wird wie beim install-service-Guard erst der Block geschnitten.
  #   2. Das Muster akzeptiert livez UND health - geprueft wird die Absicht aus
  #      dem Testnamen (ein HTTP-Port-Check existiert), nicht der Endpunktname.
  run bash -c "sed -n '/^  proxy:start:/,/^  [a-z]/p' \
    '${BATS_TEST_DIRNAME}/../../Taskfile.llm.yml' \
    | grep -cE 'curl .*127\.0\.0\.1:\\\$PORT/(livez|health)'"
  [ "$output" != "0" ]
}

@test "Gemma-Migration registriert das Backend mit Alias (T002277)" {
  local mig="${BATS_TEST_DIRNAME}/../../scripts/migrations/2026-07-27-llm-proxy-gemma-backend.sql"
  [ -f "$mig" ]
  # Der Alias ist die einzige Zusage, dass 'gemma-4-12b' auf diesem Backend
  # landet - resolveModel() biegt unbekannte Modelle sonst still auf das erste
  # gesunde Backend um.
  grep -q '"gemma-4-12b"' "$mig"
  grep -qE "llamacpp-gemma" "$mig"
}

@test "route-provider.sh liest tier=opus aus der Registry (T002277)" {
  # Vorher stand hier ein hardcodiertes Modell, das die DB komplett umging.
  local rp="${BATS_TEST_DIRNAME}/../../scripts/factory/route-provider.sh"
  run bash -c "grep -E \"OPUS_MODEL=.ternary-bonsai-27b\" '$rp'"
  [ "$status" -ne 0 ]
  grep -qE "tier='opus'" "$rp"
}

@test "route-provider.sh claimt fuer tier=opus keinen Slot (T002277)" {
  # opus liefert slotId:null - es gibt beim Aufrufer keinen Release-Pfad. Ginge
  # es durch die normale Claim-Kette, waere der Provider nach max_concurrent
  # Aufrufen dauerhaft blockiert.
  run bash scripts/factory/route-provider.sh factory-plan opus
  [ "$status" -eq 0 ]
  echo "${lines[${#lines[@]}-1]}" | jq -e '.slotId == null'
}

# ── T002281: install-service prueft den tatsaechlichen Zustand ────────
# Bei der Live-Installation am 2026-07-27 lief die Altinstanz weiter (PID-File
# gueltig, kill -0 erfolgreich, Block griff trotzdem nicht) und die frische Unit
# fiel in eine EADDRINUSE-Restart-Schleife. Nur im Journal sichtbar -
# 'systemctl is-active' meldete 'activating', was wie ein langsamer Start aussieht.

@test "proxy:install-service prueft den Port, nicht nur das PID-File (T002281)" {
  # Derselbe Check, den proxy:start seit T002277 hat. Das PID-File kennt nur die
  # nohup-Instanz und luegt, sobald der Port anderweitig belegt ist.
  # T002336: das Muster akzeptiert livez UND health. Geprueft wird die ABSICHT
  # aus dem Testnamen - "es gibt einen HTTP-Port-Check" -, nicht der Endpunktname.
  # Der Aufruf steht inzwischen auf /livez, weil /health seit T002336 Readiness
  # meldet: ein 503 bei totem Backend haette die Kill-Schleife als "Port frei"
  # gelesen und die Altinstanz ueberleben lassen - genau der T002281-Fall.
  run bash -c "sed -n '/proxy:install-service:/,/^  [a-z]/p' \
    '${BATS_TEST_DIRNAME}/../../Taskfile.llm.yml' | grep -cE 'curl .*(livez|health)'"
  [ "$output" != "0" ]
}

@test "proxy:install-service verifiziert den Unit-Zustand nach enable (T002281)" {
  # 'Erfolgsmeldung ohne Pruefung' - dieselbe Klasse, die T002276 bei schtasks
  # gefunden hat. enable --now kann erfolgreich zurueckkehren, waehrend die Unit
  # in auto-restart haengt.
  run bash -c "sed -n '/proxy:install-service:/,/^  [a-z]/p' \
    '${BATS_TEST_DIRNAME}/../../Taskfile.llm.yml' | grep -cE 'is-active|ActiveState'"
  [ "$output" != "0" ]
}

# ── Readiness (T002336) ───────────────────────────────────────────────
# Der Wrapper hat zwei Aufgaben. Erstens faehrt er die node-Suite ueberhaupt:
# scripts/llm-proxy/server.test.mjs war bis T002336 in KEINEM Taskfile-Target
# und in KEINEM CI-Job eingebunden - die Tests existierten, liefen aber nie.
# Zweitens bringt er die Suite unter task test:all, das die spec-Reihe faehrt.
# Muster uebernommen von "FA-SF-40: node --test provision suite passes".
@test "T002336: node --test llm-proxy suite passes (readiness + routing)" {
  run node --test "${BATS_TEST_DIRNAME}/../../scripts/llm-proxy/server.test.mjs"
  [ "$status" -eq 0 ]
  [[ "$output" == *"fail 0"* ]]
}

@test "T002336: /health meldet 503 bei totem Prio-1-Backend, /livez bleibt 200" {
  # Das Gegenstueck zu den reinen evaluateReadiness-Tests in server.test.mjs:
  # hier zaehlt der HTTP-STATUS, den die Delta-Spec fordert. Backend "a" ist
  # priority 1, "b" priority 2 (siehe setup); beide Stubs sterben, also ist der
  # lokale Primaerpfad weg.
  kill "$PID_A" "$PID_B" 2>/dev/null; sleep 0.3
  _start_proxy

  run curl -s -o /tmp/llmproxy_health -w '%{http_code}' "http://127.0.0.1:${PROXY_PORT}/health"
  [ "$output" = "503" ]
  grep -q '"ready":false' /tmp/llmproxy_health
  # Der Aufrufer muss sehen, WELCHES Backend fehlt - nicht nur, dass etwas fehlt.
  grep -q '"name":"a"' /tmp/llmproxy_health

  run curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PROXY_PORT}/livez"
  [ "$output" = "200" ]
}

# --- T002394: Loadout-Registry -------------------------------------------------
@test "T002394: loadouts.json ist gueltiges JSON mit mindestens einem Loadout" {
  run node -e 'const d=require("./scripts/llm/loadouts.json"); if(!Array.isArray(d.loadouts)||!d.loadouts.length) process.exit(1); console.log(d.loadouts.length)'
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "T002394: kein Loadout MIT --fit pinnt ctx oder ngl (--fit-Regression)" {
  # T002426: auf fit-Loadouts eingegrenzt. Ein gesetztes -c/-ngl schaltet dort
  # die VRAM-Anpassung ab - das ist die Regression. Bei fit.enabled=false ist
  # das Setzen dagegen PFLICHT (validateLoadout in scripts/llm-proxy/loadouts.mjs),
  # sonst laeuft der llama.cpp-Default -c 0 ins OOM. Die pauschale Fassung haette
  # jedes bewusst CPU-gebundene Loadout verboten.
  # Der 'checked'-Zaehler ist der Positiv-Anker: ohne ihn bestuende der Test
  # vakuos, sobald gar kein fit-Loadout mehr in der Datei steht.
  run node -e '
    const d=require("./scripts/llm/loadouts.json");
    let checked=0;
    d.loadouts.forEach(l => {
      if(l.fit && l.fit.enabled===true){
        checked++;
        if(l.args.ctx!==null){console.error(l.slug+": ctx ist "+l.args.ctx);process.exitCode=1}
        if(l.args.ngl!==null){console.error(l.slug+": ngl ist "+l.args.ngl);process.exitCode=1}
      }
    });
    if(checked===0){console.error("kein --fit-Loadout geprueft");process.exitCode=1}
  '
  [ "$status" -eq 0 ]
}

@test "T002394/T002459: Ports sind eindeutig unter gleichzeitig lauffaehigen Loadouts" {
  # Nicht global eindeutig: zwei Profile desselben Modells (gemma-factory und
  # gemma-multiagent) teilen sich bewusst :8091, weil sie in derselben
  # exclusiveGroup liegen und nie zusammen laufen. Geprueft wird deshalb, ob
  # zwei Loadouts mit gleichem Port auch wirklich einander ausschliessen.
  run node -e '
    const d = require("./scripts/llm/loadouts.json");
    const withPort = d.loadouts.filter(l => l.port != null);
    if (!withPort.length) { console.error("kein Loadout mit Port"); process.exit(2) }
    const seen = new Map();
    for (const l of withPort) {
      const prev = seen.get(l.port);
      if (prev === undefined) { seen.set(l.port, l.exclusiveGroup ?? null); continue }
      if (prev == null || prev !== l.exclusiveGroup) {
        console.error(`${l.slug}: Port ${l.port} doppelt, aber Gruppen ${prev} != ${l.exclusiveGroup}`);
        process.exit(1)
      }
    }
    console.log(`geprueft: ${withPort.length} Loadouts`);
  '
  echo "$output"
  [ "$status" -eq 0 ]
  # Positiv-Anker: exit 2 hiesse, es gab gar nichts zu pruefen.
  [[ "$output" == *"geprueft: "* ]]
}

@test "T002394: server.mjs importiert loadouts/models/runner Module" {
  grep -qE "from './loadouts.mjs'" "${BATS_TEST_DIRNAME}/../../scripts/llm-proxy/server.mjs"
  grep -qE "from './models.mjs'" "${BATS_TEST_DIRNAME}/../../scripts/llm-proxy/server.mjs"
  grep -qE "from './runner.mjs'" "${BATS_TEST_DIRNAME}/../../scripts/llm-proxy/server.mjs"
}

@test "T002394: /admin/* Routen sind in server.mjs definiert" {
  grep -qE "'/admin/models'" "${BATS_TEST_DIRNAME}/../../scripts/llm-proxy/server.mjs"
  grep -qE "'/admin/loadouts'" "${BATS_TEST_DIRNAME}/../../scripts/llm-proxy/server.mjs"
  grep -qE "'/admin/loadouts/status'" "${BATS_TEST_DIRNAME}/../../scripts/llm-proxy/server.mjs"
  grep -qE "loadouts.*start" "${BATS_TEST_DIRNAME}/../../scripts/llm-proxy/server.mjs"
  grep -qE "loadouts.*stop" "${BATS_TEST_DIRNAME}/../../scripts/llm-proxy/server.mjs"
}

@test "T002394: /admin Route serviert HTML (ui/index.html)" {
  grep -qE "'/admin'|'/admin/'.*GET" "${BATS_TEST_DIRNAME}/../../scripts/llm-proxy/server.mjs"
  [ -f "${BATS_TEST_DIRNAME}/../../scripts/llm-proxy/ui/index.html" ]
}
