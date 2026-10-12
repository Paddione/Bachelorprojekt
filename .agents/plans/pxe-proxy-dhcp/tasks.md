---
title: "pxe-proxy-dhcp — Implementation Plan"
ticket_id: T016505
domains: [scripts, infra, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pxe-proxy-dhcp — Implementation Plan

Zwei Defekte im PXE-Weg aus T012906, beobachtet beim Neuinstallieren von
gpu-metal am 2026-10-12. Beide mit failing-test-first belegt.

_Ticket: T016505_

Root-Cause-Analyse (Symptom vs. Ursache getrennt): Defekt A — Symptom
(Fakt): UEFI-PXE-DISCOVER (`PXEClient:Arch:00007`) erreicht dnsmasq, es
folgt keine Antwort (journalctl dnsmasq-dhcp bis 19:02:10). Ursache
(belegt): im Proxy-Modus antwortet dnsmasq nur ueber `pxe-service`; die
generierte `dnsmasq.conf` enthaelt nur `dhcp-boot`. Nach Ergaenzung von
`pxe-service=tag:efi-x86_64,X86-64_EFI,...,bootx64.efi` kam die Antwort
binnen Sekunden (19:03:19, danach TFTP bootx64.efi). Defekt B — Symptom
(Fakt): mit ufw-Regel `from 10.0.0.0/8 to any port 67` erreichte kein
DISCOVER dnsmasq. Ursache (belegt): DHCP-DISCOVER hat Quelladresse
0.0.0.0; erst `ufw allow in on <iface> to any port 67 proto udp` liess ihn
durch. Das Runbook nennt nur die Ports, nicht diese Falle.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/pxe/setup-pxe.sh` | 599 | 201 |
| `docs/runbooks/workstation-cluster-pxe.md` | 179 | n/a (Doku) |
| `tests/py/spec/remaining_root_specs/workstation_cluster_pxe/test_setup_pxe_guards.py` | 80 | 720 |

Budget-Quelle: `.sh`/`.py`-Limit 800 aus `docs/code-quality/gates.yaml`;
keine Datei gebaselined, wirksame Schwelle ist das statische Limit.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-dnsmasq-conf.md | impl | `scripts/pxe/setup-pxe.sh` |  |
| p2 | tasks.d/p2-runbook.md | impl | `docs/runbooks/workstation-cluster-pxe.md` |  |
| p3 | tasks.d/p3-tests.md | tests | `tests/py/spec/remaining_root_specs/workstation_cluster_pxe/test_setup_pxe_guards.py` | p1, p2 |

## Tasks

- [ ] **0. Rotphase (liegt vor, beide rot):** zwei failing Tests in der
  bestehenden Testdatei, Nachweis in `tasks.d/p3-tests.md`.
- [ ] **1. Partial p1** (`tasks.d/p1-dnsmasq-conf.md`): dnsmasq-Rendering
  in Funktion, `pxe-service`-Zeilen, root-freie Aktion
  `--print-dnsmasq-conf`.
- [ ] **2. Partial p2** (`tasks.d/p2-runbook.md`): Firewall-Abschnitt um
  die ufw-Regel fuer DHCP-Broadcasts ergaenzen.
- [ ] **3. Partial p3** (`tasks.d/p3-tests.md`): beide Tests gruen, Datei
  vollstaendig gruen.
- [ ] **4. Finaler Verifikations-Task.** In dieser Reihenfolge:
  `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
  Alle drei gruen; Umwelt-Ausschluesse im Ausfuehrungsreport belegen.
