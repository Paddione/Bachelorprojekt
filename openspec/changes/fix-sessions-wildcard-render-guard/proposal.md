# Proposal: fix-sessions-wildcard-render-guard

_Ticket: T900029 (child of T900042, done — eigenständig geplant)_

## Why

Das PROD-Certificate `workspace/sessions-wildcard` wurde mit `dnsNames: ["*."]`
gerendert — `${SESSIONS_DOMAIN}` wurde durch nichts ersetzt, Let's Encrypt
lehnt mit `rejectedIdentifier` ab (`*` ohne Public Suffix). Der Erneuerungspfad
ist tot; das aktive Zertifikat läuft am 2026-11-17 ab.

Statische Hälfte bereits erledigt: Parent-Commit `654b4b8ae` (T900042) hat
`SESSIONS_DOMAIN` in `environments/schema.yaml` deklariert und in
`environments/mentolder.yaml` gesetzt — `env-resolve.sh` exportiert die Variable
damit wieder (vorher wurde sie trotz Wert in `fleet-mentolder.yaml` verworfen,
weil nur schema-deklarierte `env_vars` exportiert werden). Der Hygiene-Test
`tests/spec/fleet-operations/security-cert-hygiene.bats` (SA-SEC-01) prüft das
statisch. Was fehlt, ist die zweite Ticket-Hälfte: ein Render-Guard, der diese
Fehlerklasse (leere/übrig gebliebene `${...}`-Platzhalter in `dnsNames` und
`Host()`/`HostRegexp()`-Matches) zum Build-Fehler macht, statt sie erst in Prod
sichtbar werden zu lassen.

## What

1. **Gezielter Render-Guard für TLS-/Routing-Platzhalter:** Nach der Substitution
   (beide Render-Pfade: `scripts/flux-render-artifact.sh` UND der
   Taskfile-`workspace:deploy`-Pfad) wird geprüft, dass gerenderte Manifeste
   keine leeren Wildcard-Reste (`"*."`, `Host(\`*\`)`) und keine übrig
   gebliebenen `${VAR}`-Referenzen in `dnsNames:`- und
   `Host`/`HostRegexp`-Zeilen enthalten. Fund = Build-Fehler (fail-closed).
2. **Failing-Test zuerst (Rot-Grün):** neuer BATS-Test unter
   `tests/spec/fleet-operations/` (z. B. `sessions-wildcard-render-guard.bats`),
   der den Guard mit einem `SESSIONS_DOMAIN=""`-Render triggert
   (`expected: FAIL` auf Rot).
3. **Kein globaler `required:true`:** `SESSIONS_DOMAIN` bleibt schema-optional,
   weil die Marke korczewski keinen Sessions-Overlay hat (`prod-fleet/korczewski/`
   enthält kein sessions-Cert) — ein globales Required würde korczewski brechen.
   Stattdessen greift der Guard nur dort, wo Sessions-Manifeste gerendert werden.

## Non-Goals

- Kein Re-Issue/Renew des Live-Zertifikats in dieser Change (folgt nach Guard +
  Deploy automatisch über cert-manager DNS-01).
- Keine Änderung an korczewski-Overlays (kein Sessions-Cert dort).
- Kein genereller "leere Variable = Fehler"-Check im Flux-Render — T002174
  dokumentiert bewusst dutzende legitim leere `${VAR}`-Referenzen; der Guard
  ist auf `dnsNames`/`Host`-Zeilen begrenzt.

## Betrachtete Alternativen

- **A (gewählt): gezielter Guard auf dnsNames/Host-Zeilen.** Präzise,
  T002174-kompatibel, kein False-Positive-Risiko für ConfigMap-Skripte.
- **B (verworfen): `SESSIONS_DOMAIN` global `required: true`.** Würde
  korczewski- und Dev-Renders brechen, die keinen Sessions-Overlay haben.
- **C (verworfen): nur statischer grep-Test wie SA-SEC-01.** Deckt genau den
  Wiederholungsfall nicht ab: Variable deklariert, aber im Render-Pfad leer
  (der Originalfehler war ein leer substituierter, kein fehlender Platzhalter —
  ein generischer `${`-Grep hätte `*.` nie gefunden).
