#!/usr/bin/env bats
# tests/spec/local-llm-proxy/gemma-loadout-autorestart-queue.bats
# SSOT: openspec/specs/local-llm-proxy.md
# Ticket: T002459 (Task P5.5)
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Geprueft
# werden Laufzeitergebnisse — buildStartCommand/buildServerArgv/planAutoStart
# werden aufgerufen und ihre Rueckgaben in node assertiert, plus ein HTTP-Request
# gegen einen real gestarteten Proxy. Kein grep nach Flag-Namen in server.mjs
# oder runner.mjs.
#
# BEWUSST NICHT hier: der echte Kill-und-Neustart-Zyklus, die --collect-
# Aufraeumung und der Live-Cutover-Smoke-Test. Die brauchen einen GPU-Host und
# User-systemd; sie stehen in den Live-Verifikations-Tasks von P2 und P4.
#
# Der Harnisch (_free_port/_start_stub/_start_proxy) ist aus
# tests/spec/local-llm-proxy.bats uebernommen statt per `load` geteilt: die
# Sammeldatei exportiert keine Helper, und sie dafuer umzubauen hiesse fremden
# Scope anfassen.
#
# Assertion-Hygiene: kein unqualifiziertes [[ "$output" == *"term"* ]] gegen
# volles stdout+stderr. Mehrere Skripte drucken $0 in ihrer Usage, und das
# Worktree heisst 'llama-stack-T002459' — ein Substring-Treffer auf 'llama'
# waere trivial erfuellbar, ohne dass die gepruefte Funktion existiert. Deshalb
# liegen die Assertions in node, wo assert den Exit-Code setzt.

PROXY_MOD="scripts/llm-proxy/server.mjs"

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
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  PORT_A="$(_free_port)"; PORT_B="$(_free_port)"; PROXY_PORT="$(_free_port)"
  PID_A="$(_start_stub "$PORT_A" backendA m1)"
  PID_B="$(_start_stub "$PORT_B" backendB m2)"
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
    curl -sf "http://127.0.0.1:${PROXY_PORT}/livez" >/dev/null 2>&1 && return 0
    sleep 0.25
  done
  return 1
}

# --- 1) Requirement "Loadout autorestart on failure" -----------------------

@test "buildStartCommand setzt Restart-Properties VOR dem --Trenner" {
  run node --input-type=module -e "
    import assert from 'node:assert/strict';
    const { buildStartCommand } = await import('file://${REPO_ROOT}/scripts/llm-proxy/runner.mjs');
    const lo = { slug: 'probe', port: 9999, args: {}, fit: { enabled: true } };
    const cmd = buildStartCommand(lo, '/m.gguf', { host: '127.0.0.1' }, '/bin/llama-server');

    const iRestart = cmd.indexOf('--property=Restart=on-failure');
    const iSec     = cmd.indexOf('--property=RestartSec=5');
    const iSep     = cmd.indexOf('--');
    assert.ok(iRestart >= 0, 'Restart=on-failure fehlt');
    assert.ok(iSec >= 0, 'RestartSec=5 fehlt');
    assert.ok(iSep >= 0, 'der --Trenner fehlt');
    // systemd-run wertet Properties nur VOR dem Trenner; danach gehoeren sie
    // zur Kommandozeile des Kindprozesses und werden stumm ignoriert.
    assert.ok(iRestart < iSep, 'Restart steht hinter dem --Trenner');
    assert.ok(iSec < iSep, 'RestartSec steht hinter dem --Trenner');
    // --collect muss bleiben: ohne es blockiert eine failed Unit den Namen.
    assert.ok(cmd.includes('--collect'), '--collect fehlt');
    console.log('ok');
  "
  echo "$output"
  [ "$status" -eq 0 ]
}

# --- 2) Requirement "Gemma single-agent and shared multi-agent profiles" ----

