# T002848: LLM-Backends am Gateway degraded (/health 503)

## Ziel
Die vier lokalen LLM-Backends melden nicht mehr degraded (HTTP 503) am Gateway-Health-Check.

## Tasks

### 1. Health-Check-Diagnose
- [ ] Gateway-Health-Endpoint auf 503-Ursache untersuchen
- [ ] Jeden Backend-Health-Endpoint einzeln prüfen
- [ ] Unterschied zwischen "nicht geladen" vs "wirklich down" klären

### 2. Fix
- [ ] Timeout/Retry-Logik im Gateway-Health-Check anpassen
- [ ] Graceful-Degradation: einzelner Backend-Ausfall → 200 mit Warnung, nicht 503

### Verify
- [ ] `curl localhost:18235/health` → 200 (nicht 503)
- [ ] Einzelner Backend-Down → 200 mit degraded-Flag
