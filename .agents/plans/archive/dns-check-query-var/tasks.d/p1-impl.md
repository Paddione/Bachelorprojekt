---
title: "p1-impl — QUERY statt NAME"
ticket_id: T016522
domains: [infra]
status: draft
---

# dns-check-query-var — Implementation Plan

## Task 1

In `devmesh:dns:check` die Variable `NAME` in `QUERY` umbenennen (vars,
dig-Aufruf, desc, Usage-Kommentar). Akzeptanz: `task --dry devmesh:dns:check`
mit gesetztem `NAME` in der Umgebung fragt `quad9.net`.
