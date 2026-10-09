---
title: Dev-Brett OIDC wiederherstellen
ticket_id: T901678
domains: [infra, security, test]
status: proposal
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Dev-Brett OIDC wiederherstellen

Fleet Dev-Brett ist Ready und antwortet auf HTTP /healthz mit 200; /auth/login liefert 500. HTTPS führt zum zentralen Pocket-ID mit Fehler „Client does not exist“. Die frühere 404 wurde aktuell nicht reproduziert. Deployment-Konfiguration fehlt vollständig; workspace-dev/workspace-secrets besitzt keine Brett-Schlüssel. Admin-API listet 23 Clients über zwei Seiten: workspace-dev fehlt, brett besitzt ausschließlich Prod-Callbacks. Vorhandene Dev-Secrets stimmen nicht mit Fleet-Provider-Secrets überein.

Das ist eine Konfigurations- und Provisionierungslücke, kein Modellfehler. Dev-Bench 0/60 bleibt Gap-Daten bis Auth und Runner-Orakel repariert sind. Zwei separate Dev-Clients ermöglichen isolierte Callback- und Secret-Verwaltung. Bestehende Prod-Clients werden weder geändert noch rotiert. Vollständiger canonical Seed ist ungeeignet, weil er bestehende Clients aktualisiert.

Umsetzung in einem Fix-Plan: zuerst Helper, Tests und Runbook als reviewbarer Draft, danach ausdrückliche Freigabe zur Neuanlage der zentralen Dev-Clients. Erst mit sicher persistierten und Fleet-versiegelten Secrets dürfen aktive Manifest-Referenzen gemergt werden. Keine Live-Mutation in der Planphase.
