-- Asset Pack 02: Brett sets, identity assets, arena SVGs
-- file_path is relative to assets/ root (same convention as assets-index.sh)

INSERT INTO assets.registry (name, type, file_path, tags, metadata) VALUES

-- ── Brett set: mentolder / characters ──────────────────────────────────────
('coachee.portrait.svg',    'image', 'branding/mentolder/brett/characters/coachee.portrait.svg',
  ARRAY['brett','mentolder','character','coaching'],
  '{"brand":"mentolder","set":"brett","category":"character","width":240,"height":320,"pack":"02"}'::jsonb),

('coachee.figurine.svg',    'image', 'branding/mentolder/brett/characters/coachee.figurine.svg',
  ARRAY['brett','mentolder','character','coaching'],
  '{"brand":"mentolder","set":"brett","category":"character","width":240,"height":320,"pack":"02"}'::jsonb),

('team-member-active.svg',  'image', 'branding/mentolder/brett/characters/team-member-active.svg',
  ARRAY['brett','mentolder','character','coaching'],
  '{"brand":"mentolder","set":"brett","category":"character","width":240,"height":320,"pack":"02"}'::jsonb),

('team-member-passive.svg', 'image', 'branding/mentolder/brett/characters/team-member-passive.svg',
  ARRAY['brett','mentolder','character','coaching'],
  '{"brand":"mentolder","set":"brett","category":"character","width":240,"height":320,"pack":"02"}'::jsonb),

('saboteur.svg',            'image', 'branding/mentolder/brett/characters/saboteur.svg',
  ARRAY['brett','mentolder','character','coaching'],
  '{"brand":"mentolder","set":"brett","category":"character","width":240,"height":320,"pack":"02"}'::jsonb),

-- ── Brett set: mentolder / props ────────────────────────────────────────────
('prop-target.svg',  'image', 'branding/mentolder/brett/props/prop-target.svg',
  ARRAY['brett','mentolder','prop','coaching'],
  '{"brand":"mentolder","set":"brett","category":"prop","width":200,"height":200,"pack":"02"}'::jsonb),

('prop-barrier.svg', 'image', 'branding/mentolder/brett/props/prop-barrier.svg',
  ARRAY['brett','mentolder','prop','coaching'],
  '{"brand":"mentolder","set":"brett","category":"prop","width":200,"height":200,"pack":"02"}'::jsonb),

('prop-balance.svg', 'image', 'branding/mentolder/brett/props/prop-balance.svg',
  ARRAY['brett','mentolder','prop','coaching'],
  '{"brand":"mentolder","set":"brett","category":"prop","width":200,"height":200,"pack":"02"}'::jsonb),

('prop-shield.svg',  'image', 'branding/mentolder/brett/props/prop-shield.svg',
  ARRAY['brett','mentolder','prop','coaching'],
  '{"brand":"mentolder","set":"brett","category":"prop","width":200,"height":200,"pack":"02"}'::jsonb),

-- ── Brett set: mentolder / terrain ──────────────────────────────────────────
('fog-wash.svg',     'image', 'branding/mentolder/brett/terrain/fog-wash.svg',
  ARRAY['brett','mentolder','terrain','coaching'],
  '{"brand":"mentolder","set":"brett","category":"terrain","pack":"02"}'::jsonb),

('focus-circle.svg', 'image', 'branding/mentolder/brett/terrain/focus-circle.svg',
  ARRAY['brett','mentolder','terrain','coaching'],
  '{"brand":"mentolder","set":"brett","category":"terrain","pack":"02"}'::jsonb),

-- ── Brett set: korczewski / characters ─────────────────────────────────────
('sysadmin.svg',         'image', 'branding/korczewski/brett/characters/sysadmin.svg',
  ARRAY['brett','korczewski','character','devops'],
  '{"brand":"korczewski","set":"brett","category":"character","width":240,"height":320,"pack":"02"}'::jsonb),

('security-officer.svg', 'image', 'branding/korczewski/brett/characters/security-officer.svg',
  ARRAY['brett','korczewski','character','devops'],
  '{"brand":"korczewski","set":"brett","category":"character","width":240,"height":320,"pack":"02"}'::jsonb),

('product-owner.svg',    'image', 'branding/korczewski/brett/characters/product-owner.svg',
  ARRAY['brett','korczewski','character','devops'],
  '{"brand":"korczewski","set":"brett","category":"character","width":240,"height":320,"pack":"02"}'::jsonb),

-- ── Brett set: korczewski / props ───────────────────────────────────────────
('prop-database.svg', 'image', 'branding/korczewski/brett/props/prop-database.svg',
  ARRAY['brett','korczewski','prop','devops'],
  '{"brand":"korczewski","set":"brett","category":"prop","width":200,"height":200,"pack":"02"}'::jsonb),

