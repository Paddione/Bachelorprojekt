-- T001947: Add CHECK constraints to brand columns
-- Idempotent: uses DO $$ ... $$ blocks with exception handling
-- Run: psql -U website -d website -f migrations/20260719-brand-check-constraints.sql

BEGIN;

-- bachelorprojekt.features (empty, future-proof multi-brand)
DO $$ BEGIN
    ALTER TABLE bachelorprojekt.features 
        ADD CONSTRAINT chk_brand_features 
        CHECK (brand IN ('mentolder', 'korczewski'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- brett.board_templates (mentolder only)
DO $$ BEGIN
    ALTER TABLE brett.board_templates 
        ADD CONSTRAINT chk_brand_board_templates 
        CHECK (brand = 'mentolder');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- brett.coaching_templates (mentolder only)
DO $$ BEGIN
    ALTER TABLE brett.coaching_templates 
        ADD CONSTRAINT chk_brand_coaching_templates 
        CHECK (brand = 'mentolder');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- bugs.bug_tickets (empty, future-proof multi-brand)
DO $$ BEGIN
    ALTER TABLE bugs.bug_tickets 
        ADD CONSTRAINT chk_brand_bug_tickets 
        CHECK (brand IN ('mentolder', 'korczewski'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- coaching.ki_config (korczewski, mentolder)
DO $$ BEGIN
    ALTER TABLE coaching.ki_config 
        ADD CONSTRAINT chk_brand_ki_config 
        CHECK (brand IN ('mentolder', 'korczewski'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- coaching.projects (mentolder only)
DO $$ BEGIN
    ALTER TABLE coaching.projects 
        ADD CONSTRAINT chk_brand_coaching_projects 
        CHECK (brand = 'mentolder');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- coaching.sessions (empty, future-proof multi-brand)
DO $$ BEGIN
    ALTER TABLE coaching.sessions 
        ADD CONSTRAINT chk_brand_coaching_sessions 
        CHECK (brand IN ('mentolder', 'korczewski'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- coaching.step_templates (empty, future-proof multi-brand)
DO $$ BEGIN
    ALTER TABLE coaching.step_templates 
        ADD CONSTRAINT chk_brand_coaching_step_templates 
        CHECK (brand IN ('mentolder', 'korczewski'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- knowledge.collections (mentolder only)
DO $$ BEGIN
    ALTER TABLE knowledge.collections 
        ADD CONSTRAINT chk_brand_collections 
        CHECK (brand = 'mentolder');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- tickets.factory_control (mentolder only)
DO $$ BEGIN
    ALTER TABLE tickets.factory_control 
        ADD CONSTRAINT chk_brand_factory_control 
        CHECK (brand = 'mentolder');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- tickets.feature_flags (empty, future-proof multi-brand)
DO $$ BEGIN
    ALTER TABLE tickets.feature_flags 
        ADD CONSTRAINT chk_brand_feature_flags 
        CHECK (brand IN ('mentolder', 'korczewski'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- tickets.pr_events (empty, future-proof multi-brand)
DO $$ BEGIN
    ALTER TABLE tickets.pr_events 
        ADD CONSTRAINT chk_brand_pr_events 
        CHECK (brand IN ('mentolder', 'korczewski'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- tickets.provider_config (has *, korczewski, mentolder)
DO $$ BEGIN
    ALTER TABLE tickets.provider_config 
        ADD CONSTRAINT chk_brand_provider_config 
        CHECK (brand IN ('*', 'mentolder', 'korczewski'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- tickets.tags (empty, future-proof multi-brand)
DO $$ BEGIN
    ALTER TABLE tickets.tags 
        ADD CONSTRAINT chk_brand_tags 
        CHECK (brand IN ('mentolder', 'korczewski'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- tickets.ticket_counters (korczewski, mentolder)
DO $$ BEGIN
    ALTER TABLE tickets.ticket_counters 
        ADD CONSTRAINT chk_brand_ticket_counters 
        CHECK (brand IN ('mentolder', 'korczewski'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- tickets.tickets (korczewski, mentolder)
DO $$ BEGIN
    ALTER TABLE tickets.tickets 
        ADD CONSTRAINT chk_brand_tickets 
        CHECK (brand IN ('mentolder', 'korczewski'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
