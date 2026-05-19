-- scripts/one-shot/20260518-components-seed.sql
-- Idempotent seed for bachelorprojekt.components.
-- Run on BOTH clusters after schema deploy:
--   task workspace:psql ENV=mentolder -- website < scripts/one-shot/20260518-components-seed.sql
--   task workspace:psql ENV=korczewski -- website < scripts/one-shot/20260518-components-seed.sql

INSERT INTO bachelorprojekt.components (name, kind, area, status, cluster, hostname, notes) VALUES
  -- mentolder control-planes (Hetzner Helsinki)
  ('gekko-hetzner-2', 'physical', 'infra', 'active', 'mentolder', '185.207.228.24', 'CP1, dev k3d host'),
  ('gekko-hetzner-3', 'physical', 'infra', 'active', 'mentolder', '46.225.125.59',  'CP2, LiveKit pin node'),
  ('gekko-hetzner-4', 'physical', 'infra', 'active', 'mentolder', '185.207.228.118','CP3'),
  -- mentolder home-LAN workers (WireGuard mesh)
  ('k3s-1', 'physical', 'infra', 'active', 'mentolder', NULL, 'Home LAN worker'),
  ('k3s-2', 'physical', 'infra', 'active', 'mentolder', NULL, 'Home LAN worker'),
  ('k3s-3', 'physical', 'infra', 'active', 'mentolder', NULL, 'Home LAN worker'),
  ('k3w-1', 'physical', 'infra', 'active', 'mentolder', NULL, 'Home LAN worker'),
  ('k3w-2', 'physical', 'infra', 'active', 'mentolder', NULL, 'Home LAN worker'),
  ('k3w-3', 'physical', 'infra', 'active', 'mentolder', NULL, 'Home LAN worker'),
  -- mentolder GPU host
  ('GPU-Host (RTX 5070 Ti)', 'physical', 'ai', 'active', 'mentolder', '10.10.0.3', 'wg-mesh, LLM + embed + rerank'),
  -- korczewski nodes
  ('pk-hetzner-4', 'physical', 'infra', 'active', 'korczewski', NULL, 'CP1'),
  ('pk-hetzner-6', 'physical', 'infra', 'active', 'korczewski', NULL, 'Worker'),
  ('pk-hetzner-8', 'physical', 'infra', 'active', 'korczewski', NULL, 'Worker')
ON CONFLICT DO NOTHING;

INSERT INTO bachelorprojekt.components (name, kind, area, status, cluster, url, notes) VALUES
  ('Keycloak',            'non-physical', 'auth',      'active', 'both',       NULL, 'SSO/OIDC provider'),
  ('Nextcloud',           'non-physical', 'files',     'active', 'both',       NULL, 'Files + Talk + Calendar'),
  ('Collabora',           'non-physical', 'office',    'active', 'both',       NULL, 'Online office suite'),
  ('Vaultwarden',         'non-physical', 'auth',      'active', 'both',       NULL, 'Password manager'),
  ('DocuSeal',            'non-physical', 'signing',   'active', 'both',       NULL, 'Document signing'),
  ('LiveKit',             'non-physical', 'streaming', 'active', 'mentolder',  NULL, 'WebRTC server, hostNetwork on gekko-hetzner-3'),
  ('LiveKit Ingress',     'non-physical', 'streaming', 'active', 'mentolder',  NULL, 'RTMP ingress for OBS'),
  ('Arena-Server',        'non-physical', 'gaming',    'active', 'korczewski', NULL, 'Multiplayer via arena-ws.korczewski.de'),
  ('Brett (Systembrett)', 'non-physical', 'tools',     'active', 'both',       NULL, '3D systemic-constellation board'),
  ('Website (Astro)',     'non-physical', 'web',       'active', 'both',       NULL, 'Main website + messaging'),
  ('PostgreSQL shared-db','non-physical', 'data',      'active', 'both',       NULL, 'Shared database, one per cluster'),
  ('Claude Code',         'non-physical', 'ai',        'active', 'both',       NULL, 'AI assistant + MCP monolith'),
  ('Whisper Transcriber', 'non-physical', 'ai',        'active', 'mentolder',  NULL, 'Talk transcription bot'),
  ('Traefik',             'non-physical', 'infra',     'active', 'both',       NULL, 'k3s built-in ingress'),
  ('cert-manager',        'non-physical', 'infra',     'active', 'both',       NULL, 'TLS cert automation via DNS-01'),
  ('Sealed Secrets',      'non-physical', 'infra',     'active', 'both',       NULL, 'Bitnami sealed-secrets controller'),
  ('Mailpit',             'non-physical', 'messaging', 'active', 'mentolder',  NULL, 'Dev SMTP trap'),
  ('Janus + coturn',      'non-physical', 'webrtc',    'active', 'both',       NULL, 'Talk HPB signaling + TURN relay')
ON CONFLICT DO NOTHING;
