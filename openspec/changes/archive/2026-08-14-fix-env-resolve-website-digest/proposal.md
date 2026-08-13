---
title: "Proposal: env-resolve clobbers WEBSITE_IMAGE_DIGEST — placeholder erreicht Artefakt"
ticket_id: T004041
status: planning
---

# Proposal: env-resolve clobbers WEBSITE_IMAGE_DIGEST (T004041)

## Why

Seit dem Digest-Pinning-Commit c8d611366 (T002706) enthält JEDES gerenderte
fleet-manifests-Artefakt für beide Brands den Placeholder-Digest `sha256:1111…`
im Website-Deployment. Live hängt das daraus entstandene ReplicaSet
`website-5cd876887d` seit 2026-08-09 in ImagePullBackOff; der letzte wirklich
ausgerollte Pod ist vom 2026-08-08. **Alle Website-Änderungen seit 2026-08-08
sind in Prod nicht live** (u.a. T003746 SDLC-Redirects). Deploys scheitern
still — kein Alarm, kein roter Check.

## What

Ursache (reproduziert, nicht Hypothese): `scripts/env-resolve.sh` exportiert
alle env_vars unbedingt und überschreibt damit den vom CI-Workflow
(`render-fleet-artifact.yml`) gesetzten echten Digest mit dem in
`environments/fleet-*.yaml` hardcodierten Placeholder. Der Renderer sourced
env-resolve NACH der Digest-Bereitstellung.

Fix in drei Lagen:

1. **env-resolve.sh (Wurzel):** Caller-gesetzte Variablen gewinnen — `emit()`
   überspringt Variablen, die im Caller-Environment bereits gesetzt sind.
   Deckt alle Caller ab (Flux-Render-Pfad, break-glass Taskfile-Pfad, Setup-Skripte).
2. **flux-render-artifact.sh:** Die `: "${WEBSITE_IMAGE_DIGEST:=}"`-Defaults für
   DIGESTS entfallen (WEBSITE_IMAGE_TAG bleibt) — sonst würde das leere Export
   als „Caller-Wert" den env-file-Placeholder in Offline-Rendern unterdrücken.
3. **Fail-closed Placeholder-Guard (always-on):** Die Render-Ausgabe wird auf
   die beiden bekannten Placeholder-Digests (`sha256:1111…`, `sha256:2222…`)
   gescannt; ein Treffer bricht den Render mit Exit 1 ab — analog zum
   checksum/config-Check (T002156). `sha256:1111…` erreicht nie wieder ein Artefakt.

## Akzeptanzkriterien

1. `WEBSITE_IMAGE_DIGEST=sha256:565e7cec… source env-resolve.sh fleet-mentolder`
   lässt den Wert unverändert (Reproducer aus dem Ticket läuft grün).
2. `flux-render-artifact.sh` mit Caller-Digests rendert das Website-Deployment
   mit genau diesem Digest; kein `sha256:1111…` im Artefakt.
3. Render mit Placeholder-Digest bricht mit Exit 1 ab und nennt die Fundstelle.
4. Alle bestehenden Render-/env-resolve-Tests bleiben grün (Fixture-Digests in
   den Offline-Render-Tests).
5. Nach Merge: Flux reconcilingt das neue Artefakt; `website`-Deployment
   beider Brands rollt auf das neue Image (kein ImagePullBackOff mehr).

_Ticket: T004041_
