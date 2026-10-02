# Proposal: svc-probe-brain (T900916)

## Problem

`service-health-goals.bats` meldet rot: `svc-probe` (G-SVC01) zaehlt
`1` ungedeckten Produktions-Ingress, erwartet `0`. Eingefuehrt mit der
Brain-Arbeit von heute (T900859–T900861), sichtbar via CI von PR #6180.

## Symptom vs. Ursache (T002448-M5)

- Symptom (Fakt): `python3 scripts/lib/runtime-health-measure.py svc-probe`
  gibt `1` aus; der BATS-Test `svc-probe: existiert als measurement choice`
  faellt mit `FAIL: svc-probe meldet '1' ungedeckte Produktions-Ingresses.`
- Ursache (verifiziert, kein Rate-Verdacht): `svc_probe()` in
  `scripts/lib/runtime-health-measure.py` vergleicht Ingress-Hosts aus
  `prod-fleet/mentolder` und `prod-fleet/korczewski` gegen die statischen
  Blackbox-Targets in `k3d/monitoring/blackbox-exporter.yaml` — per
  Subdomain-Label (`brain`, `studio`, `langfuse-dev`). Der neue Ingress
  `workspace-ingress-brain` (`brain.${prod_domain}` in
  `prod-fleet/mentolder/brain.yaml`) hat kein Target mit Label `brain`;
  `studio` und `langfuse-dev` sind abgedeckt. Reproduziert am 2026-10-02
  auf `main@4f505c1ee` (Messung `1`, BATS `not ok`).

## Optionen

1. Probe-Target ergaenzen (gewaehlt): `- https://brain.mentolder.de` in die
   statische Target-Liste aufnehmen. Der Ingress ist ein echter
   Produktions-Host, also gehoert er in die Messbasis.
2. Ingress aus der Messbasis ausnehmen: verworfen — wuerde einen echten
   Prod-Host blind schalten und die Guard-Aussage schwaechen.

## Fix-Ansatz

Eine Zeile in `k3d/monitoring/blackbox-exporter.yaml` (Probe
`brand-public-health`, Modul `http_2xx`), einsortiert bei den
mentolder-Hosts. Kein Relabeling noetig: `relabelingConfigs` kennt nur
`web.*`-Regeln, und der Coverage-Vergleich nutzt nur das
Subdomain-Label. S3-clean: die Datei steht in
`s3.allowlist_files` (`docs/code-quality/gates.yaml`), weil synthetisches
Monitoring bewusst auf die oeffentlichen Brand-Identitaeten zielt.

## Akzeptanz

- `python3 scripts/lib/runtime-health-measure.py svc-probe` gibt `0` aus.
- BATS `svc-probe`-Test gruen; `task workspace:validate` gruen.
- Kein neuer Test noetig: der existierende G-SVC01-Guard IST der
  Rot-Gruen-Test (RED auf dem Branch belegt, siehe `design.md`).

## Nicht-Ziele

- Kein neues Probe-Modul, kein Health-Pfad am brain-Proxy, keine
  SSO-/oauth2-proxy-Aenderung (Edge-Case dokumentiert in `design.md` E2).
- Keine Aenderung an `runtime-health-measure.py` oder `brain.yaml`.
