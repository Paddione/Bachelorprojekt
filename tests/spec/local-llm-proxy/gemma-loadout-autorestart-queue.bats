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

@test "alle 8091-Loadouts schliessen einander per exclusiveGroup aus" {
  # Der 409-port_busy-Pfad in server.mjs greift genau dann, wenn zwei Loadouts
  # denselben Port teilen und eines aktiv ist. Ohne User-systemd ist "aktiv"
  # nicht herstellbar — pruefbar ist die Vorbedingung als Laufzeitergebnis.
  run node --input-type=module -e "
    import assert from 'node:assert/strict';
    const { readLoadouts } = await import('file://${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs');
    const { doc } = readLoadouts('${REPO_ROOT}/scripts/llm/loadouts.json');

    // POSITIV-ANKER (T002356-M1): es muss weiterhin ein Loadout mit einem NUR
    // EINMAL belegten Port geben. Ohne ihn waere die Aussage auch gegen eine
    // Registry wahr, in der schlicht alles auf 8091 liegt.
    const counts = new Map();
    for (const l of doc.loadouts) counts.set(l.port, (counts.get(l.port) ?? 0) + 1);
    const solo = doc.loadouts.filter((l) => counts.get(l.port) === 1);
    assert.ok(solo.length > 0, 'kein Loadout mit exklusivem Port — Anker verloren');

    const on8091 = doc.loadouts.filter((l) => l.port === 8091);
    // Nicht auf eine feste Anzahl pruefen: die Aussage ist 'wer sich 8091 teilt,
    // muss sich gegenseitig ausschliessen', nicht 'es sind genau zwei'. Eine
    // harte Zahl bricht bei jedem neuen 8091-Loadout, ohne dass die gepruefte
    // Eigenschaft verletzt waere (T002534: gemma26-factory kam als drittes dazu).
    // Untergrenze 2 haelt die Aussage nicht-vakuos — bei einem einzigen Loadout
    // gaebe es nichts auszuschliessen.
    assert.ok(on8091.length >= 2,
      'erwartet mindestens zwei Loadouts auf 8091, sonst ist der Ausschluss gegenstandslos');
    for (const l of on8091) {
      assert.equal(l.exclusiveGroup, 'chat-gpu',
        l.slug + ': teilt 8091, muss also in der chat-gpu-Gruppe liegen');
    }
    console.log('solo=' + solo.length + ' on8091=' + on8091.length);
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

    // POSITIV-ANKER zuerst: derselbe Aufruf ohne aktives Loadout muss starten.
    // Ohne ihn koennte 'conflict' auch von einem kaputten Lookup kommen.
    assert.equal(planAutoStart({ doc, model: 'gptoss-context', activeSlugs: [] }).action, 'start');

    const active = ['devstral-quality'];
    const before = JSON.stringify({ active, doc });
    const r = planAutoStart({ doc, model: 'gptoss-context', activeSlugs: active });
    assert.equal(r.action, 'conflict');
    assert.equal(r.conflictSlug, 'devstral-quality');
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
