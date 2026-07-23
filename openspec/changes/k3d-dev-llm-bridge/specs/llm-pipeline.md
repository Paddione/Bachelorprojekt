# llm-pipeline — Delta-Spec

## Purpose

Update LLM_HOST_IP for the dev k3d environment from the unreachable Docker bridge
(172.17.0.1) to the wg-mesh address (192.168.100.10) that all prod environments
already use. Documentation fixes in k3d/llm-gpu.yaml and environments/schema.yaml.

## MODIFIED Requirements

### Requirement: LLM-PIPELINE-001 — Dev LLM_HOST_IP is reachable from k3d pods

| | Before | After |
|---|---|---|
| Value | `172.17.0.1` (Docker bridge) | `192.168.100.10` (wg-mesh) |
| Source | environments/dev.yaml:24 | environments/dev.yaml:24 |
| Reachable | No — Docker Desktop daemon lives in separate distro; no `docker0` exists | Yes — empirically verified; same IP as all prod envs |
