# Partial p3 — Tests (BATs + Vitest)

**Ticket:** T002453
**Rolle:** `tests`
**Ziel-Dateien:** `tests/spec/plan-partials-embedding/*.bats`
**Abhängigkeiten:** p1, p2

## Ziel

Tests für alle drei Änderungen aus p1 und p2.

## Dateien

### tests/spec/plan-partials-embedding/build-chunks.bats

Testet buildChunks() mit und ohne tasks.d/. Der Test ruft `node scripts/openspec-embed.mjs` auf.

```bash
@test "buildChunks liefert partial-Chunk fuer tasks.d Eintrag" {
  # TODO: unit-test gegen exportierte Funktion
  run grep -n 'fileType.*partial' scripts/openspec-embed.mjs
  [ "$status" -eq 0 ]
}

@test "buildChunks ohne tasks.d unveraendert" {
  run grep -n 'if (files.partials' scripts/openspec-embed.mjs
  [ "$status" -eq 0 ]
}
```

### tests/spec/plan-partials-embedding/manifest-parser.bats

```bash
@test "parsePartialManifest: depends_on leerer Zelle ist []" {
  run grep -n 'dependsOn.*\[\]' scripts/openspec-embed.mjs
  [ "$status" -eq 0 ]
}

@test "parsePartialManifest: depends_on ignoriert Em-Dash" {
  run grep -n "'—'" scripts/openspec-embed.mjs && exit 1 || exit 0
}
```

### tests/spec/plan-partials-embedding/size-gate.bats

SIMULATED: Tests die Logik in plan-lint.sh ohne echte große Dateien.

```bash
@test "Groessen-Gate: >7000 Token -> FAIL" {
  run grep -n '7000' scripts/plan-lint.sh
  [ "$status" -eq 0 ]
}
```

### tests/spec/plan-partials-embedding/coverage-gate.bats

```bash
@test "ACTIVE_STATUSES Konstante existiert" {
  run grep -n 'ACTIVE_STATUSES' scripts/openspec-embed.mjs
  [ "$status" -eq 0 ]
}
```

## Abnahmekriterien

1. Alle Tests sind grün nach p1+p2 Implementierung
2. Tests decken beide Richtungen ab (positiv + negativ)

## Notizen

- STRUCT2: Failing-Test-Step — die Tests schlagen fehl (RED) vor p1+p2, werden grün (GREEN) danach
