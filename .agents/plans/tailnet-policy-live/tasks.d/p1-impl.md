---
title: "p1-impl — Repo auf Live-Tailnet angleichen"
ticket_id: T016528
domains: [infra, scripts]
status: draft
---

# tailnet-policy-live — Implementation Plan

## Task 1 — Policy und Inventar

1. `devmesh/tailnet-policy.hujson` = Live-Export (grants, ssh, nodeAttrs,
   tagOwners inkl. `tag:lan-dns`, autoApprovers `10.0.0.0/24 -> tag:gpu-server`)
   mit Kopfkommentar: Spiegel der Live-Policy, Aenderungen ueber Admin-Konsole oder
   API (`POST /api/v2/tailnet/-/acl` mit `If-Match`), danach hier nachziehen.
2. Inventar: Server `tag: "tag:gpu-server"`, Clients `tag: null`; Kopfkommentar.

## Task 2 — tailnet-check.sh

`expected_tag = {"server": "tag:gpu-server", "client": None}`; Client mit Tag
-> Fehler "... ist ein Benutzergeraet ohne Tag ...".

## Task 3 — Doku und Kommentare

Runbooks `devmesh-tailnet.md`, `cloud-env-devmesh.md`, `devmesh-lan-dns.md`,
`networks.yaml`, `networks-map.md`, Kommentare in `cloud-env/setup.sh`:
`tag:devmesh` -> `tag:gpu-server`, `tag:devclient` entfaellt (grants erlauben
den Zugriff; Cloud-Env-Key ohne Pflicht-Tag), Test-Fixture-Inventar angleichen.
