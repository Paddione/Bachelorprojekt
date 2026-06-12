-- website/src/db/migrations/20260612_add_service_links.sql
-- Verknüpft platform.software_assets mit laufenden Diensten:
--   subdomain  → öffentliche Subdomain (effektive URL = url ?? https://<subdomain>.<PROD_DOMAIN>)
--   health_url → internes Health-Probe-Template mit {ns}-Platzhalter (NULL = nicht probebar)
-- Additiv & idempotent. Spalten via IF NOT EXISTS; Seeds via UPDATE pro Slug.

ALTER TABLE platform.software_assets
  ADD COLUMN IF NOT EXISTS subdomain  TEXT,
  ADD COLUMN IF NOT EXISTS health_url TEXT;

-- ── Subdomains (verifiziert aus k3d/ingress.yaml + configmap-domains.yaml) ────
UPDATE platform.software_assets SET subdomain = 'auth'       WHERE slug = 'keycloak';
UPDATE platform.software_assets SET subdomain = 'files'      WHERE slug = 'nextcloud';
UPDATE platform.software_assets SET subdomain = 'office'     WHERE slug = 'collabora';
UPDATE platform.software_assets SET subdomain = 'vault'      WHERE slug = 'vaultwarden';
UPDATE platform.software_assets SET subdomain = 'board'      WHERE slug = 'whiteboard';
UPDATE platform.software_assets SET subdomain = 'mail'       WHERE slug = 'mailpit';
UPDATE platform.software_assets SET subdomain = 'docs'       WHERE slug = 'docs';
UPDATE platform.software_assets SET subdomain = 'brett'      WHERE slug = 'brett';
UPDATE platform.software_assets SET subdomain = 'brainstorm' WHERE slug = 'brainstorm';
UPDATE platform.software_assets SET subdomain = 'livekit'    WHERE slug = 'livekit';
UPDATE platform.software_assets SET subdomain = 'web'        WHERE slug = 'website';
UPDATE platform.software_assets SET subdomain = 'sign'       WHERE slug = 'docuseal';

-- ── Health-URLs (mit {ns}-Platzhalter; collabora ist geteilt, kein {ns}) ──────
-- Die 5 bestehenden aus api/admin/ops/health.ts, 1:1 (workspace → {ns}):
UPDATE platform.software_assets SET health_url = 'http://keycloak.{ns}.svc.cluster.local:8080/health/ready'             WHERE slug = 'keycloak';
UPDATE platform.software_assets SET health_url = 'http://nextcloud.{ns}.svc.cluster.local/status.php'                    WHERE slug = 'nextcloud';
UPDATE platform.software_assets SET health_url = 'http://collabora.workspace-office.svc.cluster.local:9980/hosting/capabilities' WHERE slug = 'collabora';
UPDATE platform.software_assets SET health_url = 'http://vaultwarden.{ns}.svc.cluster.local/alive'                       WHERE slug = 'vaultwarden';
UPDATE platform.software_assets SET health_url = 'http://website.{ns}.svc.cluster.local'                                 WHERE slug = 'website';
-- Zusätzliche probebare HTTP-Dienste (Root-Pfad, < 500 = ok):
UPDATE platform.software_assets SET health_url = 'http://brett.{ns}.svc.cluster.local'         WHERE slug = 'brett';
UPDATE platform.software_assets SET health_url = 'http://docs.{ns}.svc.cluster.local'          WHERE slug = 'docs';
UPDATE platform.software_assets SET health_url = 'http://mailpit.{ns}.svc.cluster.local:8025'  WHERE slug = 'mailpit';
UPDATE platform.software_assets SET health_url = 'http://whiteboard.{ns}.svc.cluster.local'    WHERE slug = 'whiteboard';
UPDATE platform.software_assets SET health_url = 'http://docuseal.{ns}.svc.cluster.local:3000' WHERE slug = 'docuseal';
UPDATE platform.software_assets SET health_url = 'http://brainstorm-sish.{ns}.svc.cluster.local' WHERE slug = 'brainstorm';
