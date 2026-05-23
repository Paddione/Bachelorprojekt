# Phase 5 DROP Decision Log

| Finding | Decision | Approver | Backup ref | Applied at |
|---|---|---|---|---|

_No DROP candidates qualified for this audit phase._

**Why empty:**
- Module 1 (removed-feature orphans): 0 matches on either cluster.
- Module 2 (cold tables / cold indexes): all proposals downgraded to advisory because `pg_postmaster_start_time` on both clusters is 3.5 days ago — below the 30-day stats_reset threshold required by spec Section 4 safety rail 6.

The decision log remains for any DROPs that get added during a follow-up phase or via amendment to this audit.
