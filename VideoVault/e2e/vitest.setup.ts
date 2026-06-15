// E2E test setup
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
// Ensure no DB is used unless explicitly configured for a test run
delete process.env.DATABASE_URL;

