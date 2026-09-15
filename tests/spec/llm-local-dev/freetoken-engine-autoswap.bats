#!/usr/bin/env bats
# tests/spec/llm-local-dev/freetoken-engine-autoswap.bats
# SSOT: openspec/changes/freetoken-engine-autoswap/specs/llm-local-dev.md
# Ticket: T900155

setup() {
  export REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  export TSX="$REPO/node_modules/.bin/tsx"
  export PLUGIN="$REPO/.opencode/plugin/freetoken-active.ts"
}

@test "T900155: freetoken-active plugin exports event hook for session.next.model.switched" {
  [ -f "$PLUGIN" ]
  cat > "$BATS_TEST_TMPDIR/check-event-hook.mjs" <<'HARNESS'
import { pathToFileURL } from "node:url";
const { default: createPlugin } = await import(pathToFileURL(process.argv[2]).href);
const hooks = await createPlugin();
if (typeof hooks.event !== "function") {
  console.error("plugin does not export an event hook function");
  process.exit(1);
}
HARNESS
  run "$TSX" "$BATS_TEST_TMPDIR/check-event-hook.mjs" "$PLUGIN"
  [ "$status" -eq 0 ]
}

@test "T900155: event hook dispatches engine switch when different engine model selected" {
  cat > "$BATS_TEST_TMPDIR/test-switch-dispatch.mjs" <<'HARNESS'
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";

const requests = [];
globalThis.fetch = async (url, init) => {
  const urlStr = String(url);
  requests.push({ url: urlStr, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : null });

  if (urlStr.endsWith("/engine/status")) {
    return new Response(JSON.stringify({ running: true, model: "C:\\models\\Qwen3.6-35B-A3B-NVFP4" }), { status: 200 });
  }
  if (urlStr.endsWith("/engine/switch")) {
    return new Response(JSON.stringify({ pid: 12345 }), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

const { default: createPlugin } = await import(pathToFileURL(process.argv[2]).href);
const hooks = await createPlugin();

await hooks.event({
  event: {
    type: "session.next.model.switched",
    properties: {
      model: { providerID: "freetoken-local", id: "gpt-oss-20b" }
    }
  }
});

const switchCall = requests.find(r => r.url.endsWith("/engine/switch"));
if (!switchCall) {
  console.error("No call to /engine/switch found. Requests:", JSON.stringify(requests));
  process.exit(1);
}

if (switchCall.body?.model !== "gpt-oss-20b") {
  console.error("Expected switch model gpt-oss-20b, got:", switchCall.body?.model);
  process.exit(1);
}
HARNESS
  run "$TSX" "$BATS_TEST_TMPDIR/test-switch-dispatch.mjs" "$PLUGIN"
  [ "$status" -eq 0 ]
}

@test "T900155: event hook does not call engine API when same engine model selected" {
  cat > "$BATS_TEST_TMPDIR/test-same-model.mjs" <<'HARNESS'
import { pathToFileURL } from "node:url";

const requests = [];
globalThis.fetch = async (url, init) => {
  const urlStr = String(url);
  requests.push({ url: urlStr, method: init?.method ?? "GET" });

  if (urlStr.endsWith("/engine/status")) {
    return new Response(JSON.stringify({ running: true, model: "Qwen3.6-35B-A3B-NVFP4" }), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

const { default: createPlugin } = await import(pathToFileURL(process.argv[2]).href);
const hooks = await createPlugin();

await hooks.event({
  event: {
    type: "session.next.model.switched",
    properties: {
      model: { providerID: "freetoken-local", id: "active-thinking" }
    }
  }
});

const engineActionCalls = requests.filter(r => r.url.endsWith("/engine/switch") || r.url.endsWith("/engine/start") || r.url.endsWith("/engine/stop"));
if (engineActionCalls.length > 0) {
  console.error("Engine API was called unexpectedly for same engine model:", JSON.stringify(engineActionCalls));
  process.exit(1);
}
HARNESS
  run "$TSX" "$BATS_TEST_TMPDIR/test-same-model.mjs" "$PLUGIN"
  [ "$status" -eq 0 ]
}

@test "T900155: event hook stops engine when non-freetoken model selected" {
  cat > "$BATS_TEST_TMPDIR/test-stop-dispatch.mjs" <<'HARNESS'
import { pathToFileURL } from "node:url";

const requests = [];
globalThis.fetch = async (url, init) => {
  const urlStr = String(url);
  requests.push({ url: urlStr, method: init?.method ?? "GET" });
  if (urlStr.endsWith("/engine/stop")) {
    return new Response(JSON.stringify({ stopped: true }), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

const { default: createPlugin } = await import(pathToFileURL(process.argv[2]).href);
const hooks = await createPlugin();

await hooks.event({
  event: {
    type: "session.next.model.switched",
    properties: {
      model: { providerID: "llamacpp-local", id: "devstral" }
    }
  }
});

const stopCall = requests.find(r => r.url.endsWith("/engine/stop"));
if (!stopCall) {
  console.error("No call to /engine/stop found. Requests:", JSON.stringify(requests));
  process.exit(1);
}
HARNESS
  run "$TSX" "$BATS_TEST_TMPDIR/test-stop-dispatch.mjs" "$PLUGIN"
  [ "$status" -eq 0 ]
}

@test "T900155: freetoken-active plugin includes system-merge fix in fetch wrapper" {
  cat > "$BATS_TEST_TMPDIR/test-system-merge.mjs" <<'HARNESS'
import { pathToFileURL } from "node:url";

let upstreamBody = null;
const cfg = {
  provider: {
    "freetoken-local": {
      models: { active: { limit: { context: 100000 } } },
      options: {
        fetch: async (url, init) => {
          upstreamBody = init?.body ? JSON.parse(init.body) : null;
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        },
      },
    },
  },
};

globalThis.fetch = async (url) => {
  if (String(url).endsWith("/engine/status")) {
    return new Response(JSON.stringify({ running: true, model: "Qwen3.6-35B-A3B-NVFP4" }), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

const { default: createPlugin } = await import(pathToFileURL(process.argv[2]).href);
const hooks = await createPlugin();
await hooks.config(cfg);

const wrappedFetch = cfg.provider["freetoken-local"].options.fetch;
const requestBody = JSON.stringify({
  model: "active",
  messages: [
    { role: "system", content: "System prompt part 1" },
    { role: "user", content: "Hello" },
    { role: "system", content: "System prompt part 2" },
  ],
});

await wrappedFetch("http://127.0.0.1:1919/v1/chat/completions", { body: requestBody });

if (!upstreamBody || !Array.isArray(upstreamBody.messages)) {
  console.error("Invalid upstream body:", upstreamBody);
  process.exit(1);
}

const sysMsgs = upstreamBody.messages.filter(m => m.role === "system");
if (sysMsgs.length !== 1) {
  console.error("Expected exactly 1 merged system message at position 0, got:", sysMsgs.length);
  process.exit(1);
}

if (upstreamBody.messages[0].role !== "system" || upstreamBody.messages[0].content !== "System prompt part 1\n\nSystem prompt part 2") {
  console.error("Merged system message content mismatch:", upstreamBody.messages[0]);
  process.exit(1);
}
HARNESS
  run "$TSX" "$BATS_TEST_TMPDIR/test-system-merge.mjs" "$PLUGIN"
  [ "$status" -eq 0 ]
}

@test "T900155: fetch wrapper performs engine consistency check against running engine" {
  cat > "$BATS_TEST_TMPDIR/test-fetch-consistency.mjs" <<'HARNESS'
import { pathToFileURL } from "node:url";

const requests = [];
let upstreamBody = null;
const cfg = {
  provider: {
    "freetoken-local": {
      models: { active: { limit: { context: 100000 } } },
      options: {
        fetch: async (url, init) => {
          upstreamBody = init?.body ? JSON.parse(init.body) : null;
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        },
      },
    },
  },
};

globalThis.fetch = async (url, init) => {
  const urlStr = String(url);
  requests.push({ url: urlStr, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : null });

  if (urlStr.endsWith("/engine/status")) {
    // Engine currently running Qwen, but request is for gpt-oss-20b
    return new Response(JSON.stringify({ running: true, model: "Qwen3.6-35B-A3B-NVFP4" }), { status: 200 });
  }
  if (urlStr.endsWith("/engine/switch")) {
    return new Response(JSON.stringify({ pid: 54321 }), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

const { default: createPlugin } = await import(pathToFileURL(process.argv[2]).href);
const hooks = await createPlugin();
await hooks.config(cfg);

const wrappedFetch = cfg.provider["freetoken-local"].options.fetch;
const requestBody = JSON.stringify({
  model: "gpt-oss-20b",
  messages: [{ role: "user", content: "Test drift" }],
});

await wrappedFetch("http://127.0.0.1:1919/v1/chat/completions", { body: requestBody });

const switchCall = requests.find(r => r.url.endsWith("/engine/switch"));
if (!switchCall) {
  console.error("Expected fetch wrapper to trigger /engine/switch on model drift, requests:", JSON.stringify(requests));
  process.exit(1);
}

if (switchCall.body?.model !== "gpt-oss-20b") {
  console.error("Expected switch to gpt-oss-20b, got:", switchCall.body?.model);
  process.exit(1);
}
HARNESS
  run "$TSX" "$BATS_TEST_TMPDIR/test-fetch-consistency.mjs" "$PLUGIN"
  [ "$status" -eq 0 ]
}

@test "T900155: degraded failure path handles engine switch error gracefully" {
  cat > "$BATS_TEST_TMPDIR/test-degraded-failure.mjs" <<'HARNESS'
import { pathToFileURL } from "node:url";

globalThis.fetch = async (url) => {
  if (String(url).endsWith("/engine/status")) {
    return new Response(JSON.stringify({ running: true, model: "Qwen3.6-35B-A3B-NVFP4" }), { status: 200 });
  }
  if (String(url).endsWith("/engine/switch")) {
    return new Response(JSON.stringify({ error: "Out of VRAM" }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

const { default: createPlugin } = await import(pathToFileURL(process.argv[2]).href);
const hooks = await createPlugin();

// Should not throw exception
await hooks.event({
  event: {
    type: "session.next.model.switched",
    properties: {
      model: { providerID: "freetoken-local", id: "Gemma-4-26B-A4B-NVFP4" }
    }
  }
});
HARNESS
  run "$TSX" "$BATS_TEST_TMPDIR/test-degraded-failure.mjs" "$PLUGIN"
  [ "$status" -eq 0 ]
}
