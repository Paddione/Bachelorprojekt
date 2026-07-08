# Startup tasks module

Server initialization and health check routines ensuring all dependencies are ready before accepting connections. Manages database seeding, cache warming, and service readiness probes.

## Purpose

- Database schema validation on startup  
- Cache warming for frequently accessed data
- Service health checks (Redis, external APIs)
- Graceful shutdown handling

## Architecture

```typescript
// Core modules:
startup-tasks.ts   → 770 lines (lifecycle hooks, health checks)
  ├─ DatabaseSeeder → Schema validation & seed data  
  ├─ CacheWarmer    → Pre-populate hot paths from cache  
  └─ HealthProber   → Dependency service readiness checks

// Dependencies:
redis-client       → Connection pool management
external-apis      → Third-party service health checks
```

## Usage

```typescript
await app.startupChecks(); // Ensures all dependencies ready before serve()
```

---

**File:** `VideoVault/server/lib/startup-tasks.ts` (770 LOC) → SKILL documentation  
**Related:** [health-check](file:///home/patrick/Bachelorprojekt/VideoVault/server/routes/health.SKILL.md), [cache-manager](file:///home/patrick/Bachelorprojekt/VideoVault/client/src/services/cache-manager.SKILL.md)
