# ADR-018: Dekommissionierung Files-/Talk-/Board-Dienste (Nextcloud, Whiteboard, TURN, NATS, Janus, Redis)

**Status:** Accepted
**Datum:** 2026-11-05
**Ticket / Feature:** plan/decommission-prod-services
**Related:** [ADR-008](ADR-008-local-k3s-dev-mesh.md), [ADR-011](ADR-011-pocket-id-sole-idp.md)

## Kontext

Nextcloud (inkl. Nextcloud-Redis, Notification-Config-Job), Nextcloud Talk HPB
(spreed-signaling, Recording-Backend, Transcriber-Bot), das Nextcloud-Whiteboard
sowie der TURN-/SFU-Stack (CoTURN, Janus, NATS) laufen auf keinem Cluster mehr:
devmesh, k3d-gpu-serving und k3s-dev sind verifiziert leer, der Fleet-Anteil wurde
am 2026-10-22 abgebaut. Eigner-Entscheid vom 2026-11-05: Die Dienste „sollen
nirgends mehr laufen". Die Health-Goals G-SVC03/04 und G-INF01-04 sind bereits
retiriert. Die Manifeste, Env-/Ingress-/Taskfile-Einträge, der Whiteboard-
Produktcode, E2E-Specs und Registry-Doku existierten trotzdem weiter.

## Entscheidungen

1. **D1 — Manifeste entfernen:** `k3d/nextcloud*.yaml`, `k3d/talk-hpb.yaml`,
   `k3d/talk-recording.yaml`, `k3d/whiteboard/`, `k3d/coturn-stack/`,
   `k3d/talk-transcriber/`, `prod/patch-nextcloud.yaml`,
   `prod/patch-signaling-backend.yaml`, `prod-fleet/coturn/`,
   `prod-mentolder/talk-transcriber.yaml` werden gelöscht; gemischte Dateien
   (`kustomization.yaml`, `ingress.yaml`, Secrets, `website.yaml`,
   Seed-Job, ConfigMaps, Environments, `flux/clusters/fleet-gekko/ks-prod.yaml`,
   `taskfiles/`) verlieren nur die Dienst-Einträge.
2. **D2 — Whiteboard aus der Website schneiden:** `lib/whiteboard.ts` (+ Test)
   und `apps/whiteboard/app.yaml` entfallen; `finalize.ts`/`save-transcript.ts`
   verlieren die Whiteboard-Pfade, `meetings-db.ts`/Seed-Daten nur die
   Whiteboard-Refs. Die Endpunkte bleiben ohne Whiteboard sinnvoll bestehen.
3. **D3 — Keine DB-Migration:** Schema-Spalten und CHECK-Werte (z. B.
   `meeting_artifacts.artifact_type = 'whiteboard'`) bleiben ungenutzt stehen
   (Brand korczewski frozen, kein Cluster-Write). Historische Whiteboard-Zeilen
   bleiben lesbar; neue entstehen nicht mehr.
4. **D4 — Backup-Pfad lebt weiter:** Der `nextcloud-data`-Strom in
   `k3d/pvc-backup-cronjob.yaml` bleibt bestehen, bis die Rest-PVCs auf den
   Clustern geerntet sind — Nutzdaten werden nicht mit dem Dienst beerdigt.
5. **D5 — Specs/Doku nachziehen:** `fa-24-whiteboard.spec.ts` und `FA-24.sh`
   entfallen, Playwright-Config und App-Catalog-Spec verlieren den
   Whiteboard-Block, die Registry-Slugs (`nextcloud`, `nextcloud-talk-hpb`,
   `whiteboard`, `talk-transcriber`) werden gestrichen.

## Nicht-Ziele

- DB-Schema-Migrationen (siehe D3).
- `docs/superpowers/specs/archive/` (Historie bleibt unverändert).
- `dev-local/components/{nextcloud,talk}/`, `prod-korczewski/`-Talk-Reste und
  `office-stack`/Collabora (separate Scopes, eigene Pläne).
- Nächtliche E2E-Grünheit (G-E2E01 heilt separat).

## Konsequenzen

- `kustomize build k3d/ prod/ prod-mentolder/ prod-fleet/*` bleibt grün ohne
  dangling refs; `flux:render` kennt keine `coturn`-Komponente mehr und die
  `flux-coturn`-Kustomization ist gestrichen.
- Aufrufer der entfernten Workspace-Tasks (`post-setup`, `theme:nextcloud`)
  sind auf verbleibende Tasks umgebogen.
- Verifikation: Abwesenheit per Namespace (`kubectl get deployments -A`
  ohne Treffer für die retirierten Dienste) nach dem nächsten Deploy.
