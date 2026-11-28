# Proposal: ci-queue-guard

## Symptom (Fakt)
G-CI03 p95 14 Minuten ueber Target 12 (letzte 20 ci.yml-Runs auf main).
Messung: `gh run list --workflow ci.yml --branch main --limit 20 --json createdAt,updatedAt`
+ p95-Index `int((n-1)*0.95)`. Repro 2026-11-28: sortiert 17× 2.5–4.4min,
`46125023106` 13.55min, `45996916608` 1161.07min.

## Ursache (belegt, keine Hypothese)
- Run `45996916608` (schedule, success): ein Job (`Spec shard 4`) queue 1158.7min,
  run 2.27min. Reiner Runner-Queue-Stall, kein langsamer Test.
- Run `46125023106` (push, failure): queue ~10.8min + Shard-4-Fail 2.7min.
- Job-Level `timeout-minutes` (ci.yml:69,546) deckt Queue nicht ab;
  `concurrency` (ci.yml:47-51) priorisiert Schedule nicht.

## Loesung (Scope: nur Guard, kein Runner-Split)
1. `concurrency`-Kommentar + Schedule-Schutz in `ci.yml` (kein Cancel von
   main-Runs, eigene Gruppe fuer schedule), Doku im File.
2. Guard-Test `tests/py/spec/ci_cd_specs/test_ci_queue_guard.py` (Pruefmodus
   Quelltext wie `test_e2e_runner_image_pin.py`): concurrency-Gruppe vorhanden,
   schedule-Block vorhanden, kein `cancel-in-progress` auf main.
3. Shard-4-Rerun-Doku (hinweis `gh run rerun --failed-only`) als Kommentar.

## Nicht-Ziele
Kein Runner-Split, kein E2E-Eingriff, keine Messformel-Aenderung.
