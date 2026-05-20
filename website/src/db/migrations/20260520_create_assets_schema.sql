CREATE SCHEMA IF NOT EXISTS assets;

DO $$ BEGIN
    CREATE TYPE assets.asset_type AS ENUM ('image', 'audio', 'video', 'document');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS assets.registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type assets.asset_type NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Grant permissions to the website role
GRANT USAGE ON SCHEMA assets TO website;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA assets TO website;
