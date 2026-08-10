# p1 — exclusiveGroup-Gruppen-Readiness (T003202)

## Ziel

`/health` meldet dauerhaft `ready=false`: die Readiness-Definition verlangt
ALLE enabled priority=1-Backends healthy, aber exclusiveGroup-Loadouts (chat-gpu)
können per Definition nie gleichzeitig laufen (16 GB VRAM, 8 Loadouts).
Richtung a) (User-Entscheid): exclusiveGroup-Geschwister gelten als Gruppe,
healthy wenn mindestens ein Mitglied healthy ist.

## Steps

1. **RED.** Test in `tests/spec/llm-proxy/group-readiness.bats` (in p2 geschrieben,
   hier referenziert): mehrere chat-gpu-Loadouts, eines healthy → ready=true.
   `expected: FAIL` (aktuell ready=false).

2. **GREEN — discovery.mjs (evaluateReadiness, ~Z.181-240).** Backends nach
   `exclusiveGroup` gruppieren; je Gruppe gilt: mindestens ein Mitglied healthy
   → Gruppe healthy. Cloud-Fallback (priority > 1) macht weiterhin NICHT ready.
   Kein priority=1-Backend → not ready (unverändert).

3. **GREEN — SSOT.** `openspec/specs/local-llm-proxy.md` Z.303 (Readiness-Definition)
   um die exclusiveGroup-Aggregation ergänzen (MODIFIED-Delta in
   `openspec/changes/llm-proxy-group-readiness/specs/local-llm-proxy.md` liegt vor).

4. **GREEN — server.mjs (/health).** Falls der /health-Handler die Auswertung
   gesondert aufruft: evaluateReadiveness-Gruppenaggregation durchreichen.

5. **Verifikation.** Repro aus T003202:
   `curl -s http://127.0.0.1:18235/health` → `ready=true` bei mindestens einem
   healthy chat-gpu-Loadout.

## Acceptance

- exclusiveGroup-Gruppe gilt als healthy bei ≥1 healthy Mitglied.
- Cloud-Fallback macht weiterhin nicht ready.
- Kein priority=1-Backend → not ready (unverändert).
- SSOT-Requirement + Delta konsistent.
