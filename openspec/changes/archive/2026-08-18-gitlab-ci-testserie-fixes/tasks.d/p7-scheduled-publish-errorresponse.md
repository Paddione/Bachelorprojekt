# p7 — scheduled-publish: Assertion auf errorResponse-Helper (T011905)

## Ziel

Seit Commit a8ce2d8e9 (PR #2078, 2026-06-22) nutzt
`components/website/src/pages/api/cron/scheduled-publish.ts` den gemeinsamen
Helper `errorResponse(code, requestId, status)` aus `pages/api/_errors.ts`
statt eines literalen `status: 401` im Response-Objekt. Der Test
`tests/unit/newsletter-scheduled-publish.bats:31` greppt nach dem alten Literal
und ist seit über sechs Wochen rot — das Diff-Scoping der GitHub-CI führt ihn nie
aus.

Entscheidung (vom Ticket gefordert): **beim Grep bleiben, Muster auf den
Helper-Aufruf umstellen**. Ein echter Request-Test bräuchte einen laufenden
Website-Server mit DB und wäre im manifests-Job (der Test läuft dort, weil sein
`setup_file` kubectl für das Kustomize-Rendering braucht) deplatziert. Die
Zusicherung "der Cron-Endpunkt lehnt Anfragen ohne gültigen Bearer mit 401 ab"
ist über das Helper-Aufruf-Muster plus die bestehende `Bearer ${CRON_SECRET}`-
Assertion abgedeckt.

## Steps

1. **RED.** Testlauf auf dem aktuellen Stand:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/newsletter-scheduled-publish.bats
# expected: FAIL ("cron endpoint requires Bearer auth" — status: 401 kommt nicht mehr vor)
```

2. **GREEN.** In `tests/unit/newsletter-scheduled-publish.bats` (Test
   "cron endpoint requires Bearer auth and returns 401 on mismatch", Zeile
   29-34) die Literal-Assertion umstellen:

```bash
run grep -F "errorResponse('Unauthorized', locals.requestId, 401)" "$ENDPOINT"
assert_success
```

   Die `Bearer ${CRON_SECRET}`-Assertion (Zeile 32-33) bleibt unverändert.

3. **Verifikation.**

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/newsletter-scheduled-publish.bats
```

## Acceptance

- Der Auth-Test assertiert den realen Helper-Aufruf (401-Pfad für
  Unauthorized) und den Bearer-Check.
- Kein Produktcode geändert.
