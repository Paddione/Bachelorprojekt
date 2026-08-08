# Proposal: coaching-daten-lokal-only

## Why

Das Projekt fuehrt "All data stays on-premises (DSGVO/GDPR by design)" als Kernaussage.
Die Konfiguration widerspricht dem.

**Gemessen am 2026-08-04:** 13 der 18 Zeilen in `coaching.sessions` tragen
`ki_config_id = 82`. Dieser Eintrag in `tickets.provider_config` lautet
`provider = 'deepseek'`, `model_id = 'deepseek-v4-flash'`, mit gesetztem API-Key. Der
Coaching-Agent (`website/src/lib/openai-compatible-session-agent.ts`) loest seinen
Endpunkt daraus auf. Session-Inhalte — `ai_prompt`, `ai_response` und was ueber
`coach_inputs` in den Prompt eingeht — gehen damit an `api.deepseek.com`.

**Zum Ist-Zustand gehoert die Entwarnung:** alle 18 Sessions tragen
`is_test_data = true`, keine hat `status = 'completed'`. Es sind bislang keine echten
Klientendaten geflossen. Der Befund ist eine scharfe Konfiguration, kein eingetretener
Vorfall. Die erste echte Coaching-Session naehme jedoch denselben Weg.

**Es gibt einen zweiten Pfad zum selben Ergebnis.** Unabhaengig von der Provider-Config
fuehrt die Prioritaetskette in `tickets.llm_proxy_backends` `deepseek` als
`kind = 'openai-remote'` auf Prioritaet 2. Wer Coaching-Anfragen ueber den llm-proxy
schickt, faellt bei nicht verfuegbarem lokalem Backend automatisch dorthin — leise, weil
Ausweichen dort die gewuenschte Eigenschaft ist. T002628 (E5, GPU-Arbitrierung) macht
genau diesen Fall zum Regelbetrieb: waehrend eines Trainingslaufs werden die lokalen
Backends absichtlich drainiert.

Beide Vorgaenge sind fuer sich plausibel. Zusammen ergeben sie einen Pfad, auf dem
Klientendaten die eigene Infrastruktur verlassen, ohne dass irgendwo eine Entscheidung
darueber getroffen wurde.

**Warum Konfigurationsdisziplin nicht genuegt:** Die richtige `ki_config_id` zu setzen
ist eine Verabredung, kein Mechanismus. Ein neues Ticket, ein kopierter Datensatz, ein
UI-Klick — und die Session zeigt wieder auf einen externen Anbieter, ohne dass etwas
fehlschlaegt. Eine tragende Aussage der Arbeit sollte technisch erzwungen sein, nicht
durch Sorgfalt getragen.

**Vorhandenes, das nicht ausreicht:** `tickets.provider_config` fuehrt bereits eine
Spalte `eu_endpoint`. Sie beantwortet die falsche Frage: ein EU-Endpunkt von DeepSeek
waere `true` und laege dennoch ausserhalb der eigenen Infrastruktur. "In der EU" und
"auf unseren Maschinen" sind verschiedene Aussagen, und nur die zweite deckt die
Projektaussage.

## What

Datenresidenz wird ein deklariertes Feld und ein durchgesetzter Guard.

**Deklaration.** `tickets.provider_config` bekommt die Spalte `data_residency` mit den
Werten `on_premises` und `external`. Die Migration setzt **alle** Bestandszeilen auf
`external` — fail-closed: wer on-premises sein will, muss es aussprechen. Ein
vergessener Eintrag fuehrt zu einem Fehlschlag, nicht zu einer stillen Uebertragung.
Die vorhandene `eu_endpoint`-Spalte bleibt unangetastet; sie beschreibt weiterhin
Rechtsraum, nicht Betreiberschaft.

**Durchsetzung.** Der Coaching-Pfad akzeptiert ausschliesslich Provider mit
`data_residency = 'on_premises'`. Trifft er auf einen anderen, bricht er mit einer
benannten Fehlermeldung ab und sendet nichts. Kein Ausweichen, kein Fallback — das
entspricht ADR-004, wo derselbe Grundsatz fuer Embeddings bereits gilt: lieber ein
klarer Fehler als ein stilles, falsches Ergebnis.

**Der lokale Weg bleibt nutzbar.** Damit Coaching nach dem Guard nicht schlicht tot ist,
braucht es einen Anfrageweg, der die Slot-Verwaltung des llm-proxy behaelt, aber
niemals auf ein `openai-remote`-Backend ausweicht: der Proxy bekommt eine
lokal-only-Anforderung, die bei ausschliesslich remote verfuegbaren Backends
fehlschlaegt statt zu substituieren. Direkt auf ein Backend zu zeigen waere die
Abkuerzung, umginge aber Loadout-Verwaltung und Slot-Queue.

**Verzahnung mit E5.** Waehrend eines Trainingslaufs sind die lokalen Backends
drainiert. Eine Coaching-Anfrage schlaegt dann fehl — und das ist das gewuenschte
Verhalten, nicht ein Mangel. Die Alternative waere genau die Uebertragung, die dieser
Vorgang verhindert.

**Bestandsdaten.** Die 13 Sessions auf `ki_config_id = 82` sind Testdaten und laufen nach
der Migration in den Guard. Das ist beabsichtigt und sichtbar; sie werden nicht still
umgehaengt.

## Abgrenzung

Nicht Teil dieses Change: eine Bewertung, ob ein externer Anbieter mit
Auftragsverarbeitungsvertrag zulaessig waere — das ist eine rechtliche und redaktionelle
Entscheidung fuer die Arbeit selbst. Dieser Vorgang stellt nur sicher, dass die
Entscheidung bewusst getroffen und deklariert werden muss, statt sich aus einer
Standardkonfiguration zu ergeben. Ebenfalls nicht enthalten: die Sub-Tickets aus
EPIC T002649 (T002652, T002653, T002654), die auf diesem Pfad aufsetzen.

_Ticket: T002657_
