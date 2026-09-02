-- Add Penpot (design tool) to the platform.software_assets catalog.
-- Penpot was deployed to the cluster (k3d/penpot.yaml) but never seeded
-- into the website's Platform Hub inventory — so it does not appear as an
-- available server on web.mentolder.de.
--
-- Idempotent: INSERT ... ON CONFLICT DO UPDATE.
INSERT INTO platform.software_assets
  (slug, name, description, category, emoji, clusters, namespace, deployment_name, image_tag, base_status, sort_order)
VALUES
  ('penpot', 'Penpot', 'Open-source design & prototyping platform', 'design', '🎨', '{mentolder,korczewski}', 'workspace', 'penpot', ':2.17.2', 'live', 55)
ON CONFLICT (slug) DO UPDATE SET
  description    = EXCLUDED.description,
  clusters       = EXCLUDED.clusters,
  namespace      = EXCLUDED.namespace,
  deployment_name = EXCLUDED.deployment_name,
  image_tag      = EXCLUDED.image_tag,
  base_status    = EXCLUDED.base_status,
  sort_order     = EXCLUDED.sort_order,
  updated_at     = now();
