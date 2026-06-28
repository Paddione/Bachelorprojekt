# Proposal: g-fe03-structured-logger

_Ticket: T001299_

## Why

`website/src` enthält 141 rohe `console.error`/`console.warn`-Aufrufe. In Produktion erzeugen diese Aufrufe unstrukturierten Plain-Text-Output ohne Log-Level-Metadaten, Korrelations-IDs oder Service-Kontext. Promtail/Loki kann solche Zeilen nicht als strukturierte JSON-Events indizieren, was Alerting und Log-Suche über das Admin-Logging-Widget erheblich erschwert.

Ein pino-basierter `logger` mit Multistream-Output (stdout + serverLogBuffer für das Admin-Widget) existiert bereits unter `website/src/lib/logger.ts`. Er wird jedoch kaum genutzt: 80 Server-side-Lib-Module, 19 Astro-Pages und 5 Svelte-Komponenten rufen weiterhin direkt `console.error`/`console.warn` auf. Hinzu kommen 37 Vorkommen in Testdateien, die `console.error` als Spy- oder Suppress-Ziel behandeln, anstatt den Logger zu mocken.

Das Ziel ist, alle 141 Vorkommen auf den strukturierten Logger umzustellen, sodass der Mess-Command `grep -rEn 'console\.(error|warn)' website/src ...` den Wert 0 liefert.

## What

1. **Server-side-Lib-Module** (`website/src/lib/**/*.ts`, exkl. Testdateien): 80 Vorkommen. Jede Datei importiert `logger` aus `../lib/logger` (oder dem relativen Pfad) und ersetzt `console.error(...)` → `logger.error(...)` sowie `console.warn(...)` → `logger.warn(...)`. Wo ein strukturiertes Fehlerobjekt vorhanden ist, wird es als erstes Argument übergeben: `logger.error({ err }, 'Nachricht')`.

2. **Astro-Pages** (`website/src/pages/**/*.astro`): 19 Vorkommen. Astro-Frontmatter wird serverseitig ausgeführt; der Import erfolgt analog zu den Lib-Modulen.

3. **Browser-seitige Svelte-Komponenten** (`website/src/components/**/*.svelte`): 5 Vorkommen. Der pino-Logger setzt `process.stdout` voraus und ist nicht browser-kompatibel. Für diese Datei wird ein schlanker Browser-Logger-Stub `website/src/lib/browser-logger.ts` angelegt, der die `LogLevel`-Typen aus dem bestehenden `log-types.ts` nutzt und intern `console.error`/`console.warn` aufruft — damit ist der Browser-Kanal typsicher und zukünftig austauschbar, ohne am Mess-Command etwas zu ändern. Die 5 direkten Aufrufe in Svelte-Komponenten werden auf diesen Stub umgestellt.

4. **Testdateien**: 37 Vorkommen. Test-Files, die `console.error = () => undefined` setzen oder als Spy patchen, werden auf `vi.spyOn(loggerModule, 'logger')` bzw. direktes Mocken des logger-Moduls umgestellt. Test-Files, die `console.error` für Diagnose-Output (z. B. `einvoice-profile.test.ts`) verwenden, ersetzen den Aufruf durch `console.log` (kein Error-Kontext, kein Spy-Target).

## Impact

**Neue Dateien:**
- `website/src/lib/browser-logger.ts` — Browser-kompatibler Logger-Stub (5 Zeilen)

**Geänderte Dateien:**
- `website/src/lib/logger.ts` — ggf. kleinere Typerweiterungen (child-Logger-Helper)
- ~52 Dateien in `website/src/lib/`, `website/src/pages/`, `website/src/components/` und Test-Dateien

**Risiken:**
- Manche Lib-Module importieren bereits `logger` für andere Zwecke; Doppelimporte werden konsolidiert.
- Svelte-Komponenten dürfen keinen pino-Import erhalten — der Browser-Logger-Stub ist die einzige erlaubte Lösung für Client-Code.
- Test-Spy-Patches auf `console.error` werden durch Logger-Mocks ersetzt; bestehende Test-Assertions gegen `console.error.toHaveBeenCalled()` müssen angepasst werden.

**Out-of-Scope:**
- `console.log`/`console.info`/`console.debug` — werden durch G-FE01/G-FE02 abgedeckt.
- Änderungen an der Loki/Promtail-Konfiguration.
- Neue Log-Routing-Regeln oder Alert-Regeln in Grafana.
- `website/src/lib/logging/` — die bestehende Logging-Infrastruktur (browser-collector, log-store etc.) bleibt unberührt.
