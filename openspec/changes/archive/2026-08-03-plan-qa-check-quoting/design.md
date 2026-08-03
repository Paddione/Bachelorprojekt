---
title: "plan-qa-check-quoting — Design"
ticket_id: T002595
domains: [plans, scripts]
status: active
---

# plan-qa-check reparieren und auf das lokale Gateway umstellen

_Ticket: T002595 · Brainstorming 2026-08-03_

## Zweck

`scripts/plan-qa-check.sh` ist die advisory LLM-Qualitätsprüfung für Implementierungspläne
(aufgerufen in `dev-flow-plan` Schritt 3.8 und über `Taskfile.yml`). Das Skript ist seit seiner
Einführung am 2026-06-14 funktionsunfähig. Dieser Change repariert es, macht einen künftigen
Ausfall sichtbar und stellt den Anbieter auf das lokale Gateway um.

## Symptom (beobachtet, reproduziert 2026-08-03)

```
$ bash scripts/plan-qa-check.sh openspec/changes/factory-model-routing-fix/tasks.md
scripts/plan-qa-check.sh: line 76: file: No such file or directory
$ echo $?
0
```

Zusätzlich reproduziert: das erzeugte JSON-Payload ist ungültig.

```
$ PLAN_CONTENT=$(cat <realer-plan>); printf '{"content":"%s"}' "$PLAN_CONTENT" | python3 -c 'import json,sys;json.load(sys.stdin)'
json.decoder.JSONDecodeError: Invalid control character at: line 2 column 45
```

## Ursachen (verifiziert, nicht angenommen)

### D1 — Command Substitution im Prompt-Text (`scripts/plan-qa-check.sh:76`)

`SYSTEM_PROMPT` ist ein doppelt gequoteter Mehrzeilen-String. Kriterium 6 darin enthält
wörtlich `` `< file` ``. Bash führt das beim **Zuweisen** als Command Substitution aus: es
startet das Kommando `file` mit Eingabeumlenkung aus einer Datei namens `file`.

Zwei Folgen: eine Fehlermeldung auf stderr, und der Hinweis fällt aus dem Prompt heraus (die
Substitution liefert einen Leerstring). Das Kriterium, das Shell-Argument-Fallen prüfen soll,
erreicht das Modell unvollständig.

### D2 — Planinhalt roh im JSON-Heredoc (`scripts/plan-qa-check.sh:~101`)

`${PLAN_CONTENT}` wird ohne JSON-Escaping in das curl-Payload interpoliert. Bereits der erste
Zeilenumbruch erzeugt ein `Invalid control character`; Anführungszeichen und Backslashes kommen
hinzu. Ein realer Plan ist immer mehrzeilig — der API-Call kann daher **nie** erfolgreich
gewesen sein.

`SYSTEM_PROMPT` nutzt daneben korrekt `${...@Q}`. Der Defekt betrifft nur den Nutzerteil.

### Warum es sieben Wochen überlebte

Das Skript wird advisory aufgerufen (`|| true`) und liefert auch im Defektfall `exit 0`. Es
existiert **kein Test**. Der `DEEPSEEK_API_KEY` ist gesetzt, die Skip-Meldung „No API key"
erschien also nie — es sah aus, als liefe die Prüfung.

### Ausdrücklich NICHT die Ursache (geprüft, um Fehlspuren zu schließen)

