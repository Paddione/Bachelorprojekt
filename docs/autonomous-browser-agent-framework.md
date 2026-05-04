# Technical Framework: Local Autonomous Browser Agents (16GB VRAM)

This framework defines the deployment and orchestration of autonomous browser agents using **GPT-OSS 20B** on consumer-grade hardware with 16GB VRAM.

## 1. Architectural Strategy

The framework employs a "Split-Inference" architecture where the heavy LLM weights are hosted on a dedicated GPU worker (workstation) and the browser execution happens within a containerized Kubernetes environment.

### Components:
1.  **LLM Serving (Backend)**: Ollama running GPT-OSS 20B (4-bit quantization).
2.  **Tooling (MCP)**: `mcp-browser` providing Playwright primitives.
3.  **Agent Logic (Frontend)**: A Python/Node.js agent loop (e.g., using `browser-use` or `LangChain`) consuming the local LLM.
4.  **Connectivity**: Kubernetes Service + Endpoints pointing to the GPU Workstation.

## 2. Hardware Optimization (16GB VRAM)

GPT-OSS 20B at 4-bit (Q4_K_M) requires ~12.5 GB of VRAM. 

| Layer | Allocation | Note |
| :--- | :--- | :--- |
| Model Weights | 12.5 GB | GPT-OSS 20B (Q4_K_M) |
| KV Cache (8k context) | 1.2 GB | Sufficient for most web interactions |
| System Overhead | 0.8 GB | Windows/Linux OS + Background |
| **Total** | **14.5 GB** | **Fits in 16GB with 1.5GB buffer** |

## 3. Deployment Manifests

### A. GPU Worker Addition (`docker-compose.gpu-worker.yaml`)

```yaml
  ollama-gpu:
    image: ollama/ollama:latest
    container_name: ollama-gpu
    restart: unless-stopped
    ports:
      - "127.0.0.1:11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    networks:
      - k3d
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

### B. Kubernetes Connectivity (`k3d/llm-gpu.yaml`)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: llm-gateway
spec:
  ports:
    - port: 11434
      targetPort: 11434
---
apiVersion: v1
kind: Endpoints
metadata:
  name: llm-gateway
subsets:
  - addresses:
      - ip: __HOST_IP__  # Replaced dynamically by task gpu-worker:switch-dev
    ports:
      - port: 11434
```

## 4. Execution Workflow

1.  **Boot LLM**: `task gpu-worker:start` pulls and runs GPT-OSS 20B via Ollama.
2.  **Connect Cluster**: `task gpu-worker:switch-dev` identifies the workstation IP and updates Kubernetes Endpoints.
3.  **Run Agent**: The `mcp-browser` service is configured to use `http://llm-gateway:11434/v1` for reasoning.
4.  **Autonomous Loop**: The agent receives a high-level goal, uses the LLM to plan steps, and executes them via Playwright tools.

## 5. Security & Isolation

- **Network Policy**: Browser agents are restricted to specific namespaces.
- **Resource Quotas**: Browser pods are limited to 4GB RAM to prevent memory leaks from long-running browser sessions.
- **Headless Mode**: Mandatory for automated cluster execution.
