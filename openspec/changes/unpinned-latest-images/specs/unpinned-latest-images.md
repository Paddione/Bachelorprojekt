# unpinned-latest-images — Delta-Spec

## Purpose

Dokumentiert die bewusste Nutzung von :latest Image-Tags in Workspace-Deployments und formalisiert die Ausnahmeliste.

## ADDED Requirements

### Requirement: LATEST-001 — Intentionale :latest-Nutzung wird dokumentiert

Image-Tags, die bewusst auf :latest gesetzt sind (Website, Brett, Studio, etc.), werden in einer zentralen Liste dokumentiert.

**Scenarios:**

- GIVEN a container image using :latest intentionally THEN it MUST appear in the documented exception list
- GIVEN a new service deployment THEN the image tag policy MUST be reviewed before using :latest
