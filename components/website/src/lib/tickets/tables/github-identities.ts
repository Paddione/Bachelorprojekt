import type { Pool, PoolClient } from 'pg';

/** Additive, idempotent persistence for immutable GitHub identities and their history. */
export async function applyGitHubIdentitySchema(pool: Pool | PoolClient): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.github_objects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), github_node_id TEXT NOT NULL,
      kind TEXT NOT NULL, provider_ref TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT github_objects_node_id_uq UNIQUE (github_node_id),
      CONSTRAINT github_objects_node_id_nonempty CHECK (btrim(github_node_id) <> ''),
      CONSTRAINT github_objects_kind_check CHECK (kind IN ('issue','pull_request','advisory')),
      CONSTRAINT github_objects_provider_ref_kind_check CHECK (
        (kind = 'advisory' AND provider_ref IS NOT NULL AND btrim(provider_ref) <> '') OR
        (kind <> 'advisory' AND provider_ref IS NULL)),
      CONSTRAINT github_objects_provider_ref_format_check CHECK (
        provider_ref IS NULL OR provider_ref ~* '^GHSA-[23456789CFGHJMPQRVWX]{4}-[23456789CFGHJMPQRVWX]{4}-[23456789CFGHJMPQRVWX]{4}$')
    );
    CREATE UNIQUE INDEX IF NOT EXISTS github_objects_provider_ref_uq ON tickets.github_objects (lower(provider_ref)) WHERE provider_ref IS NOT NULL;
    CREATE TABLE IF NOT EXISTS tickets.github_object_coordinates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), github_object_id UUID NOT NULL REFERENCES tickets.github_objects(id) ON DELETE RESTRICT,
      repository_node_id TEXT NOT NULL, repository_owner TEXT NOT NULL, repository_name TEXT NOT NULL, object_number INTEGER NOT NULL, url TEXT NOT NULL,
      valid_from TIMESTAMPTZ NOT NULL DEFAULT now(), valid_until TIMESTAMPTZ,
      CONSTRAINT github_object_coordinates_nonempty CHECK (btrim(repository_node_id) <> '' AND btrim(repository_owner) <> '' AND btrim(repository_name) <> '' AND btrim(url) <> ''),
      CONSTRAINT github_object_coordinates_number_check CHECK (object_number > 0),
      CONSTRAINT github_object_coordinates_interval_check CHECK (valid_until IS NULL OR valid_until > valid_from)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS github_object_coordinates_one_current_per_object_uq ON tickets.github_object_coordinates (github_object_id) WHERE valid_until IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS github_object_coordinates_current_repo_number_uq ON tickets.github_object_coordinates (repository_node_id, object_number) WHERE valid_until IS NULL;
    CREATE TABLE IF NOT EXISTS tickets.work_item_refs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE RESTRICT,
      github_object_id UUID NOT NULL REFERENCES tickets.github_objects(id) ON DELETE RESTRICT, role TEXT NOT NULL, reason TEXT,
      valid_from TIMESTAMPTZ NOT NULL DEFAULT now(), valid_until TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT work_item_refs_role_check CHECK (role IN ('canonical','alias')),
      CONSTRAINT work_item_refs_interval_check CHECK (valid_until IS NULL OR valid_until > valid_from),
      CONSTRAINT work_item_refs_alias_open_check CHECK (role <> 'alias' OR valid_until IS NULL)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS work_item_refs_one_current_canonical_per_ticket_uq ON tickets.work_item_refs (ticket_id) WHERE role='canonical' AND valid_until IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS work_item_refs_one_current_canonical_per_object_uq ON tickets.work_item_refs (github_object_id) WHERE role='canonical' AND valid_until IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS work_item_refs_one_active_pair_uq ON tickets.work_item_refs (ticket_id, github_object_id) WHERE valid_until IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS work_item_refs_alias_pair_uq ON tickets.work_item_refs (ticket_id, github_object_id) WHERE role='alias';
    CREATE TABLE IF NOT EXISTS tickets.github_object_relations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), from_object_id UUID NOT NULL REFERENCES tickets.github_objects(id) ON DELETE RESTRICT,
      to_object_id UUID NOT NULL REFERENCES tickets.github_objects(id) ON DELETE RESTRICT, kind TEXT NOT NULL, source TEXT NOT NULL, reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT github_object_relations_kind_check CHECK (kind IN ('implements','closes','duplicate_of','replaces','transferred_to')),
      CONSTRAINT github_object_relations_not_self_check CHECK (from_object_id <> to_object_id),
      CONSTRAINT github_object_relations_source_nonempty CHECK (btrim(source) <> ''),
      CONSTRAINT github_object_relations_redirect_reason_check CHECK (kind NOT IN ('duplicate_of','replaces','transferred_to') OR (reason IS NOT NULL AND btrim(reason) <> '')),
      CONSTRAINT github_object_relations_edge_uq UNIQUE (from_object_id, to_object_id, kind)
    );
    CREATE INDEX IF NOT EXISTS github_object_relations_from_idx ON tickets.github_object_relations (from_object_id, kind);
    CREATE INDEX IF NOT EXISTS github_object_relations_to_idx ON tickets.github_object_relations (to_object_id, kind);
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.fn_guard_github_object_identity() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tickets AS $$
    BEGIN IF NEW.github_node_id IS DISTINCT FROM OLD.github_node_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.provider_ref IS DISTINCT FROM OLD.provider_ref THEN RAISE EXCEPTION 'github object identity is immutable'; END IF; RETURN NEW; END $$;
    DROP TRIGGER IF EXISTS github_objects_immutable ON tickets.github_objects;
    CREATE TRIGGER github_objects_immutable BEFORE UPDATE ON tickets.github_objects FOR EACH ROW EXECUTE FUNCTION tickets.fn_guard_github_object_identity();
    CREATE OR REPLACE FUNCTION tickets.fn_guard_github_coordinate() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tickets AS $$
    DECLARE object_kind text; BEGIN
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'github coordinate history is append-only'; END IF;
      SELECT kind INTO object_kind FROM tickets.github_objects WHERE id=NEW.github_object_id;
      IF object_kind = 'advisory' THEN RAISE EXCEPTION 'advisories cannot have coordinates'; END IF;
      IF TG_OP = 'UPDATE' AND (NEW.github_object_id IS DISTINCT FROM OLD.github_object_id OR NEW.repository_node_id IS DISTINCT FROM OLD.repository_node_id OR NEW.repository_owner IS DISTINCT FROM OLD.repository_owner OR NEW.repository_name IS DISTINCT FROM OLD.repository_name OR NEW.object_number IS DISTINCT FROM OLD.object_number OR NEW.url IS DISTINCT FROM OLD.url OR NEW.valid_from IS DISTINCT FROM OLD.valid_from OR NEW.valid_until IS NULL OR OLD.valid_until IS NOT NULL OR NEW.valid_until <= OLD.valid_from) THEN RAISE EXCEPTION 'only an open coordinate can be closed'; END IF;
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS github_coordinates_guard ON tickets.github_object_coordinates;
    CREATE TRIGGER github_coordinates_guard BEFORE INSERT OR UPDATE OR DELETE ON tickets.github_object_coordinates FOR EACH ROW EXECUTE FUNCTION tickets.fn_guard_github_coordinate();
    CREATE OR REPLACE FUNCTION tickets.fn_guard_work_item_ref() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tickets AS $$
    DECLARE object_kind text; BEGIN
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'work item reference history is append-only'; END IF;
      SELECT kind INTO object_kind FROM tickets.github_objects WHERE id=NEW.github_object_id;
      IF object_kind = 'pull_request' THEN RAISE EXCEPTION 'pull requests cannot be work item references'; END IF;
      IF TG_OP = 'INSERT' AND NEW.role='alias' AND (NEW.reason IS NULL OR btrim(NEW.reason)='') THEN RAISE EXCEPTION 'aliases require a reason'; END IF;
      IF TG_OP = 'UPDATE' AND (OLD.role <> 'canonical' OR OLD.valid_until IS NOT NULL OR NEW.ticket_id IS DISTINCT FROM OLD.ticket_id OR NEW.github_object_id IS DISTINCT FROM OLD.github_object_id OR NEW.role IS DISTINCT FROM OLD.role OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.valid_from IS DISTINCT FROM OLD.valid_from OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.valid_until IS NULL OR NEW.valid_until <= OLD.valid_from) THEN RAISE EXCEPTION 'only an open canonical reference can be closed'; END IF;
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS work_item_refs_guard ON tickets.work_item_refs;
    CREATE TRIGGER work_item_refs_guard BEFORE INSERT OR UPDATE OR DELETE ON tickets.work_item_refs FOR EACH ROW EXECUTE FUNCTION tickets.fn_guard_work_item_ref();
    CREATE OR REPLACE FUNCTION tickets.fn_guard_github_relation_history() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tickets AS $$
    BEGIN RAISE EXCEPTION 'github relation history is append-only'; END $$;
    DROP TRIGGER IF EXISTS github_relations_history_guard ON tickets.github_object_relations;
    CREATE TRIGGER github_relations_history_guard BEFORE UPDATE OR DELETE ON tickets.github_object_relations FOR EACH ROW EXECUTE FUNCTION tickets.fn_guard_github_relation_history();
    CREATE OR REPLACE FUNCTION tickets.fn_validate_github_relation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tickets AS $$
    DECLARE from_kind text; to_kind text; has_cycle boolean; BEGIN
      SELECT kind INTO from_kind FROM tickets.github_objects WHERE id=NEW.from_object_id;
      SELECT kind INTO to_kind FROM tickets.github_objects WHERE id=NEW.to_object_id;
      IF NEW.kind IN ('implements','closes') AND (from_kind <> 'pull_request' OR to_kind NOT IN ('issue','advisory')) THEN RAISE EXCEPTION 'delivery relations require pull request to issue or advisory'; END IF;
      IF NEW.kind IN ('duplicate_of','replaces','transferred_to') AND from_kind <> to_kind THEN RAISE EXCEPTION 'redirect relations require equal object kinds'; END IF;
      IF NEW.kind IN ('duplicate_of','replaces','transferred_to') THEN
        WITH RECURSIVE walk(id) AS (SELECT NEW.to_object_id UNION SELECT r.to_object_id FROM tickets.github_object_relations r JOIN walk w ON r.from_object_id=w.id WHERE r.kind IN ('duplicate_of','replaces','transferred_to')) SELECT EXISTS(SELECT 1 FROM walk WHERE id=NEW.from_object_id) INTO has_cycle;
        IF has_cycle THEN RAISE EXCEPTION 'redirect relation would create a cycle'; END IF;
      END IF; RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS github_relations_validate ON tickets.github_object_relations;
    CREATE TRIGGER github_relations_validate BEFORE INSERT ON tickets.github_object_relations FOR EACH ROW EXECUTE FUNCTION tickets.fn_validate_github_relation();
  `);
}
