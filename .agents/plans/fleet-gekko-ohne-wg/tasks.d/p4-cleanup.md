# p4 — Abbau, WireGuard-Cleanup, Doku

Rolle: impl. Abhaengigkeit: p3 (Cutover gelaufen).

## Task 10 — pk abbauen und WireGuard restlos entfernen

- Step: Erst nach Beobachtungsfenster und Operator-Freigabe (Gate G4) die pk-hetzner-Server bei Hetzner loeschen.
- Step: wireguard-Verzeichnis (inkl. `wireguard/wg-mesh-nodes.yaml`), `scripts/wg-mesh-sync.sh` (Ist 371 bei Budget 429), `scripts/hetzner/generate-wg-conf.sh` (Ist 164 bei Budget 636), WG-Abschnitte in cloud-init und Sealed Secrets mit WG_MESH-Bezug entfernen; `tests/py/spec/native_ported/spec/fleet-operations/test_wg_mesh_sync.py` (Ist 334 bei Budget 466) loeschen. Die Dateien werden geloescht, nicht erweitert.
- Step: `docs/adr/ADR-014-fleet-gekko-ohne-wireguard.md` schreiben (kehrt die Node-Rollen aus ADR-001 um, dokumentiert D1 bis D3), in `docs/adr/ADR-001-fleet-konsolidierung.md` den Superseded-Vermerk setzen, `docs/runbooks/ssh-zugang-fleet.md` auf Tailscale-Adminzugriff aktualisieren. Das k3s-interne flannel-wg in devmesh bleibt unberuehrt.
- Acceptance: `python3 -m pytest tests/py/spec/native_ported/spec/fleet-operations/test_fleet_no_wireguard.py -q` ist gruen; kein WireGuard-VPN-Bezug mehr in prod, prod-fleet und scripts ausserhalb von devmesh.