@test "gemma26-factory steht in der ausgelieferten Registry und laesst -fit intakt" {
  run node --input-type=module -e "
    import assert from 'node:assert/strict';
    const { readLoadouts } = await import('file://${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs');
    const { doc } = readLoadouts('${REPO_ROOT}/scripts/llm/loadouts.json');
    const by = (s) => doc.loadouts.find((l) => l.slug === s);

    const f = by('gemma26-factory');
    assert.ok(f, 'gemma26-factory fehlt');

    assert.equal(f.port, 8091, 'Port muss 8091 sein');
    assert.equal(f.fit?.enabled, true, 'fit muss aktiv sein');
    assert.ok(f.fit.targetMarginMib != null, 'targetMarginMib fehlt');
    assert.ok(f.fit.minCtx != null, 'minCtx fehlt');
    // Ein gesetztes ctx/ngl schaltet die VRAM-Anpassung ab — dann waere -fit tot.
    assert.equal(f.args.ctx, null, 'ctx darf nicht gepinnt sein');
    assert.equal(f.args.ngl, null, 'ngl darf nicht gepinnt sein');
    assert.equal(f.args.parallel, 3, 'gemma26-factory ist das 3-Slot-Profil');
    console.log('ok');
  "
  echo "$output"
  [ "$status" -eq 0 ]
}

# --- 3) Szenario "Starting one Gemma profile blocks the other" --------------

@test "alle GPU-Chat-Loadouts schliessen einander per exclusiveGroup aus" {
  # Der 409-port_busy-Pfad in server.mjs greift genau dann, wenn zwei Loadouts
  # dieselbe exclusiveGroup ("chat-gpu") teilen und eines aktiv ist.
  run node --input-type=module -e "
    import assert from 'node:assert/strict';
    const { readLoadouts } = await import('file://${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs');
    const { doc } = readLoadouts('${REPO_ROOT}/scripts/llm/loadouts.json');

    // POSITIV-ANKER (T002356-M1): es muss weiterhin ein Loadout OHNE exclusiveGroup geben (bge-cpu).
    const solo = doc.loadouts.filter((l) => !l.exclusiveGroup);
    assert.ok(solo.length > 0, 'kein Loadout ohne exclusiveGroup — Anker verloren');

    const chatGpu = doc.loadouts.filter((l) => l.exclusiveGroup === 'chat-gpu');
    assert.ok(chatGpu.length >= 2,
      'erwartet mindestens zwei Loadouts in chat-gpu, sonst ist der Ausschluss gegenstandslos');
    console.log('solo=' + solo.length + ' chatGpu=' + chatGpu.length);
  "
  echo "$output"
  [ "$status" -eq 0 ]
}

# --- 4) -kvu nur im Multi-Agent-Profil --------------------------------------

@test "gemma26-factory traegt -kvu, gptoss-context nicht" {
  run node --input-type=module -e "
    import assert from 'node:assert/strict';
    const { readLoadouts } = await import('file://${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs');
    const { buildServerArgv } = await import('file://${REPO_ROOT}/scripts/llm-proxy/runner.mjs');
    const { doc } = readLoadouts('${REPO_ROOT}/scripts/llm/loadouts.json');
    const argv = (s) => buildServerArgv(
      doc.loadouts.find((l) => l.slug === s), '/m.gguf', { host: '127.0.0.1' }, {});

    // Mit -kvu ist der Kontext ein GEMEINSAMER Pool ueber alle Slots; ohne es
    // teilt llama.cpp ihn stur durch die Slotzahl. Das ist der inhaltliche
    // Unterschied beider Profile.
    assert.ok(argv('gemma26-factory').includes('-kvu'), 'gemma26-factory ohne -kvu');
    // Anker in derselben Pruefung: beim Single-Slot-Profil waere -kvu wirkungslos
    // und wuerde die Kommandozeilen nur schwerer vergleichbar machen.
    assert.ok(!argv('gptoss-context').includes('-kvu'), 'gptoss-context traegt faelschlich -kvu');
    console.log('ok');
  "
  echo "$output"
  [ "$status" -eq 0 ]
}

# --- 5/6) Requirement "Auto-start and queue" --------------------------------

