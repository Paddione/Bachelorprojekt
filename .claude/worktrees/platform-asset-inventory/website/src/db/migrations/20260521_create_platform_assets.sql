-- website/src/db/migrations/20260521_create_platform_assets.sql
CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.software_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL DEFAULT 'other',
  emoji           TEXT NOT NULL DEFAULT '📦',
  clusters        TEXT[] NOT NULL DEFAULT '{}',
  namespace       TEXT,
  deployment_name TEXT,
  image_tag       TEXT,
  url             TEXT,
  base_status     TEXT NOT NULL DEFAULT 'live',
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.hardware_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  role          TEXT NOT NULL,
  cluster       TEXT NOT NULL,
  location      TEXT,
  ip            TEXT,
  os            TEXT,
  k8s_node_name TEXT NOT NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA platform TO website;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA platform TO website;

-- ── Software Seed ────────────────────────────────────────────────────────────
INSERT INTO platform.software_assets
  (slug, name, description, category, emoji, clusters, namespace, deployment_name, image_tag, base_status, sort_order)
VALUES
  ('website',            'Website',            'Astro + Svelte frontend',               'frontend',   '🌐', ARRAY['mentolder','korczewski'], 'website',              'website',           ':latest',  'live',     10),
  ('keycloak',           'Keycloak',           'SSO / OIDC identity provider',          'auth',       '🔑', ARRAY['mentolder','korczewski'], 'workspace',            'keycloak',          ':22.0',    'live',     20),
  ('nextcloud',          'Nextcloud',          'File storage + groupware',              'storage',    '☁️', ARRAY['mentolder','korczewski'], 'workspace',            'nextcloud',         ':29',      'live',     30),
  ('collabora',          'Collabora',          'Online office suite',                   'storage',    '📄', ARRAY['mentolder','korczewski'], 'workspace',            'collabora',         ':latest',  'live',     40),
  ('vaultwarden',        'Vaultwarden',        'Password manager (Bitwarden-compat)',   'security',   '🔒', ARRAY['mentolder','korczewski'], 'workspace',            'vaultwarden',       ':latest',  'live',     50),
  ('nextcloud-talk-hpb', 'Talk HPB',           'Nextcloud Talk signaling server',       'messaging',  '📡', ARRAY['mentolder','korczewski'], 'workspace',            'talk-hpb',          ':latest',  'live',     60),
  ('brett',              'Brett',              '3D systemic-constellation board',       'dev',        '🧩', ARRAY['mentolder','korczewski'], 'workspace',            'brett',             ':latest',  'live',     70),
  ('mailpit',            'Mailpit',            'SMTP dev mailbox',                      'dev',        '📬', ARRAY['mentolder','korczewski'], 'workspace',            'mailpit',           ':latest',  'live',     80),
  ('docuseal',           'DocuSeal',           'Document signing',                      'other',      '📝', ARRAY['mentolder','korczewski'], 'workspace',            'docuseal',          ':latest',  'live',     90),
  ('tracking',           'Tracking',           'Matomo Analytics replacement',          'other',      '📊', ARRAY['mentolder','korczewski'], 'workspace',            'tracking',          ':latest',  'live',    100),
  ('whiteboard',         'Whiteboard',         'Collaborative drawing',                 'other',      '🎨', ARRAY['mentolder','korczewski'], 'workspace',            'whiteboard',        ':latest',  'live',    110),
  ('arena',              'Arena',              'Multiplayer game server',               'other',      '🎮', ARRAY['korczewski'],             'workspace-korczewski', 'arena-server',       ':latest',  'live',    120),
  ('docs',               'Documentation',      'Platform documentation (Docsify)',      'other',      '📚', ARRAY['mentolder','korczewski'], 'workspace',            'docs',              ':latest',  'live',    130)
ON CONFLICT (slug) DO NOTHING;

-- ── Hardware Seed ────────────────────────────────────────────────────────────
INSERT INTO platform.hardware_assets
  (slug, name, description, role, cluster, location, ip, os, k8s_node_name, sort_order)
VALUES
  ('gekko-hetzner-2', 'Gekko CP 1', 'Control-plane Helsinki', 'control-plane', 'mentolder', 'Helsinki', '46.225.125.40', 'Debian 12', 'gekko-hetzner-2', 10),
  ('gekko-hetzner-3', 'Gekko CP 2', 'Control-plane Helsinki', 'control-plane', 'mentolder', 'Helsinki', '46.225.125.59', 'Debian 12', 'gekko-hetzner-3', 20),
  ('gekko-hetzner-4', 'Gekko CP 3', 'Control-plane Helsinki', 'control-plane', 'mentolder', 'Helsinki', '46.225.125.61', 'Debian 12', 'gekko-hetzner-4', 30),
  ('k3s-1',           'k3s-1',      'Home Worker 1',          'worker',        'mentolder', 'Home',     '192.168.1.51',  'Ubuntu 22.04', 'k3s-1', 40),
  ('k3s-2',           'k3s-2',      'Home Worker 2',          'worker',        'mentolder', 'Home',     '192.168.1.52',  'Ubuntu 22.04', 'k3s-2', 50),
  ('k3s-3',           'k3s-3',      'Home Worker 3',          'worker',        'mentolder', 'Home',     '192.168.1.53',  'Ubuntu 22.04', 'k3s-3', 60),
  ('pk-hetzner-4',    'PK CP 1',    'Control-plane Helsinki', 'control-plane', 'korczewski', 'Helsinki', '46.225.125.44', 'Debian 12', 'pk-hetzner-4', 10),
  ('pk-hetzner-6',    'PK Worker 1', 'Worker Helsinki',       'worker',        'korczewski', 'Helsinki', '46.225.125.46', 'Debian 12', 'pk-hetzner-6', 20),
  ('pk-hetzner-8',    'PK Worker 2', 'Worker Helsinki',       'worker',        'korczewski', 'Helsinki', '46.225.125.48', 'Debian 12', 'pk-hetzner-8', 30)
ON CONFLICT (slug) DO NOTHING;
