---
ticket_id: T002359
plan_ref: openspec/changes/factory-provider-fallback/tasks.md
status: active
date: 2026-07-27
---

# Factory-Provider-Routing: Fallback-Kaskade wiederherstellen

## Purpose

Der Provider-Fallback der Software Factory ist seit dem Gemma-Cutover (2026-07-27 03:30 UTC)
strukturell unerreichbar. Die Factory laeuft ohne jede Redundanz: faellt der lokale
GPU-Host aus oder steht ein Provider auf `max_concurrent`, gibt es keinen zweiten
Kandidaten — der Router liefert lautlos eine Modell-ID zurueck, die auf keinem Backend
existiert. Dieser Change stellt eine echte dreistufige Kaskade her und beseitigt die
Stille, die den Ausfall 14 Stunden lang unsichtbar gehalten hat.

Ticket: T002359 · Parent-SSOT: `openspec/specs/software-factory.md`

## Root Causes

Sechs unabhaengige Ursachen, jede allein hinreichend dafuer, dass kein Fallback greift.

### RC1 — Der Phase-Shortcut ersetzt die Kandidatenkette

`scripts/factory/route-provider.sh:19-26` mappt jede `factory-*`-Source automatisch auf
eine Phase. Zeilen 72-86 lesen `tickets.factory_model_slots` und returnen beim **ersten
Treffer sofort** — vor der Tier-Kandidatenliste, ohne `provider_health`-Pruefung, ohne
Cooldown, ohne Claim. Die Tabelle enthaelt fuer `plan`/`implement`/`verify` ausschliesslich
`llamacpp/gemma-4-12b`. Der gesamte Block ab Zeile 88 ist fuer die Factory-Kernphasen
toter Code.

### RC2 — Tier-Mismatch: DeepSeek liegt in keinem angefragten Tier

Drei Aufrufer fragen drei verschiedene Tiers an, und keiner trifft eine DeepSeek-Zeile:

| Aufrufer | Ruft an | Tier-Inhalt (Stand 2026-07-27) |
|---|---|---|
| `auto-triage.sh:189,362` | `triage flash` | nur `*/flash/llamacpp/gemma-4-12b` (prio 0) |
| `scout-llm-fallback.sh:49` | `factory-scout cheap` | nur `*/cheap/llamacpp/gemma-4-12b` (prio 0) |
| Factory-Phasen | `sonnet` | Gemma prio 0, DeepSeek prio 1 — von RC1 uebersprungen |

DeepSeek existiert nur in `haiku` (`deepseek-v4-flash`) und `sonnet` (`deepseek-v4-pro`),
beide hinter der Wildcard-Gemma-Zeile mit `priority 0`. Da `ORDER BY (source=:'src') DESC,
priority ASC` sortiert, verdraengt eine `source='*'`-Zeile mit prio 0 alles ausser
source-spezifischen Zeilen.

### RC3 — Slot-Leak: `llamacpp` seit 14 Stunden auf `max_concurrent`

`provider_health`: `active_agents=3` bei `max_concurrent=3`, `claimed_at=2026-07-27 03:30 UTC`
(Stand der Analyse 17:49 UTC). Jeder Aufrufer, der noch durch die Claim-Kette geht, scheitert
am Claim und faellt auf den Emergency-Zweig.

### RC4 — Reaper nirgends verdrahtet, dazu ein Dekrement-Bug

`scripts/factory/reap-provider-slots.sh` (T002281) hat keinen systemd-Timer, keinen Cron,
keinen Taskfile-Eintrag und keinen Aufruf aus `wakeup.sh`. Ein Grep ueber `scripts/`,
`Taskfile.yml` und `.github/` findet ausschliesslich Kommentare und die Migration. Das
"Netz darunter" wurde geschrieben, aber nie aufgehaengt.

Zusaetzlich ein Logikfehler im UPDATE: es dekrementiert `GREATEST(0, active_agents - 1)`
**und** setzt gleichzeitig `claimed_at = NULL`. Bei drei gestrandeten Slots raeumt der erste
Lauf einen weg; danach matcht die Bedingung `claimed_at IS NOT NULL` nie wieder —
`active_agents = 2` bleibt permanent stehen.

### RC5 — Emergency-Fallback zeigt auf ein nicht mehr serviertes Modell

`route-provider.sh:121` endet auf `lmstudio / qwythos-9b-v2 @ 127.0.0.1:1234`. LM Studio
auf :1234 serviert real nur noch `gemma-4-12b`-Varianten und Embedding-Modelle.

### RC6 — Der Factory-Prozess selbst laeuft auf einer Phantom-Modell-ID

