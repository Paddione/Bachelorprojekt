"""Native migration of tests/spec/database-migrations-runner.bats."""
import json

def test_runner_exists(repo_root):
    assert (repo_root / 'scripts/migrate-db.mjs').is_file()

def test_help(repo_root, run_cmd):
    res = run_cmd(['node', 'scripts/migrate-db.mjs', '--help'])
    res.check(0)
    assert 'Usage:' in res.output

def test_missing_directory(repo_root, run_cmd, tmp_path):
    program = "import {runMigrations} from './scripts/migrate-db.mjs'; const pool = {connect: async () => ({query: async () => ({rows:[]}),release:()=>{}})}; runMigrations(pool," + json.dumps(str(tmp_path / 'absent')) + ").then(()=>console.log('OK'));"
    res = run_cmd(['node', '-e', program])
    res.check(0)
    assert 'OK' in res.output

def test_pending_file_processed(repo_root, run_cmd, tmp_path):
    migrations = tmp_path / 'migrations'
    migrations.mkdir()
    (migrations / '20260801-test-migration.sql').write_text('CREATE TABLE IF NOT EXISTS public.test_table (id id_seq PRIMARY KEY);\n')
    program = """import {runMigrations} from './scripts/migrate-db.mjs';
const queries=[]; const client={query:async(q,params)=>{queries.push({q,params});return {rows:[]}},release:()=>{}};
const pool={connect:async()=>client}; runMigrations(pool,PATH).then(()=>{console.log('QUERY_COUNT:'+queries.length);console.log('APPLIED:'+queries.some(x=>x.params&&x.params[0]==='20260801-test-migration.sql'))});
""".replace('PATH', json.dumps(str(migrations)))
    res = run_cmd(['node', '-e', program])
    res.check(0)
    assert 'QUERY_COUNT:' in res.output
    assert 'APPLIED:true' in res.output
