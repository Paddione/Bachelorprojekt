---
title: "G-CQ02: any-Typen 463→≤200 — TypeScript-Sicherheitsnetz stärken"
ticket_id: T001285
domains: [website, quality]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Proposal: cq02-any-types-200 (G-CQ02)

## Why

Das Website-Projekt zeigt eine TypeScript-Regression: 463 explizite `any`-Verwendungen (`:any`, `<any>`, `as any`) in `website/src` — gegenüber dem Baseline-Stand von 424 ein Anstieg von +39. Das `any`-Keyword hebelt TypeScript-Typprüfungen vollständig aus, verbreitet sich viral (jeder Aufrufer erhält `any` zurück) und maskiert echte Bugs bis zur Laufzeit. Ziel ist eine Reduktion auf ≤200, was ca. 263 gezielte Ersetzungen erfordert.

Messung:
```bash
grep -rn ': any\|<any>\|as any' website/src --include=*.ts --include=*.svelte --include=*.astro | wc -l
```

## What

- **Test-Dateien** (~180 Vorkommen in Top-Hotspots): `as any` in Vitest-Kontexten (Mocks, Locals, Session-Objekte) durch `unknown`, konkrete Typen oder `Parameters<typeof fn>` ersetzen
- **API-Handler** (~25 Vorkommen: monitoring.ts, pods-list.ts, warnings.ts, dora-metrics.ts): Interfaces für K8s-API-Response-Shapes einführen
- **Library-Dateien** (~30 Vorkommen: factory-floor.ts, website-db.ts, knowledge-db.test.ts, behaviorStore.ts): Generics statt `any`, Record-Typen, explizite Interfaces
- **Svelte/Astro-Komponenten** (~20 Vorkommen: KoreHomepage.svelte, SchemaEditor.svelte, inhalte.astro): Event-Handler-Typen und Store-Generics ergänzen
- Failing-Test hinzufügen der ≤200 prüft (RED → GREEN nach Implementierung)

_Ticket: T001285_
