# Proposal: 2026-08-15-laptop-bge-topologie

## Why

Die bge-Schicht (Embedding + Rerank) läuft heute als Erstglied auf den Cluster-CPU-Deployments
(T002551). Die lokalen Geräte PK-L-1 (LM Studio, Vulkan) und PK-Tablet (Intel Iris, 8 GB) sind
vorhanden, aber nicht als Erstglieder eingebunden: der Host-SPOF der bge-Schicht (T002426) bleibt
bestehen, und das GPU-Potential der Geräte bleibt ungenutzt. LM Studio hat keinen `/v1/rerank`
-Endpoint — Rerank braucht einen nativen llama-server.

## What

Rollenketten-Umbau in `scripts/llm/loadouts.json` (embed: LM Studio/PK-L-1 vor Cluster; rerank:
PK-Tablet llama-server via WireGuard vor Cluster vor `bge-rerank-cpu`), zwei
WireGuard-Mesh-Nodes (`.11`/`.12`), ein Windows-Startskript + Scheduled Task für llama-server auf
dem Tablet und LM-Studio-Konfiguration (Vulkan/iGPU aktivieren, LM Link fürs Tablet). Kein
Code-Change an `bge-routes.mjs` — Failover-Semantik und Vertrag bleiben unangetastet. Details und
Entscheidungen E1–E6: `design.md`.

_Ticket: T006143_
