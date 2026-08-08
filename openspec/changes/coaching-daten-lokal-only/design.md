---
ticket_id: T002657
plan_ref: openspec/changes/coaching-daten-lokal-only/tasks.md
status: active
date: 2026-08-04
---

# Design: coaching-daten-lokal-only

_Ticket: T002657_

## Leitgedanke

Der Ist-Zustand ist nicht falsch konfiguriert, sondern **ungesichert** konfiguriert. Die
richtige `ki_config_id` zu waehlen ist heute eine Verabredung; nichts haelt jemanden
davon ab, sie zu aendern, und nichts meldet sich, wenn es passiert. Dieser Vorgang
verwandelt die Verabredung in eine Eigenschaft der Daten (`data_residency`) und eine
Pruefung im Pfad (Guard) — mit dem Vorzeichen fail-closed, weil der Schadensfall
irreversibel ist: uebertragene Daten holt man nicht zurueck.

## Zwei Fluchtwege, ein Guard reicht nicht

Es gibt **zwei** unabhaengige Wege, auf denen Coaching-Inhalte nach draussen gelangen:

| Weg | Mechanismus | Gegenmassnahme |
|---|---|---|
| Provider-Config | `coaching.sessions.ki_config_id` → `tickets.provider_config` zeigt direkt auf `api.deepseek.com` | `data_residency`-Deklaration + Guard im Coaching-Pfad |
| Proxy-Fallback | `tickets.llm_proxy_backends` fuehrt `deepseek` (`kind=openai-remote`) auf Prioritaet 2 | lokal-only-Modus im Proxy |

Wer nur den ersten schliesst, verlagert das Problem: eine korrekt auf den Proxy
umgestellte Coaching-Konfiguration faellt beim naechsten Trainingslauf auf DeepSeek.
Beide Wege gehoeren in denselben Vorgang, sonst entsteht ein Sicherheitsgefuehl ohne
Deckung.

## Warum `eu_endpoint` nicht taugt

Die Spalte existiert bereits und liegt brach — verlockend. Sie beantwortet aber eine
andere Frage. `eu_endpoint = true` heisst "im Rechtsraum EU"; gebraucht wird "auf
unseren Maschinen". DeepSeeks EU-Endpunkt erfuellte das erste und verletzte das zweite.
Wird die Spalte umgewidmet, ist die Aussage ueber den Rechtsraum verbraucht — und
spaeter, wenn genau sie fuer die Arbeit gebraucht wird, nicht mehr herstellbar. Zwei
Fakten brauchen zwei Felder.

## Komponenten

```
scripts/migrations/<datum>-provider-config-data-residency.sql
    ALTER TABLE … ADD COLUMN data_residency text NOT NULL DEFAULT 'external'
    CHECK (data_residency IN ('on_premises','external'))

website/src/lib/provider-config.ts            data_residency mitlesen und im Typ fuehren
website/src/lib/openai-compatible-session-agent.ts
    Guard in resolveProvider: external -> Fehler VOR jedem Netzaufruf
scripts/llm-proxy/discovery.mjs               lokal-only-Auswahl (kein remote-Substitut)
scripts/llm-proxy/server.mjs                  lokal-only-Anforderung entgegennehmen
```

## Die Reihenfolge im Guard ist die Aussage

Der Guard sitzt **vor** dem Aufbau des Clients, nicht im Fehlerpfad danach. Das ist kein
Stil, sondern der Unterschied zwischen "abgelehnt" und "abgelehnt, nachdem der Payload
schon unterwegs war". Der Spec-Scenario "Refusal precedes the network call" prueft genau
das ueber einen unerreichbaren Endpunkt: kommt eine Verbindungsfehlermeldung statt der
Residenz-Ablehnung, stand der Guard an der falschen Stelle.

## Fehlerbehandlung

| Fall | Verhalten | Warum |
|---|---|---|
| `data_residency = 'external'` | Fehler, nichts gesendet | der Zweck des Vorgangs |
| Spalte fehlt / NULL | wie `external` | fail-closed; eine fehlende Aussage ist keine Zusage |
| kein lokales Backend verfuegbar | Fehler, kein Ausweichen | ADR-004-Grundsatz; Ausweichen waere die Uebertragung |
| Trainings-Lock haelt (E5) | Coaching-Anfrage schlaegt fehl | gewuenscht — die Alternative ist der Datenabfluss |

Dass Coaching waehrend eines Trainingslaufs nicht funktioniert, ist eine bewusst
gekaufte Einschraenkung. Sie ist sichtbar und behebbar (Training abwarten oder ein
zweites lokales Backend vorhalten); ein stiller Abfluss waere weder das eine noch das
andere.

## Bestandsdaten

Die 13 Sessions auf `ki_config_id = 82` laufen nach der Migration in den Guard. Sie
werden **nicht** still auf einen lokalen Provider umgehaengt: es sind Testdaten
(`is_test_data = true`, keine abgeschlossen), und ihr Fehlschlag ist der sichtbare Beleg,
dass der Guard greift. Ein stilles Umhaengen wuerde genau die Pruefung verstecken, die
hier entsteht.

## Tests

Drei Ebenen, jede in der Konvention ihres Verzeichnisses:

- **Migration** — SQL-Ebene: Bestandszeilen stehen nach der Migration auf `external`,
  ein ungueltiger Wert wird abgelehnt.
- **Coaching-Guard** — vitest neben der Quelle (`website/src/lib/*.test.ts`, dortige
  Konvention): externer Provider wird abgelehnt, on-premises laeuft durch, fehlende
  Deklaration zaehlt als extern, und die Ablehnung kommt vor dem Netzaufruf.
- **Proxy lokal-only** — `node:test` neben der Quelle (`scripts/llm-proxy/*.test.mjs`,
  dortige Konvention): lokal-only waehlt kein remote-Backend, gewoehnliche Anfragen
  behalten ihren Fallback.

Alle drei pruefen Verhalten, nicht Quelltext (T002448-M4).

## Abgrenzung

Nicht enthalten: die rechtliche Bewertung, ob ein externer Anbieter mit AVV zulaessig
waere — das ist eine redaktionelle Entscheidung fuer die Arbeit. Dieser Vorgang erzwingt
nur, dass sie bewusst getroffen und deklariert wird. Ebenfalls nicht enthalten: die
Sub-Tickets aus EPIC T002649, die auf diesem Pfad aufsetzen, und jede Aenderung an
`eu_endpoint`.
