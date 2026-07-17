# Tasks: 502 bei coaching/generate

## Task 1: Detailliertere Fehlerbehandlung in generate.ts

**Dateien:** `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts`

1. Lese den `catch`-Block bei Zeile 195-197
2. Extrahiere den Fehlertyp aus `err`:
   - `err.message?.includes('API_KEY')` → "KI-Provider nicht konfiguriert"
   - `err.message?.includes('timeout')` → "KI-Anfrage Timeout"
   - `err.message?.includes('overloaded')` → "KI-Provider überlastet"
   - Default → "KI-Anfrage fehlgeschlagen: <kurzbeschreibung>"
3. Gib die detailliertere Nachricht im 502-JSON zurück
4. Logge den vollen Fehler weiterhin mit `requestLogger.error`

## Task 2: Test ergänzen

**Dateien:** `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.test.ts` (falls vorhanden)

1. Teste dass ein 502 bei agent.generate()-Fehler zurückgegeben wird
2. Teste dass die Fehlermeldung den Typ enthält

## Verify

```bash
cd website && pnpm run test:unit
```