('prop-pipeline.svg', 'image', 'branding/korczewski/brett/props/prop-pipeline.svg',
  ARRAY['brett','korczewski','prop','devops'],
  '{"brand":"korczewski","set":"brett","category":"prop","width":200,"height":200,"pack":"02"}'::jsonb),

('prop-firewall.svg', 'image', 'branding/korczewski/brett/props/prop-firewall.svg',
  ARRAY['brett','korczewski','prop','devops'],
  '{"brand":"korczewski","set":"brett","category":"prop","width":200,"height":200,"pack":"02"}'::jsonb),

('prop-alert.svg',    'image', 'branding/korczewski/brett/props/prop-alert.svg',
  ARRAY['brett','korczewski','prop','devops'],
  '{"brand":"korczewski","set":"brett","category":"prop","width":200,"height":200,"pack":"02"}'::jsonb),

-- ── Brett set: korczewski / terrain ─────────────────────────────────────────
('subnet-grid.svg',        'image', 'branding/korczewski/brett/terrain/subnet-grid.svg',
  ARRAY['brett','korczewski','terrain','devops'],
  '{"brand":"korczewski","set":"brett","category":"terrain","pack":"02"}'::jsonb),

('namespace-boundary.svg', 'image', 'branding/korczewski/brett/terrain/namespace-boundary.svg',
  ARRAY['brett','korczewski','terrain','devops'],
  '{"brand":"korczewski","set":"brett","category":"terrain","pack":"02"}'::jsonb),

-- ── Identity: Keycloak backgrounds ──────────────────────────────────────────
('keycloak-bg-mentolder.svg', 'image', 'branding/mentolder/identity/keycloak-bg-mentolder.svg',
  ARRAY['identity','mentolder','keycloak','login'],
  '{"brand":"mentolder","category":"identity","width":1920,"height":1080,"usage":"keycloak-login-bg","pack":"02"}'::jsonb),

('keycloak-bg-korczewski.svg', 'image', 'branding/korczewski/identity/keycloak-bg-korczewski.svg',
  ARRAY['identity','korczewski','keycloak','login'],
  '{"brand":"korczewski","category":"identity","width":1920,"height":1080,"usage":"keycloak-login-bg","pack":"02"}'::jsonb),

-- ── Identity: Report letterheads ────────────────────────────────────────────
('report-header-mentolder.svg', 'image', 'branding/mentolder/identity/report-header-mentolder.svg',
  ARRAY['identity','mentolder','letterhead','report'],
  '{"brand":"mentolder","category":"identity","width":1240,"height":220,"usage":"docuseal-letterhead","pack":"02"}'::jsonb),

('report-header-korczewski.svg', 'image', 'branding/korczewski/identity/report-header-korczewski.svg',
  ARRAY['identity','korczewski','letterhead','report'],
  '{"brand":"korczewski","category":"identity","width":1240,"height":220,"usage":"docuseal-letterhead","pack":"02"}'::jsonb),

-- ── Identity: Shared OG template ────────────────────────────────────────────
('og-template-docs.svg', 'image', 'branding/shared/identity/og-template-docs.svg',
  ARRAY['identity','shared','og','social'],
  '{"brand":"shared","category":"identity","width":1200,"height":630,"usage":"og-social-card","pack":"02"}'::jsonb),

-- ── Arena: HUD & pickups ────────────────────────────────────────────────────
('hud-frame.svg',    'image', 'arena/hud-frame.svg',
  ARRAY['arena','hud','korczewski','game'],
  '{"category":"arena","width":1920,"height":1080,"usage":"arena-hud-overlay","pack":"02"}'::jsonb),

('pickup-shield.svg', 'image', 'arena/pickup-shield.svg',
  ARRAY['arena','pickup','korczewski','game'],
  '{"category":"arena","width":256,"height":256,"usage":"arena-pickup","effect":"+50 shield","pack":"02"}'::jsonb),

('pickup-speed.svg',  'image', 'arena/pickup-speed.svg',
  ARRAY['arena','pickup','korczewski','game'],
  '{"category":"arena","width":256,"height":256,"usage":"arena-pickup","effect":"+30% sprint","pack":"02"}'::jsonb),

-- ── Audio: SFX spec document ────────────────────────────────────────────────
('audio-sfx-spec.md', 'document', 'audio/spec/audio-sfx-spec.md',
  ARRAY['audio','spec','sfx','howlerjs'],
  '{"category":"audio","pack":"02","note":"procurement-spec-only-no-binaries"}'::jsonb)

ON CONFLICT (file_path) DO UPDATE
  SET name       = EXCLUDED.name,
      type       = EXCLUDED.type,
      tags       = EXCLUDED.tags,
      metadata   = EXCLUDED.metadata,
      updated_at = now();
