---
title: "mishap-categorize erden: ähnliche Mishaps als Cluster-Kontext"
domains: [scripts]
ticket_id: T002401
status: active
parent_feature: T002397
---

# mishap-categorize erden

**Ticket:** T002401

## Problem

`scripts/mishap-categorize.sh` sortiert Mishaps in Kategorien ohne Kenntnis
bestehender Kategorien → Beinahe-Duplikate mit abweichender Benennung.

## Lösung

Stufe 1: Bereits vergebene Kategorien vor dem LLM-Aufruf laden und als Prompt-Block
`[EXISTING_CATEGORIES]` mitgeben. Macht aus Klassifikation ein Einordnen in Taxonomie.
