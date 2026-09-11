# Proposal: Batch: SA-Security-Fixes (SEC-01/02/03/04)

## Why

Der System-Audit vom 2026-09-02 hat vier zusammenhaengende Sicherheits- und Zertifikats-Defekte im Fleet-Cluster identifiziert:
1. \sessions-wildcard\ Cert in \workspace\ fordert \*.\ an, da \SESSIONS_DOMAIN\ in \nvironments/schema.yaml\ fehlte (ACME 400 rejectedIdentifier).
2. \lux-webhook\ Cert und IngressRoute in \lux-system\ tragen unersetzbare \\ und \\ Platzhalter, da \lux/\ ohne Substitution appliziert wird.
3. Der \cert-manager-lego-webhook\ scheitert beim ACME-Cleanup gegen ipv64 mit \403 Forbidden\ (\del_record\), wodurch eine Challenge seit 95 Tagen blockiert.
4. \korczewski.de\ liefert auf allen Pfaden (inkl. \/impressum\ und \/datenschutz\) HTTP 503, obwohl der Brand im DNS aktiv auf den Cluster zeigt (Verstoss gegen § 5 DDG und Art. 13 DSGVO).

## What Changes

- **SESSIONS_DOMAIN in schema.yaml & mentolder.yaml aufnehmen**: Deklaration im SSOT-Schema und Export fuer den Render-Pfad, zusaetzlich Render-Guard gegen unersetzte Platzhalter in Cert-DNSNames.
- **Flux-Webhook-Manifeste fixieren**: Da \lux/clusters/fleet/\ cluster-spezifisch ist, werden die Host- und Domain-Werte in \certificate-flux-webhook.yaml\ und \ingressroute-flux-webhook.yaml\ konsistent literal oder via Kustomize-Substitutionsquelle bereitgestellt.
- **ipv64 ACME-Challenge-Cleanup absichern & Stale Challenge verwerfen**: Berechtigungen/API-Token des ipv64 Webhooks fuer \del_record\ verifizieren und die 95 Tage alte blockierende Challenge bereinigen.
- **korczewski.de rechtssicher bedienen**: Entweder Bereitstellung einer leichtgewichtigen statischen Landing-/Parkseite (Impressum + Datenschutz) in \website-korczewski\ ausserhalb des suspendierten Stacks, oder Abzug des aktiven DNS-Routings.

## Capabilities

### New Capabilities

### Modified Capabilities
- \leet-operations\: Absicherung von Wildcard-Zertifikaten (sessions-wildcard, flux-webhook), ACME DNS-01 Challenge Cleanup via ipv64 und rechtssichere Domain-Verfuegbarkeit bei suspendierten Brands.

## Impact

- \nvironments/schema.yaml\: Ergaenzung von \SESSIONS_DOMAIN- \nvironments/mentolder.yaml\: Definition von \SESSIONS_DOMAIN: sessions.mentolder.de- \lux/clusters/fleet/bootstrap/certificate-flux-webhook.yaml\ & \ingressroute-flux-webhook.yaml\: Eliminierung unersetzter Platzhalter
- \lux/clusters/fleet/ks-korczewski.yaml\ / DNS: Rechtssichere Behandlung des Brand-Freeze fuer Impressum & Datenschutz
- \	ests/spec/fleet-operations/\: BATS-Guards zur Absicherung der Zertifikats- und Render-Integritaet