`~/.config/factory/autopilot.env` setzt `ANTHROPIC_MODEL=ternary-bonsai-27b`. Dieses Modell
existiert nach dem Cutover auf keinem Backend. Es "funktioniert" nur, weil `resolveModel()`
im llm-proxy unbekannte Modelle still auf das erste gesunde Backend umbiegt — genau der
Mechanismus, den der Kommentar in `route-provider.sh:32-34` bereits als Fehler benennt
("Ein Routing, das von einem Fallback lebt, ist keins"). Er wurde damals nur verschoben,
nicht behoben.

### Warum es still blieb

Jede der sechs Ebenen ist fail-soft gebaut (`|| true`, `exit 0`, Emergency-Row,
`resolveModel()`-Rewrite). Es existiert kein Pfad, auf dem ein Ausfall sichtbar wird.

## Design

### D1 — Eine Kandidatenkette statt vier Sonderwege

`factory_model_slots` liefert kuenftig nicht mehr das *Ergebnis*, sondern den Kandidaten mit
Rang 0. `provider_config` liefert Rang 1..n. Ueber alle Kandidaten laeuft dieselbe
Claim-Schleife (Cooldown, `max_concurrent`, Budget); der erste erfolgreiche Claim gewinnt.

```
1. factory_model_slots[phase]   → Kandidat #0   ┐
2. provider_config[tier]        → Kandidat #1..n ┘ → claim-Schleife → erster Erfolg gewinnt
```

Damit bleibt der Phase-Pin als Steuerinstrument erhalten (die Admin-UI schreibt darauf,
siehe `website/src/lib/factory-model-slots.ts`), verliert aber seine Absolutheit.

**Invariante:** Der `opus`-Zweig (Zeilen 28-70) bleibt unveraendert. Er hat bewusst keinen
Slot-Claim, weil es fuer diesen Tier keinen Release-Pfad beim Aufrufer gibt, und wird von
`FA-SF-70` ohne erreichbare DB getestet.

### D2 — Dreistufige Kaskade in den drei real angefragten Tiers

`cheap`, `flash` und `sonnet` bekommen je drei Zeilen:

| prio | provider | model_id | base_url |
|---|---|---|---|
| 0 | `llamacpp` | `gemma-4-12b` | `http://127.0.0.1:18235` (Proxy) |
| 1 | `lmstudio` | `gemma-4-12b` | `http://127.0.0.1:1234` (direkt) |
| 2 | `deepseek` | `deepseek-chat` | `https://api.deepseek.com/v1` |

Stufe 1 ist der Proxy, Stufe 2 umgeht ihn und spricht LM Studio direkt an — damit deckt die
Kaskade auch einen Proxy-Ausfall bei laufendem Backend ab. Stufe 3 ist netz- und
guthabenabhaengig und faengt den kompletten Ausfall des GPU-Hosts.

Die `/anthropic`-Base-URLs der Alt-Zeilen werden auf `/v1` korrigiert: beide Aufrufer
haengen `/v1/chat/completions` an, was gegen den Anthropic-Endpoint (`/v1/messages`) einen
404 ergibt.

### D3 — API-Key-Zuordnung ueber den Variablennamen

Die Keys liegen bereits git-crypt-verschluesselt in `environments/.secrets/<env>.yaml` und
sind dort nach Verwendungszweck getrennt (`environments/schema.yaml:1107-1118`):

| Variable | Zweck |
|---|---|
| `DEEPSEEK_API_KEY` | Coaching + Website-AI (Meeting-Insights, Assistant-Chat) |
| `DEEPSEEK_API_KEY_PK` | Software-Factory-Autopilot (Account `pk-deepseek`, getrennte Abrechnung) |

Statt diese Zuordnung im Shell-`case` zu verdrahten (`auto-triage.sh:218` liest hart
`DEEPSEEK_API_KEY` — den *falschen* der beiden Keys), traegt die DB-Zeile den **Namen** der
Env-Variable. Neue Spalte `tickets.provider_config.api_key_env TEXT`, ausgeliefert im
Router-JSON als `apiKeyEnv`. Der Aufrufer loest per Indirektion auf:

```bash
key_env="$(jq -r '.apiKeyEnv // empty' <<<"$route")"
api_key="${!key_env:-}"
```

Damit ist die Provider→Key-Zuordnung datengetrieben, ein neuer Provider braucht keine
Code-Aenderung, und die Factory-Zeilen zeigen auf `DEEPSEEK_API_KEY_PK` statt auf den
Coaching-Key. Der Key selbst wird **nicht** in die DB geschrieben — die bestehende
Klartext-Spalte `api_key` bleibt ungenutzt.

`wakeup.sh` exportiert die Variable beim Factory-Start ueber `scripts/env-resolve.sh`, damit
sie in der Prozessumgebung von `auto-triage.sh` und `scout-llm-fallback.sh` steht.

### D4 — Slot-Integritaet

