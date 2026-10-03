#!/usr/bin/env bats
# T900930: Qwen3.5 instruction worker routing and safe Windows launch contract.
load 'test_helper'

@test "Qwen3.5 worker handles route to newer model and dedicated prompt" {
  run node -e '
    const fs=require("fs"),assert=require("assert");
    const cfg=JSON.parse(fs.readFileSync(".opencode/agent-models.jsonc","utf8").replace(/^\s*\/\/.*$/gm,""));
    for(const id of ["qwen3-4b","plan-worker-4b"]){
      assert.equal(cfg.agent[id].model,"llamacpp-qwen3/Qwen3.5-4B-MTP");
      assert.equal(cfg.agent[id].prompt,"{file:./prompts/qwen35-worker.md}");
      assert.equal(cfg.agent[id].permission.task,"deny");
    }
    assert.equal(cfg.agent["qwen3-4b"].permission.write,"deny");
    assert.equal(cfg.agent["plan-worker-4b"].permission.write,"allow");
    assert.equal(cfg.agent.local.model,"llamacpp-local/Qwen3.8-27B");
    const worker=cfg.provider["llamacpp-qwen3"].models["Qwen3.5-4B-MTP"];
    assert.equal(worker.limit.context,98304);
    const slim=JSON.parse(fs.readFileSync(".opencode/oh-my-opencode-slim.jsonc","utf8").replace(/^\s*\/\/.*$/gm,""));
    assert.equal(slim.agents.explorer.model,cfg.agent["qwen3-4b"].model);
    assert.equal(slim.agents.librarian.model,cfg.agent["qwen3-4b"].model);
  '
  [ "$status" -eq 0 ]
}

@test "launcher pins3060, defaults nonthinking and refuses foreign8080listeners" {
  run node -e '
    const fs=require("fs"),assert=require("assert"),b=fs.readFileSync("scripts/llm/start-qwen35-4b-service.ps1");
    assert([...b].every(x=>x<128));const s=b.toString();
    assert(s.includes("GPU-6b9ac882-e9e9-a364-4423-92d838536b86"));
    assert(s.includes("--chat-template-kwargs"));assert(s.includes("enable_thinking"));
    assert(s.includes("/v1/models"));assert(s.includes("/apply-template"));
    assert(s.includes("$direct"));assert(s.includes("Get-NetTCPConnection"));
    assert(!s.includes("Stop-Process"));assert(s.includes("CUDA_VISIBLE_DEVICES = $GpuUuid"));
  '
  [ "$status" -eq 0 ]
}
