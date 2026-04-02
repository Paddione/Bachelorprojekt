-- ═══════════════════════════════════════════════════════════════════
-- Pipeline Status Sync — Bring tracking DB in line with reality
-- ═══════════════════════════════════════════════════════════════════
-- Many requirements are already deployed, documented, or in progress
-- but the pipeline table still shows everything as 'pending'.
-- This script bulk-updates statuses based on actual project state.
--
-- Run via:  task tracking:sync-pipeline
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. IDEA stage: mark ALL requirements as done
--    Every requirement has passed the idea/scoping stage.
-- ─────────────────────────────────────────────────────────────────
UPDATE bachelorprojekt.pipeline
   SET status     = 'done',
       updated_at = now(),
       notes      = 'All requirements are past the idea stage'
 WHERE stage = 'idea'
   AND status != 'done';

-- ─────────────────────────────────────────────────────────────────
-- 2. IMPLEMENTATION stage: fully deployed services → done
--    Mattermost, Jitsi, Nextcloud, Keycloak are all running in k3d.
--    Security reqs are met via Keycloak OIDC, TLS, RBAC configs.
--    NFA reqs covered by k8s deployment + open-source stack.
-- ─────────────────────────────────────────────────────────────────
UPDATE bachelorprojekt.pipeline
   SET status     = 'done',
       updated_at = now(),
       notes      = 'Service deployed and verified in k3d cluster'
 WHERE stage = 'implementation'
   AND req_id IN (
     -- FA-01..FA-08: core functional requirements (Mattermost, Jitsi, Nextcloud, Keycloak)
     'FA-01', 'FA-02', 'FA-03', 'FA-04', 'FA-05', 'FA-06', 'FA-07', 'FA-08',
     -- SA-01..SA-06: security requirements (TLS, auth, passwords, sessions, audit, RBAC)
     'SA-01', 'SA-02', 'SA-03', 'SA-04', 'SA-05', 'SA-06',
     -- NFA: non-functional reqs covered by k8s + open-source stack
     'NFA-01', 'NFA-02', 'NFA-03', 'NFA-05', 'NFA-06', 'NFA-07'
   );

-- ─────────────────────────────────────────────────────────────────
-- 3. IMPLEMENTATION stage: partially done / in progress
--    These have manifests or pods but aren't fully verified yet.
-- ─────────────────────────────────────────────────────────────────
UPDATE bachelorprojekt.pipeline
   SET status     = 'in_progress',
       updated_at = now(),
       notes      = 'Manifests exist or pod running, not fully verified'
 WHERE stage = 'implementation'
   AND req_id IN (
     'FA-09',   -- Collabora + Spacedeck: manifests exist
     'FA-10',   -- OpenClaw: manifests exist, not fully verified
     'FA-11',   -- MCP server: manifests exist
     'FA-12',   -- MCP server: manifests exist
     'FA-13',   -- MCP server: manifests exist
     'FA-14',   -- MCP server: manifests exist
     'FA-15',   -- Tracking UI: pod running
     'SA-07',   -- Backup: not yet automated
     'NFA-04'   -- Skalierbarkeit: HPA not yet configured
   );

-- ─────────────────────────────────────────────────────────────────
-- 4. DOCUMENTATION stage: documented requirements → done
--    Core services, security, NFAs, plus architecture & deployment
--    docs that already exist.
-- ─────────────────────────────────────────────────────────────────
UPDATE bachelorprojekt.pipeline
   SET status     = 'done',
       updated_at = now(),
       notes      = 'Documentation exists for this requirement'
 WHERE stage = 'documentation'
   AND req_id IN (
     -- FA-01..FA-08: documented in service READMEs / deployment guides
     'FA-01', 'FA-02', 'FA-03', 'FA-04', 'FA-05', 'FA-06', 'FA-07', 'FA-08',
     -- SA-01..SA-06: security docs
     'SA-01', 'SA-02', 'SA-03', 'SA-04', 'SA-05', 'SA-06',
     -- NFA-01..NFA-07: non-functional requirement docs
     'NFA-01', 'NFA-02', 'NFA-03', 'NFA-04', 'NFA-05', 'NFA-06', 'NFA-07',
     -- L-05: Systemarchitektur — architecture.md exists
     'L-05',
     -- L-06: Deploymentanleitung — deployment.md exists
     'L-06'
   );

-- ─────────────────────────────────────────────────────────────────
-- 5. Deliverables & docs still at idea/pending: leave as-is
--    AK-01, AK-02, AK-05: market analysis, USPs, business model
--    L-01, L-02, L-04, L-07: concept, market analysis, business model, final report
--    (no UPDATE needed — they stay 'pending')
-- ─────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────
-- Summary: show what changed
-- ─────────────────────────────────────────────────────────────────
-- (printed after COMMIT via the Taskfile task)

COMMIT;
