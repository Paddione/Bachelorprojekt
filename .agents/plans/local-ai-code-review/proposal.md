# Proposal: Local AI Code Review Workflow (Tailscale / llm-services)

## Problem
Der GitHub-integrierte Copilot Code Scanning Dienst schlägt auf PRs mit einem `402 Quota Exceeded` Fehler fehl, da die monatlichen Kontingente erschöpft sind. GitHub Actions PR-Reviews benötigen eine zuverlässige, kostenfreie Alternative, die unabhängig von externen GitHub-Limits läuft.

## Lösung
1. Abschaltung / Nicht-Blockieren des fehlschlagenden GitHub-Copilot-Scannings (bzw. Entkopplung von Merge-Gates).
2. Einbindung eines eigenen GitHub Actions Workflows `.github/workflows/ai-code-review.yml`:
   - Verbindung zum lokalen Cluster/Tailnet via Tailscale GitHub Action (`tailscale/github-action`).
   - Abfrage des PR-Diffs.
   - Durchführung des Code-Reviews über die lokale Inferenz-Schnittstelle (`http://llm-services:18235` oder vLLM-Gateway) mit lokalem Modell (z. B. Qwen / Llama).
   - Veröffentlichung des Review-Feedbacks als PR-Review-Kommentar oder Summary.
   - Robustes Fallback-Verhalten (Graceful degradation bei Offline-Tailnet).
