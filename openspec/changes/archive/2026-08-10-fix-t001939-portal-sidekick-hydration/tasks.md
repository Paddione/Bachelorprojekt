# Tasks: Hydration-Fehler PortalSidekick

## Task 1: Logger-Import in PortalSidekick ersetzen

**Dateien:** `website/src/components/PortalSidekick.svelte`

1. Entferne `import { logger } from '../lib/logger'` (Zeile 18)
2. Ersetze durch `import { logger } from '../lib/browser-logger'` (browser-kompatibel)
3. Prüfe ob `logger` im Component tatsächlich genutzt wird — wenn nicht, Import komplett entfernen

## Task 2: Prüfe ob browser-logger.ts exists

**Dateien:** `website/src/lib/browser-logger.ts`

1. Lies `browser-logger.ts` um die API zu verstehen
2. Stelle sicher dass `logger.error()`, `logger.warn()`, `logger.info()` kompatibel sind

## Task 3: Test aktualisieren

**Dateien:** `website/src/components/PortalSidekick.test.ts`

1. Prüfe ob der Test den pino-Logger mocken muss
2. Passe den Mock an den neuen Browser-Logger an

## Verify

```bash
cd website && pnpm run test:unit
```
