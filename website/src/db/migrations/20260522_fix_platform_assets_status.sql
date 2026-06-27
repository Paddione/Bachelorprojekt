-- Fix platform.software_assets entries that produced incorrect live_status
-- in the Platform Hub software inventory.
-- Idempotent: uses INSERT ... ON CONFLICT DO UPDATE for missing system rows.

-- ── System-level rows (missing from original seed) ───────────────────────────
-- These were present in production but absent from the initial seed.
INSERT INTO platform.software_assets
  (slug, name, description, category, emoji, clusters, namespace, deployment_name, image_tag, base_status, sort_order)
VALUES
  ('postgresql',     'PostgreSQL 16',         'Shared database server',                                            'other',    '🐘', '{mentolder,korczewski}', 'workspace',        'shared-db',           ':16',     'live',     100),
  ('traefik',        'Traefik',               'Kubernetes ingress controller (k3s DaemonSet, kube-system)',        'other',    '🔀', '{mentolder,korczewski}', 'kube-system',      NULL,                  ':latest',  'live',     150),
  ('sealed-secrets', 'Sealed Secrets',        'Bitnami Sealed Secrets controller — encrypts k8s Secrets at rest', 'security', '🔐', '{mentolder,korczewski}', 'sealed-secrets',   NULL,                  ':latest',  'live',     160),
  ('cert-manager',   'cert-manager',          'cert-manager — ACME / DNS-01 TLS certificate automation',          'security', '📜', '{mentolder,korczewski}', 'cert-manager',     NULL,                  ':latest',  'live',     170),
  ('k3s',            'k3s / k3d',             'Lightweight Kubernetes distribution',                               'other',    '☸️', '{mentolder,korczewski}', NULL,               NULL,                  NULL,       'live',     180),
  ('wireguard',      'WireGuard (wg-mesh)',   'VPN mesh overlay connecting all mentolder cluster nodes',           'other',    '🔗', '{mentolder}',            NULL,               NULL,                  NULL,       'live',     190),
  ('tei',            'TEI (Text Embeddings)', 'Text Embeddings Inference — bge-m3 via GPU host on wg-mesh',       'other',    '🦾', '{mentolder}',            NULL,               NULL,                  NULL,       'optional', 200),
  ('openclaw',       'OpenClaw',              'OpenClaw AI assistant daemon on WSL GPU host (Ollama 10.10.0.3)',   'other',    '🦅', '{mentolder}',            NULL,               NULL,                  NULL,       'live',     210),
  ('livekit',        'LiveKit Server',        'WebRTC server (hostNetwork, pinned to gekko-hetzner-3)',            'messaging','📡', '{mentolder}',            'workspace',        'livekit-server',      ':latest',  'live',     220),
  ('livekit-ingress','LiveKit Ingress',       'RTMP ingest endpoint',                                             'messaging','📺', '{mentolder}',            'workspace',        'livekit-ingress',     ':latest',  'optional', 230),
  ('livekit-egress', 'LiveKit Egress',        'Stream recording',                                                 'messaging','🔴', '{mentolder}',            'workspace',        'livekit-egress',      ':latest',  'optional', 240),
  ('whisper',        'Whisper',               'OpenAI Whisper speech-to-text transcription',                       'other',    '🎙️', '{mentolder}',            'workspace',        'whisper',             ':latest',  'optional', 250),
  ('talk-transcriber','Talk Transcriber',     'Nextcloud Talk auto-transcription bot',                            'messaging','📝', '{mentolder}',            'workspace',        'talk-transcriber',    ':latest',  'optional', 260),
  ('mcp',            'MCP Monolith',          'Claude Code MCP proxy (auth + ops pods, mentolder only)',           'dev',      '🤖', '{mentolder}',            'workspace',        'claude-code-mcp-auth',':latest',  'live',     270),
  ('brainstorm',     'Brainstorm Sish',       'Reverse-SSH tunnel endpoint (ad-hoc dev tunnels)',                 'dev',      '🌀', '{mentolder}',            'workspace',        'brainstorm-sish',     ':latest',  'live',     280),
  ('arena-server',   'Arena Server',          'Multiplayer 3D game server (korczewski only) — JWT validated from both Keycloak realms', 'other', '🎮', '{korczewski}', 'workspace-korczewski', 'arena-server', ':latest', 'live', 290)
ON CONFLICT (slug) DO UPDATE SET
  description    = EXCLUDED.description,
  clusters       = EXCLUDED.clusters,
  namespace      = EXCLUDED.namespace,
  deployment_name = EXCLUDED.deployment_name,
  base_status    = EXCLUDED.base_status,
  updated_at     = now();

-- ── Data corrections for existing rows ───────────────────────────────────────

-- Traefik: k3s runs Traefik as a DaemonSet in kube-system, not a Deployment.
-- Website SA RBAC is scoped to workspace namespace only → null deployment_name
-- so the API falls to the infra-alive check (k8s connectivity → ready).
UPDATE platform.software_assets
SET deployment_name = NULL,
    description = 'Kubernetes ingress controller (k3s DaemonSet, kube-system)'
WHERE slug = 'traefik' AND deployment_name IS NOT NULL;

-- Sealed Secrets: controller lives in sealed-secrets namespace, not kube-system.
-- RBAC limitation → null deployment_name, fix namespace.
UPDATE platform.software_assets
SET namespace = 'sealed-secrets',
    deployment_name = NULL,
    description = 'Bitnami Sealed Secrets controller — encrypts k8s Secrets at rest'
WHERE slug = 'sealed-secrets' AND (namespace = 'kube-system' OR deployment_name IS NOT NULL);

-- cert-manager: cert-manager namespace is outside website SA RBAC scope.
UPDATE platform.software_assets
SET deployment_name = NULL,
    description = 'cert-manager — ACME / DNS-01 TLS certificate automation'
WHERE slug = 'cert-manager' AND deployment_name IS NOT NULL;

-- MCP: actual deployment is claude-code-mcp-auth (renamed from monolith).
UPDATE platform.software_assets
SET deployment_name = 'claude-code-mcp-auth',
    description = 'Claude Code MCP proxy (auth + ops pods, mentolder only)'
WHERE slug = 'mcp' AND deployment_name = 'claude-code-mcp-monolith';

-- TEI: llm-gateway-embed is a ClusterIP Service to the GPU host, not a Deployment.
-- Demote to optional; mentolder-only (GPU is on mentolder wg-mesh).
UPDATE platform.software_assets
SET deployment_name = NULL,
    namespace      = NULL,
    base_status    = 'optional',
    clusters       = '{mentolder}',
    description    = 'Text Embeddings Inference — bge-m3 via GPU host on wg-mesh (llm-gateway-embed Service)'
WHERE slug = 'tei' AND (deployment_name IS NOT NULL OR clusters @> '{korczewski}');

-- OpenClaw: systemd service on WSL GPU host, not a k8s workload.
UPDATE platform.software_assets
SET clusters       = '{mentolder}',
    namespace      = NULL,
    deployment_name = NULL,
    description    = 'OpenClaw AI assistant daemon on WSL GPU host (talks to Ollama 10.10.0.3:11434/v1)'
WHERE slug = 'openclaw' AND (clusters = '{}' OR deployment_name IS NOT NULL);
