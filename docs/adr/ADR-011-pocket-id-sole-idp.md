# ADR-011: Pocket ID als einziger Identity Provider (Keycloak-Ablösung)

**Status:** Accepted
**Datum:** 2026-09-27
**Ticket:** T900560 (extrahiert aus `openspec/specs/auth-sso.md`, C7a)

## Kontext

Die Plattform brauchte einen zentralen Identity Provider für ~20 OIDC-Clients
(Website, Nextcloud, Grafana-Gates, Service-Accounts). Keycloak war historisch
im Einsatz, wurde aber in der Pocket-ID-Migration (T001068, Welle 3) abgeschaltet:
Realm-Modell, Operator-Komplexität und Ressourcenhunger passten nicht zum
Ein-Cluster-Betrieb. Die Keycloak-Artefakte liegen archiviert unter
`docs/archive/keycloak-realms/` (reine Historie, kein Fallback).

## Entscheidung

Pocket ID ist der einzige Identity Provider der Plattform:

- Ausschließlich OIDC Authorization Code Flow; direkte Passwortvergabe,
  implizite Flows und Self-Registration sind deaktiviert.
- Pocket ID kennt **keine Realms** — OIDC-Clients liegen flach und werden per
  `pocket-id-client-seed`-Job provisioniert (idempotent, re-appliable, SSOT
  für Client-Bestand inkl. `workspace-users`-Gruppe).
- Sessions serverseitig (Website: Cookie-Session); Nutzerverwaltung
  programmatisch über die Pocket-ID-Admin-API.
- Prod-Gates verifizieren Issuer-TLS und autorisieren über `groups`-Claim
  oder explizite E-Mail-Allowlist; unsichere OIDC-Flags sind in
  Prod-Overlays verboten.

## Konsequenzen

**Positive Konsequenzen:**
- Ein IdP, ein Client-Inventar, ein Seed-Mechanismus — SSO-Onboarding eines
  neuen Service ist ein Seed-Eintrag statt Realm-Administration.
- Kleine Angriffsfläche: keine Passwort-DBs in Services, keine impliziten Flows.

**Negative Konsequenzen:**
- Kein Enterprise-Feature-Set (kein SAML, keine Realm-Trennung, keine
  föderierten Identitäten) — bei Bedarf neu evaluieren.
- Pocket ID ist Single Point of Authentication; Ausfall blockiert alle Logins
  (Mitigation: Standard-K8s-Verfügbarkeit, keine Sonderlösung).
- Historische Keycloak-Dokumentation bleibt als Beleg erhalten, darf aber
  nicht als Anleitung gelesen werden.
