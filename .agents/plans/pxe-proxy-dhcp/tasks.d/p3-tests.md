---
title: "p3-tests — Rot-Tests fuer pxe-service und ufw-Hinweis"
ticket_id: T016505
domains: [testing]
status: draft
---

# pxe-proxy-dhcp — Implementation Plan

Partial-Plan `p3-tests` fuer T016505. Zieldatei exklusiv:
`tests/py/spec/remaining_root_specs/workstation_cluster_pxe/test_setup_pxe_guards.py`.

## File Structure

| Datei | Ist | Budget |
| `tests/py/spec/remaining_root_specs/workstation_cluster_pxe/test_setup_pxe_guards.py` | 80 | 720 |

## Task 1 — Rotphase (liegt vor)

- `test_print_dnsmasq_conf_beantwortet_uefi_im_proxy_modus`: fuehrt
  `--print-dnsmasq-conf` aus, prueft Positiv-Anker `dhcp-range=...,proxy`
  und beide `pxe-service`-Zeilen; mit dnsmasq-Binary zusaetzlich
  `dnsmasq --test` (sonst skip).
- `test_runbook_nennt_ufw_regel_fuer_dhcp_broadcast`: Doku-Konvention.

Rot-Nachweis: `python3 -m pytest -q tests/py/spec/remaining_root_specs/workstation_cluster_pxe/test_setup_pxe_guards.py`
-> expected: FAIL (2 failed, 8 passed).

## Task 2 — Gruenphase

Nach p1 und p2 denselben Befehl ausfuehren -> expected: PASS (10 passed
oder 9 passed + 1 skipped ohne dnsmasq).
