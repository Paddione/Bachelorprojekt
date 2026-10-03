# Qwen3.5-4B Worker Modes (T900930)

Resident: Qwen3.5-4B-MTP UD-Q4_K_XL on Windows-native llama.cpp :8080
(RTX 3060 Ti, 3 slots, provisional 98304 shared KV). One checkpoint
serves both modes; switching modes needs no reload or restart.

## Modes (per request)

- direct (default): `chat_template_kwargs: {enable_thinking: false}`.
  No reasoning trace; tool calls work normally.
- thinking: `chat_template_kwargs: {enable_thinking: true}` on the
  same PID. Response carries `reasoning_content` plus final content.

OpenCode sends the body overlay from `.opencode/agent-models.jsonc`
(provider `llamacpp-qwen3`, model `Qwen3.5-4B-MTP`, variants
`direct`/`thinking`). Raw curl equivalent:

```
curl http://127.0.0.1:8080/v1/chat/completions -H "Content-Type: application/json" -d \
 '{"model":"Qwen3.5-4B-MTP","messages":[{"role":"user","content":"hi"}],
   "chat_template_kwargs":{"enable_thinking":false}}'
```

## Verify non-thinking default (no reload)

1. `GET http://127.0.0.1:8080/health` -> `{"status":"ok"}`.
2. `GET http://127.0.0.1:8080/v1/models` -> id list contains
   `Qwen3.5-4B-MTP`.
3. `POST http://127.0.0.1:8080/apply-template` with
   `{"messages":[{"role":"user","content":"hello"}],"add_generation_prompt":true}`
   -> prompt has no thinking block.
4. Chat completion with `enable_thinking: false` -> no
   `reasoning_content` in response; with `true` -> present.
   Same PID across both calls (check launcher PID file).

## Launcher

Copy `scripts/llm/start-qwen35-4b-service.ps1` to `F:/tools/llama.cpp`
and run it there. It pins GPU UUID `GPU-6b9ac882-e9e9-a364-4423-92d838536b86`
via `CUDA_VISIBLE_DEVICES`, starts non-thinking default, validates
health/model/template, and never kills foreign :8080 listeners
(it aborts with the occupant instead).

## Rollback

Restore `Qwen3-4B-2507` references (90112 ctx) in
`.opencode/agent-models.jsonc` (provider `llamacpp-qwen3` model block,
agents `qwen3-4b`/`plan-worker-4b`), `.opencode/oh-my-opencode-slim.jsonc`
(explorer/librarian), `docs/agent-guide/registry/runtimes.md`, and
re-run `scripts/opencode-sync-agents.sh`. No mode switch needs rollback.

## Limits

98304 shared KV is provisional: short requests verified, long-load and
3-stream stress pending. Do not quote old Linux speed figures.
