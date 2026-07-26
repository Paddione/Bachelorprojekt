---
title: "ops-db-slow-query-and-e2e-failures — Investigation Plan"
domains: [ops, database, ci]
status: active
file_locks: []
shared_changes: false
batch_id: null
depends_on_plans: []
---

# ops-db-slow-query-and-e2e-failures — Investigation Plan

## Task 1 — Identify slow query (G-DB09)

Run against the fleet DB:

```sql
SELECT queryid, query, calls, mean_exec_time, total_exec_time, rows, 
  shared_blks_hit, shared_blks_read
FROM pg_stat_statements 
WHERE mean_exec_time > 1000 
  AND query NOT ILIKE 'COPY %' 
  AND query NOT ILIKE 'CREATE INDEX%'
ORDER BY mean_exec_time DESC
LIMIT 5;
```

**Possible outcomes:**

1. **Real application slow query** (e.g., missing index, unoptimized JOIN) → create optimization ticket or optimize inline
2. **DDL/maintenance** (e.g., ALTER TABLE, VACUUM) → add exclusion to check script in `scripts/health-goals-check.sh` line 413
3. **System query** (e.g., pg_stat_* query itself) → add exclusion

**If fixing is simple:** Implement inline (e.g., add index, add exclusion).
**If complex:** Create follow-up ticket, add to baseline exclusion for now.

## Task 2 — Investigate E2E failures (G-E2E01)

### 2a. Check last 5 e2e.yml runs

```bash
gh run list --workflow e2e.yml --limit 5 --json conclusion,databaseId,headBranch,createdAt
```

### 2b. Get logs from latest failed run

```bash
RUN_ID=$(gh run list --workflow e2e.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run view $RUN_ID --log --job | tail -200
```

### 2c. Check if fix branch exists/was merged

```bash
git branch -a | grep e2e-auth-token
gh pr list --head fix/e2e-auth-token-and-cron-secret --state all --json state,mergedAt
```

### 2d. Determine root cause

Common failure modes for e2e.yml:
- Auth token / CRON_SECRET drift (T002063 mentions this)
- Cluster connectivity issues
- Test code changes incompatible with deployment
- Missing secrets in CI environment

### 2e. Resolution

Based on findings:
- If simple secret fix → update CI secrets
- If code fix needed → create detailed implementation plan
- If infrastructure fix → update cluster/github configuration

## Final Verification

```bash
# G-DB09 after fix
kubectl exec -n workspace deploy/shared-db -c postgres -- psql -U website -d website -tAc \
  "SELECT count(*) FROM pg_stat_statements WHERE mean_exec_time > 1000 AND query NOT ILIKE 'COPY %' AND query NOT ILIKE 'CREATE INDEX%'"
# Expected: 0

# G-E2E01 — run check again
bash scripts/health-goals-check.sh 2>&1 | grep -E 'G-DB09|G-E2E01'
```
