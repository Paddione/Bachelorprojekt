# Proposal: manifest-hardening

## Why

Das System-Audit vom 2026-08-23 meldete drei Manifest-Hardening-Befunde (SA-GR-04/05/06),
die als Batch T014553 mit den Kind-Tickets T014547/T014548/T014549 geführt werden. Alle
drei greifen in `k3d/`-Manifeste ein; GR-04 und GR-06 berühren beide
`k3d/rustdesk-stack/hbbs|hbbr.yaml` — separater Parallel-Versand würde kollidieren,
der Batch-Branch serialisiert sie.

**Wichtig — Evidence-Verifikation vor Planung (T002448-M5):** Die Re-Verifikation im
Repo ergab, dass die Audit-Evidence teilweise veraltet ist:

- **GR-04:** Node-Pinning existiert bereits in allen vier hostNetwork-Manifesten
  (`nodeSelector: kubernetes.io/hostname: ${TURN_NODE}` in coturn.yaml:34, janus.yaml:69,
  hbbs.yaml:29, hbbr.yaml:27) und ist in den Design-Docs dokumentiert. Verbleibender Kern:
  Die NetworkPolicy-Bypass-Ausnahme ist nirgends kanonisch dokumentiert.
- **GR-06:** nextcloud hat bereits teilgehärtete securityContexts (Pod-Level-runAsNonRoot
  ist dort unmöglich — Init-Container `fix-data-perms` braucht absichtlich root);
  collabora hat eine bewusste, im Manifest begründete Privilegien-Ausnahme. Echte Gaps:
  hbbs/hbbr (gar kein securityContext), llm-gpu (nur fsGroup), sessions-server
  (allowPrivilegeEscalation:false da, runAsNonRoot fehlt).

Der Plan bildet die verifizierte Realität ab, nicht die Audit-Rohfassung.

## What

Drei Themenblöcke auf einem Branch (`feature/manifest-hardening-T014553`):

1. **GR-04 (T014547) — NetPol-Ausnahme dokumentieren:** Neuer Abschnitt in
   `k3d/README.md`, der die hostNetwork-Pods (coturn, janus, hbbs, hbbr) auf
   `${TURN_NODE}`, ihre hostPorts und die bewusste NetworkPolicy-Bypass-Ausnahme
   beschreibt.
2. **GR-05 (T014548) — Monitoring-Resource-Limits:** `prod/monitoring/resource-limits-patch.yaml`
   um node-exporter (DaemonSet `monitoring-prometheus-node-exporter` — eigener
   Patch-Kind!), grafana-sidecars (`grafana-sc-dashboard`/`grafana-sc-datasources`),
   kube-state-metrics und operator (Container `kube-prometheus-stack`) erweitern
   (strategic-merge-Patches wie beim bestehenden grafana-Block, kein Re-Render).
3. **GR-06 (T014549) — runAsNonRoot-Hardening:**
   - hbbs/hbbr: securityContext mit runAsNonRoot + allowPrivilegeEscalation:false;
     workingDir von `/root` weg (Mode 700 sperrt non-root-User aus); Ports 21115+ sind
     unprivilegiert, Keys kommen read-only aus dem Secret.
   - llm-gpu: Pod-Level runAsNonRoot ergänzen (curl-Init läuft bereits als uid 100;
     llama.cpp-Server-Image unterstützt arbitrary UID; fsGroup 101 bleibt für PVC-Zugriff).
   - sessions-server: Umbau auf Unprivileged-Nginx-Pattern (Container-Port 8080,
     Service-targetPort-Anpassung, pid/temp-Pfade), dann runAsNonRoot.
   - nextcloud/collabora: keine Manifest-Änderung — bestehende Ausnahmen sind im
     Manifest begründet; der README-Abschnitt aus GR-04 verweist auf sie nicht
     (abweisend gehalten: dort gilt das Audit-Kriterium „wo die Images es erlauben" nicht).

_Artefakt-Ebene: Change-Proposal (Verhaltensänderung an Deploy-Manifesten). Kein PRD/ADR._

_Tickets: T014553 (Batch-Anker), T014547, T014548, T014549 (schließen einzeln)_
