---
title: "coaching-daten-lokal-only — Implementation Plan"
ticket_id: T002657
domains: [local-llm-proxy, coaching, security, database]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# coaching-daten-lokal-only — Implementation Plan

_Ticket: T002657_

## File Structure

```
scripts/migrations/2026-08-04-provider-config-data-residency.sql
website/src/lib/provider-config.ts
website/src/lib/openai-compatible-session-agent.ts
website/src/lib/coaching-data-residency.test.ts
scripts/llm-proxy/discovery.mjs
scripts/llm-proxy/server.mjs
scripts/llm-proxy/local-only.test.mjs
website/src/data/test-inventory.json
```

Budgets (gemessen): `provider-config.ts` 117 Zeilen, `openai-compatible-session-agent.ts`
100, `discovery.mjs` 170, `server.mjs` 479. Alle werden um wenige Zeilen ergaenzt und
bleiben weit unter der S1-Schwelle; keine davon steht in
`docs/code-quality/baseline.json`. Ein Verkleinerungsschritt ist nicht erforderlich.

## Kontext fuer den Implementierer

`design.md` im selben Ordner erklaert, warum es **zwei** Fluchtwege gibt und warum
`eu_endpoint` fuer diese Frage untauglich ist. Die verbindlichen Aussagen stehen in
`specs/local-llm-proxy.md`.

Die drei Punkte, an denen dieser Vorgang typischerweise falsch umgesetzt wird:

1. **Der Guard gehoert VOR den Client-Aufbau**, nicht in den Fehlerpfad. Sonst ist der
   Payload gesendet, bevor abgelehnt wird. Der RED-Test misst genau das.
2. **Eine fehlende Deklaration ist keine Zusage.** NULL und fehlende Spalte zaehlen als
   `external`. Ein vergessener Migrationseintrag muss zu einem Fehlschlag fuehren, nicht
   zu einer Uebertragung.
3. **Nur einen Weg zu schliessen genuegt nicht.** Ohne den lokal-only-Modus im Proxy
   faellt eine korrekt umgestellte Coaching-Konfiguration beim naechsten Trainingslauf
   (T002628) wieder auf DeepSeek.

## Tasks

- [x] **RED bestaetigen.** Der Test liegt bereits im Branch. Erwartet sind 3 rote von 4;
      der gruene ist der Positiv-Anker (`on_premises` laeuft durch — heute mangels Guard
      trivial). Der aussagekraeftigste Fehlschlag ist der letzte: er meldet
      `ECONNREFUSED` statt einer Residenz-Ablehnung und belegt damit, dass der Netzaufruf
      heute zuerst passiert.

```bash
cd website && npx vitest run src/lib/coaching-data-residency.test.ts
# expected: FAIL (rot — weder dataResidency im Provider-Typ noch ein Guard)
```

- [x] **Migration schreiben.** `scripts/migrations/2026-08-04-provider-config-data-residency.sql`:

```sql
ALTER TABLE tickets.provider_config
  ADD COLUMN data_residency text NOT NULL DEFAULT 'external'
  CHECK (data_residency IN ('on_premises','external'));
```

      Der Default traegt die Absicht: Bestandszeilen werden `external`, wer on-premises
      sein will, muss es aussprechen. `eu_endpoint` bleibt unangetastet — sie beschreibt
      Rechtsraum, nicht Betreiberschaft, und wird fuer die Arbeit noch gebraucht.
      Danach genau EINEN Provider bewusst auf `on_premises` setzen (den lokalen
      llm-proxy-Zugang), damit Coaching nach dem Guard nutzbar bleibt. Die
      DeepSeek-Zeilen werden nicht umgewidmet.

- [x] **`data_residency` durchreichen.** In `website/src/lib/provider-config.ts` die
      Spalte in die SELECT-Liste und in den Rueckgabetyp aufnehmen. Fehlender oder
      NULL-Wert wird auf `external` normalisiert — die Normalisierung gehoert hierher,
      damit sie nicht an jeder Aufrufstelle wiederholt werden muss.

- [x] **Guard einziehen.** In `website/src/lib/openai-compatible-session-agent.ts` prueft
      `resolveProvider` die Residenz und wirft bei allem ausser `on_premises` einen
      Fehler, der Provider und Grund nennt. Der Wurf erfolgt VOR dem Aufbau des
      OpenAI-Clients und vor jedem `create`-Aufruf. Kein Fallback auf einen anderen
      Provider.

- [x] **Gruen sehen (Coaching-Guard).** Der Vitest-Test
      `website/src/lib/coaching-data-residency.test.ts` liegt bereits im Branch und muss
      jetzt vollstaendig durchlaufen — inklusive des Falls, der die Ablehnung vor dem
      Netzaufruf nachweist.

```bash
cd website && npx vitest run src/lib/coaching-data-residency.test.ts
```

- [x] **Lokal-only im Proxy.** `server.mjs` nimmt die Anforderung entgegen (Header
      `x-llm-local-only: 1`), `discovery.mjs` beruecksichtigt sie bei der Auswahl: nur
      Backends lokaler Art kommen infrage, und ist keines verfuegbar, schlaegt die
      Anfrage fehl statt auf ein `openai-remote`-Backend zu substituieren. Gewoehnliche
      Anfragen behalten ihren Fallback unveraendert. Lokal bestimmt sich ueber `kind`,
      nicht ueber Backend-Namen — eine Namensliste veraltet still, sobald ein Backend
      hinzukommt.

- [x] **Proxy-Tests.** `scripts/llm-proxy/local-only.test.mjs` nach der Konvention des
      Verzeichnisses (`node:test`, Funktionen aufrufen und Rueckgabe pruefen): lokal-only
      waehlt kein remote-Backend, wird lokal bedient wenn moeglich, schlaegt bei
      gedrainten Backends fehl, und eine gewoehnliche Anfrage faellt weiterhin auf remote.

```bash
node --test scripts/llm-proxy/local-only.test.mjs
```

- [x] **Coaching auf den lokal-only-Weg legen.** Der Coaching-Pfad setzt die
      lokal-only-Anforderung, wenn er ueber den Proxy geht. Damit behaelt er Slot-Queue
      und Loadout-Verwaltung, ohne die Prioritaetskette zum Ausweichen zu erben.

- [x] **Bestandsdaten pruefen, nicht umhaengen.** Belegen, dass die 13 Sessions auf
      `ki_config_id = 82` nach der Migration in den Guard laufen. Sie bleiben, wie sie
      sind — es sind Testdaten, und ihr Fehlschlag ist der sichtbare Beleg, dass der
      Guard greift. Ein stilles Umhaengen wuerde die Pruefung verstecken.

- [x] **Test-Inventar regenerieren.** Zwei neue Testdateien bedeuten neue Eintraege.

```bash
task test:inventory
```

- [x] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
