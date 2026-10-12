---
title: "p1-dnsmasq-conf — pxe-service im Proxy-Modus"
ticket_id: T016505
domains: [scripts]
status: draft
---

# pxe-proxy-dhcp — Implementation Plan

Partial-Plan `p1-dnsmasq-conf` fuer T016505. Zieldatei exklusiv:
`scripts/pxe/setup-pxe.sh`.

## File Structure

| Datei | Ist | Budget |
| `scripts/pxe/setup-pxe.sh` | 599 | 201 |

## Task 1 — dnsmasq-Konfiguration als Funktion mit pxe-service

Steps:

1. Den Heredoc unter `# --- dnsmasq-Konfiguration` in eine Funktion
   `render_dnsmasq_conf` verschieben, die auf stdout schreibt und
   `IFACE`, `SERVER_IP`, `ROOT_DIR` liest (`TFTP_DIR` daraus ableiten).
   Der Startpfad schreibt deren Ausgabe nach `${ROOT_DIR}/dnsmasq.conf`.
2. Nach den `dhcp-boot`-Zeilen ergaenzen, mit Kommentar zur Ursache:
   `pxe-service=tag:efi-x86_64,X86-64_EFI,"Cluster-Node UEFI",bootx64.efi`
   und `pxe-service=tag:efi-bc,BC_EFI,"Cluster-Node UEFI",bootx64.efi`.
3. Neue Aktion `--print-dnsmasq-conf` (ACTION=print-dnsmasq-conf) neben
   `--stop`/`--status`: verlangt `--iface` und `--server-ip`, braucht weder
   root noch `--ssh-key`, gibt `render_dnsmasq_conf` aus und endet mit
   Exit 0. Fehlt einer der Werte: Meldung und Exit 1. In `usage()` listen.

Akzeptanzkriterien:

- `setup-pxe.sh --print-dnsmasq-conf --iface eth9 --server-ip 192.0.2.10`
  gibt eine Konfiguration mit `dhcp-range=192.0.2.10,proxy` und beiden
  `pxe-service`-Zeilen aus, Exit 0, ohne root.
- `dnsmasq --test` akzeptiert die Ausgabe.
- Bestehende Tests der Datei bleiben gruen.
