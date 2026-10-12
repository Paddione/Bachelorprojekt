# Design: Local AI Code Review Workflow

## Architektur & Komponenten

1. **GitHub Actions Trigger:**
   - Event: `pull_request` (opened, synchronize, reopened)
   - Concurrency: Pro Branch/PR (`cancel-in-progress: true`)

2. **Konnektivität zu lokalen LLM-Services:**
   - Auth via `TAILSCALE_AUTHKEY` (Secret im GitHub Repo vorhanden für Tailnet-Connect).
   - Tailscale verbindet den CI-Runner mit dem devmesh-Tailnet.
   - Endpoint: `http://llm-services.workspace.svc:18235` bzw. devmesh-Service oder dedizierter vLLM-Host.

3. **Review-Logik & Prompt:**
   - Skript `scripts/ci/run-ai-code-review.py` (oder JS/Node-Helper):
     - Filtert irrelevante Diffs (Lockfiles, Snapshots, generierte JSONs).
     - Extrahiert relevante Code-Änderungen.
     - Sendet Review-Prompt an `http://llm-services:18235/v1/chat/completions` (OpenAI-kompatible API).
     - Generiert strukturiertes Markdown (Summary, Security-Hinweise, Code-Quality).

4. **Feedback-Post:**
   - Schreibt Review-Kommentar direkt an den PR via `gh pr comment` oder `gh pr review`.
   - Bei Nichterreichbarkeit der lokalen API: Nicht-blockierender Exit mit Warnung in GitHub Actions Job-Summary (kein harter CI-Blocker).