Der Reaper wird an den Factory-Tick in `wakeup.sh` gehaengt statt an einen eigenen
systemd-Timer: der Tick laeuft ohnehin periodisch, und ein Reaper, der nur laeuft wenn die
Factory laeuft, kann keine Slots aktiver Requests abraeumen.

Der Dekrement-Bug wird zu `active_agents = 0` korrigiert. Begruendung: die Zeile wird nur
dann angefasst, wenn ihr Claim aelter als die TTL ist — dann sind *alle* auf ihr gehaltenen
Slots verwaist, nicht nur einer. Das alte `-1` in Kombination mit `claimed_at = NULL` machte
die Zeile nach dem ersten Lauf unerreichbar.

Eine einmalige Migration setzt `llamacpp` sofort zurueck und entblockt Scout und Triage.

### D5 — Das Ende der Stille

Drei Stellen bekommen eine Stimme:

1. Der Emergency-Zweig zeigt auf ein real serviertes Backend und schreibt eine Warnung nach
   stderr **und** als `verify`-Phase-Event in `tickets.factory_phase_events`.
2. `ANTHROPIC_MODEL` in der autopilot.env wird auf `gemma-4-12b` korrigiert (RC6).
3. Ein Health-Task (`task llm:routing:check`) prueft, dass jede Modell-ID in
   `provider_config` und `factory_model_slots` von mindestens einem erreichbaren Backend
   bedient wird — die Regressionssperre gegen den naechsten stillen Cutover.

## Non-Goals

- Keine Aenderung am `opus`-Zweig und seinem DB-losen Fallback.
- Kein Umbau der Admin-UI fuer `factory_model_slots` — der Pin bleibt semantisch erhalten.
- Tier `haiku` und die `coaching`/`ticket-triage`/`assistant-chat`-Zeilen bleiben unangetastet.
  Sie werden von keinem der drei Factory-Aufrufer angefragt; ihre Bereinigung ist ein
  eigener Chore (die `haiku`-DeepSeek-Zeile behaelt damit vorerst ihre `/anthropic`-URL).
- Kein Entfernen der Klartext-Spalte `provider_config.api_key` (eigener Chore).
- Keine Aenderung an `pipeline.mjs` oder der Phasen-Definition selbst.

## Testing

RED-zuerst nach `tests/spec/software-factory.bats` (FA-SF-70-Block), nicht in eine neue
ticket-nummerierte Datei — Konvention aus `CLAUDE.md` §CI/CD.

Die Tests laufen offline (DB-beruehrende Pfade werden geskippt) und pruefen per
Quelltext-Assertion:

1. Der Phase-Zweig returnt nicht mehr unbedingt, sondern reiht `factory_model_slots` in die
   Kandidatenliste ein.
2. Die Emergency-Zeile enthaelt keine Modell-ID ohne Backend-Deckung.
3. `route-provider.sh` gibt `apiKeyEnv` im JSON aus; `auto-triage.sh` enthaelt kein
   hardcodiertes `DEEPSEEK_API_KEY` mehr.
4. Der Reaper setzt `active_agents = 0`, nicht `- 1`.
5. `wakeup.sh` ruft `reap-provider-slots.sh` auf.

Zusaetzlich ein DB-gebundener Test (skip ohne Cluster): jeder der Tiers `cheap`, `flash`,
`sonnet` hat mindestens zwei `enabled` Kandidaten.

**Gotcha (`CLAUDE.md` §CI/CD):** `$output`-Matching nie unqualifiziert gegen die volle
Skript-Ausgabe — der Worktree-Name (`factory-provider-fallback`) enthaelt die Woerter
"factory", "provider" und "fallback" und wuerde ueber ein `$0` in der Usage-Zeile jede
naive Assertion erfuellen. Assertions werden auf die relevante Ausgabezeile eingegrenzt.

## Risks

| Risiko | Severity | Minderung |
|---|---|---|
| Claim-Schleife ueber `factory_model_slots` fuehrt Slot-Claims fuer den Pin ein, wo vorher keine waren — Leak-Gefahr wie RC3 | warn | Reaper (D4) ist im selben Change; `release-slot.sh` wird von beiden Aufrufern bereits gerufen |
| `lmstudio`-Stufe und `llamacpp`-Proxy teilen denselben GPU — Stufe 2 hilft nicht bei OOM, nur bei Proxy-Ausfall | info | Bewusst; Stufe 3 (DeepSeek) deckt den Host-Totalausfall |
| DeepSeek-Guthaben erschoepft sich unbemerkt | warn | Stufe 3 wird nur bei Ausfall der lokalen Stufen erreicht; Emergency-Event (D5) macht jeden Durchgriff sichtbar |
| Neue Spalte `api_key_env` ohne Wert fuer Alt-Zeilen | info | `NULL` → Aufrufer faellt auf leeren Key zurueck, exakt das heutige Verhalten fuer Provider ohne Key (`lmstudio`, `llamacpp`) |
