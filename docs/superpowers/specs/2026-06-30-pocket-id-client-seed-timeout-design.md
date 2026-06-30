---
ticket_id: T001327
plan_ref: null
status: active
date: 2026-06-30
---

# Design: pocket-id-client-seed-timeout

**Datum:** 2026-06-30  
**Slug:** `pocket-id-client-seed-timeout`  
**Status:** approved  
**Ticket:** T001327  
**Spec-Link:** `openspec/specs/fleet-operations.md`  

---

## Kontext & Problem

Der `pocket-id-client-seed` Job in `k3d/pocket-id-client-seed.yaml` hat einen Init-Container `wait-for-pocket-id`, der mit `wget` das `/.well-known/openid-configuration` von pocket-id pollt. Das Zeitfenster ist auf **60 Iterationen × 2s = 120s** begrenzt.

Bei einem Kaltstart (erster Deploy nach Cluster-Reset, oder parallel zu pocket-id + shared-db) reicht diese Zeitspanne nicht aus: pocket-id braucht für DB-Migrationen und App-Init oft >2 Minuten. Der Init-Container stirbt mit `exit 1`, der Pod restartet mit exponentiellem Backoff (10s, 20s, 40s…). Dadurch:

1. Läuft der Seed-Container nicht → OIDC-Clients werden nicht angelegt/aktualisiert
2. Die Client-Konfiguration driftet bei jedem Deploy
3. T001326 (Nextcloud/Talk-Login broken) war die Folge

## Fix-Ansatz

**Timeout erhöhen:** Das Poll-Intervall bleibt bei 2s, aber die maximale Iterationszahl wird von 60 auf **300** erhöht (→ 600s/10min). Dies deckt den schlimmsten Cold-Start ab (DB-Migration + App-Init). Zusätzlich wird `backoffLimit` von 5 auf **2** gesenkt, da der Init-Container intern länger wartet und nicht mehr den Pod-Restart-Mechanismus braucht.

Alternative: `kubectl wait` (Ansatz D) — aufwändiger, braucht RBAC. Der schnelle Fix ist die Timeout-Erhöhung, ein robusterer Mechanismus kann in einem Follow-up (T00109x) kommen.

## Betroffene Subsysteme

| Subsystem | Datei | Änderung |
|-----------|-------|----------|
| Pocket-ID-Seed-Job | `k3d/pocket-id-client-seed.yaml` | Init-Container: `-ge 60` → `-ge 300`, `backoffLimit: 5` → `backoffLimit: 2` |
| Test | `tests/spec/pocket-id-client-seed-timeout.bats` | Neu: reproduziert Timeout-Bug (RED→GREEN) |

## Edge-Cases

- **Normaler pocket-id-Restart** (ohne DB-Migration): ~5–10s → 1–5 Iterationen, irrelevant
- **shared-db-Restart:** pocket-id ist nicht verfügbar, bis DB ready → Timeout-Puffer fängt das ab
- **Dauerhafter Fehler:** pocket-id startet gar nicht (Config-Fehler) → Job läuft nach 10min ins Timeout → `backoffLimit: 2` → Pod failed → Admin muss eingreifen
- **Beide Brands:** `k3d/pocket-id-client-seed.yaml` ist Base-Manifest → Fix gilt für mentolder + korczewski
