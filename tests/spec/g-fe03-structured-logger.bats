#!/usr/bin/env bats
# SSOT: openspec/changes/g-fe03-structured-logger/
# G-FE03: Strukturierten Logger einführen
# Migrates raw console.error/warn calls to the pino-based structured logger.

@test "G-FE03: keine rohen console.error/warn Aufrufe (exkl. browser-logger-Stub)" {
  count=$(grep -rEn 'console\.(error|warn)' website/src \
    --include='*.ts' --include='*.svelte' --include='*.astro' 2>/dev/null \
    | grep -v 'browser-logger\.ts' | grep -v '\.test\.ts' | wc -l | tr -d ' ')
  [ "$count" -eq 0 ]
}

@test "G-FE03: browser-logger.ts existiert und enthält browserLogger-Export" {
  grep -q 'export const browserLogger' website/src/lib/browser-logger.ts
}

@test "G-FE03: logger.ts existiert und exportiert logger" {
  grep -q 'export const logger' website/src/lib/logger.ts
}