@test "planAutoStart startet ein gestopptes, konfliktfreies Loadout" {
  run node --input-type=module -e "
    import assert from 'node:assert/strict';
    const { readLoadouts, planAutoStart } = await import('file://${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs');
    const { doc } = readLoadouts('${REPO_ROOT}/scripts/llm/loadouts.json');
    const r = planAutoStart({ doc, model: 'gemma26-factory', activeSlugs: [] });
    assert.equal(r.action, 'start');
    assert.equal(r.slug, 'gemma26-factory');
    console.log('ok');
  "
  echo "$output"
  [ "$status" -eq 0 ]
}

@test "planAutoStart meldet Konflikt statt zu stoppen und laesst den Zustand unveraendert" {
  run node --input-type=module -e "
    import assert from 'node:assert/strict';
    const { readLoadouts, planAutoStart } = await import('file://${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs');
    const { doc } = readLoadouts('${REPO_ROOT}/scripts/llm/loadouts.json');

    // T003204: fuehrt zwei AKTIVE Loadouts derselben exclusiveGroup. Vorher
    // standen hier gptoss-context und devstral-quality — beide sind seither
    // abgeschaltet, und planAutoStart liefert fuer sie 'none' statt
    // 'start'/'conflict'. Der Test prueft die KONFLIKTREGEL; die Slugs sind nur
    // ihr Vehikel und muessen deshalb aktiv sein, sonst misst er das
    // enabled-Flag statt der Regel und wird rot, ohne dass die Regel bricht.
    // POSITIV-ANKER zuerst: derselbe Aufruf ohne aktives Loadout muss starten.
    // Ohne ihn koennte 'conflict' auch von einem kaputten Lookup kommen.
    assert.equal(planAutoStart({ doc, model: 'gemma26-factory', activeSlugs: [] }).action, 'start');

    const active = ['gemma26-throughput'];
    const before = JSON.stringify({ active, doc });
    const r = planAutoStart({ doc, model: 'gemma26-factory', activeSlugs: active });
    assert.equal(r.action, 'conflict');
    assert.equal(r.conflictSlug, 'gemma26-throughput');
    assert.equal(r.group, 'chat-gpu');
    // Planen heisst planen: die Funktion darf nichts stoppen und nichts mutieren.
    assert.equal(JSON.stringify({ active, doc }), before, 'planAutoStart hat den Zustand mutiert');
    console.log('ok');
  "
  echo "$output"
  [ "$status" -eq 0 ]
}

# --- 7) HTTP-Regressionsanker: 503 no_backend bleibt erhalten ---------------

@test "unbekanntes Modell ergibt weiterhin 503 no_backend, ohne Health-Wartezeit" {
  # Die Zusicherung, dass die Auto-Start-Erweiterung den bestehenden Fehlerpfad
  # nicht verschluckt und fuer ein Modell ohne Loadout keine 240-Sekunden-
  # Health-Wartezeit einfuehrt.
  kill "$PID_A" "$PID_B" 2>/dev/null || true
  _start_proxy

  run curl -s -o /tmp/nb-body.$$ -w '%{http_code}' --max-time 20 \
    -X POST "http://127.0.0.1:${PROXY_PORT}/v1/chat/completions" \
    -H 'Content-Type: application/json' \
    -d '{"model":"does-not-exist","messages":[{"role":"user","content":"x"}]}'
  local code="$output"
  local body; body="$(cat /tmp/nb-body.$$ 2>/dev/null)"; rm -f /tmp/nb-body.$$
  echo "code=$code body=$body"
  [ "$code" = "503" ]
  # Auf den Body-Inhalt eingegrenzt statt auf volles stdout+stderr.
  echo "$body" | grep -q 'no_backend'
}

# --- 8) Suite-Wrapper: bringt die node-Suiten unter task test:all -----------

@test "node --test llm-proxy Suiten (loadouts, runner, server) sind gruen" {
  run node --test \
    "${REPO_ROOT}/scripts/llm-proxy/loadouts.test.mjs" \
    "${REPO_ROOT}/scripts/llm-proxy/runner.test.mjs" \
    "${REPO_ROOT}/scripts/llm-proxy/server.test.mjs"
  [ "$status" -eq 0 ]
  # Auf die Zusammenfassungszeile eingegrenzt, nicht auf den vollen Output.
  echo "$output" | grep -E '^# fail ' | grep -q '^# fail 0$'
}