- **Kein fehlendes `file`-Binary.** `/usr/bin/file` existiert. Die ursprüngliche Mishap-Notiz
  („scheitert am fehlenden file-Binary") war eine Fehldiagnose der Fehlermeldung.
- **Kein Command-Injection-Risiko.** Das Heredoc hat zwar einen unquoteten Delimiter (`<<EOF`),
  aber Bash expandiert den **Wert** einer Variablen nicht erneut. Backticks im Planinhalt werden
  nicht ausgeführt. Es ist ein Korrektheits-, kein Sicherheitsdefekt.

## Entwurf

### 1. D1 — Prompt aus quoted Heredoc

`SYSTEM_PROMPT` wird über `<<'EOF'` aufgebaut. Der quotete Delimiter unterbindet jede
Substitution, der Text steht wörtlich im Prompt. Damit ist die Fehlerklasse strukturell weg,
nicht nur diese eine Fundstelle.

### 2. D2 — Payload mit `jq -n --arg`

Das Payload wird nicht mehr per String-Interpolation gebaut, sondern mit `jq -n --arg`. `jq`
escapt Anführungszeichen, Backslashes und Steuerzeichen korrekt und ist repo-weit bereits
Standardwerkzeug.

### 3. Anbieterwechsel auf das lokale Gateway

Verifiziert am 2026-08-03: das Gateway antwortet auf `127.0.0.1:18235`, listet genau ein Modell
(`gemma26-factory`) und bedient `/v1/chat/completions`.

| | vorher | nachher |
|---|---|---|
| Basis-URL | `api.deepseek.com/anthropic` | `127.0.0.1:18235` |
| Endpunkt | `/v1/messages` | `/v1/chat/completions` |
| Modell | `deepseek-chat` | `gemma26-factory` |
| System-Prompt | Top-Level-Feld | `messages[0]` mit `role=system` |
| Antwortpfad | `content[0].text` | `choices[0].message.content` |
| Skip-Bedingung | kein API-Key gesetzt | Gateway nicht erreichbar |

### 4. `enable_thinking: false` ist Funktionsbedingung, keine Optimierung

Ohne das Flag liefert `gemma26-factory` ein **leeres** `content`-Feld bei gefülltem
`reasoning`-Feld und `finish_reason=length` — das Modell verbraucht das Token-Budget im Denken,
bevor es antwortet. Gemessen 2026-08-03:

| Aufruf | `finish_reason` | Länge `content` |
|---|---|---|
| ohne Flag | `length` | 0 |
| mit `enable_thinking:false` | `stop` | 48 (valides JSON) |

Das Flag wird sowohl top-level als auch unter `chat_template_kwargs` gesetzt, weil beide
Schreibweisen je nach Backend-Version gelesen werden.

### 5. Sichtbarkeit — zwei Ausfallarten, zwei Verhalten

Die Trennung ist der eigentliche Kern des Changes: der Defekt überlebte, weil beide Fälle
gleich still endeten.

| Ausfallart | Verhalten | Begründung |
|---|---|---|
| Gateway nicht erreichbar | still überspringen, `exit 0` | CI und Offline-Arbeit dürfen nicht blockieren |
| Payload ungültig | deutliche stderr-Warnung, `exit 0` | interner Defekt, muss auffallen |

Der Laufzeit-Hinweis allein genügt nicht — er geht in einem langen `dev-flow-plan`-Lauf unter,
genau das ist passiert. Deshalb trägt ein **offline-fähiger Test** die eigentliche Absicherung:
Das Skript bekommt einen `--emit-payload`-Modus, der das Payload auf stdout schreibt statt es zu
senden. Der Test füttert einen Fixture-Plan mit Anführungszeichen, Backticks, Backslashes und
Zeilenumbrüchen und prüft die Ausgabe mit `jq -e .`. Kein Gateway, kein Netz, kein Schlüssel.

### 6. Timeout

`curl` bekommt ein explizites `--max-time`. Der lokale Aufruf ist deutlich langsamer als
DeepSeek; ohne Deckel kann ein hängendes Gateway jeden Planungslauf blockieren. Mit Deckel fällt
der Fall sauber in den Skip-Pfad.

## Umfang

**Geändert:** `scripts/plan-qa-check.sh`
**Neu:** `tests/spec/dev-flow-plan/plan-qa-payload.bats` (T002416: eigenes Verzeichnis, eigene Datei)

**Nicht Teil dieses Changes:**

- Der Aufruf bleibt advisory (`|| true` bei den Aufrufern). Ein hartes Gate wäre eine
  Prozessänderung, keine Fehlerbehebung — `plan-lint.sh` ist und bleibt das harte Gate.
- Keine Änderung an den 6 QA-Kriterien selbst.
- `MAX_ITERATIONS=2` und die Auto-Fix-Schleife bleiben unangetastet.

## Testbarkeit

Der `--emit-payload`-Modus macht den Kern offline prüfbar. Was ohne laufendes Gateway **nicht**
getestet werden kann und deshalb bewusst ungetestet bleibt: das Antwort-Parsing und das
Thinking-Verhalten. Beide sind am 2026-08-03 manuell verifiziert und im Abschnitt 4 mit Messwerten
belegt; ein Test dagegen wäre ein Netzwerktest und gehört nicht in die Offline-Suite.

## Risiken

| Risiko | Umgang |
|---|---|
| Gemma-Antwortqualität schlechter als DeepSeek | Prüfung ist advisory; ein schwächeres Urteil blockiert nichts |
| Gateway-Latenz verlängert Planungsläufe | `curl --max-time`, danach Skip-Pfad |
| `enable_thinking`-Schreibweise ändert sich mit Backend-Version | beide Formen gesetzt; bei leerem `content` greift die Payload-/Antwort-Warnung aus Abschnitt 5 |
