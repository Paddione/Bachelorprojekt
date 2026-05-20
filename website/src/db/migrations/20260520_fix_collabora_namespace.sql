-- Fix collabora namespace: deployed in workspace-office, not workspace.
-- The health check URL and K8s deployment lookup both fail when namespace = 'workspace'.
UPDATE platform.software_assets
SET namespace   = 'workspace-office',
    updated_at  = now()
WHERE slug = 'collabora'
  AND namespace = 'workspace';
