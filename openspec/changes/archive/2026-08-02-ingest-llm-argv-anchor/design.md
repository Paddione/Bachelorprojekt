# Design — Deterministischer argv-Anker für den Ingest-LLM-Endpunkttest

**Ticket:** T002537
**Datei im Fokus:** `tests/spec/brain-foundation/ingest-llm-endpoint.bats`

## Purpose

Der Test `T002533 der Schluessel steht nicht in argv (per ps lesbar)` belegt eine
Sicherheitseigenschaft: der API-Schlüssel darf nicht in der Kommandozeile eines Prozesses
auftauchen, wo ihn jeder Nutzer der Maschine per `ps` mitlesen könnte. Der Test misst diese
Eigenschaft heute durch **Abtastung** eines sehr kurzlebigen Prozesses. Das ist die Ursache
zweier Defekte — eines lauten und eines stillen. Dieser Change ersetzt die Abtastung durch
**Synchronisation**, ohne die Aussagekraft des Tests zu verringern.

## Symptom, Hypothese, Beleg

Die Trennung folgt der Bug-Triage-Konvention (T002448-M5): erst festhalten, was beobachtet
wurde, dann getrennt davon, was daraus geschlossen wird.

### Symptom (Fakt)

`Factory spec shard 3`, Run `30730373962` **Attempt 1**, 2026-08-02:

```
not ok 563 T002533 der Schluessel steht nicht in argv (per ps lesbar)
# (in test file tests/spec/brain-foundation/ingest-llm-endpoint.bats, line 133)
#   `[ "$seen_running" -eq 1 ]' failed
```

Zwei Details aus demselben Log, die die Diagnose tragen:

- Zeile 132 (`[ "$rc" -eq 0 ]`) ist **durchgelaufen**. Der Transform hat also fehlerfrei
  gearbeitet — der Produktionscode ist nicht beteiligt.
- Attempt 2 desselben Runs war grün. Der Fehlschlag ist sporadisch, nicht deterministisch.

> Der im Ticket zitierte Beleg zeigt auf den **grünen** Wiederholungsversuch. Run
> `30730373962` ist als Ganzes grün; nur Attempt 1 enthält den Fehlschlag. Wer den Beleg
> ohne `--attempt 1` nachschlägt, findet nichts und hält das Ticket für gegenstandslos.

### Hypothesen und ihre Prüfung

| Hypothese | Prüfung | Ergebnis |
|---|---|---|
| H1 — Das Abtastfenster ist zu schmal | Laufzeit des Transforms und Iterationszahl gemessen | **bestätigt, präzisiert** |
| H2 — `ps -eo args` kürzt die Zeile, das Muster fällt hinten ab | Prozess mit >1000 Zeichen argv gestartet, `ps`-Ausgabe vermessen | **widerlegt** (1046 Zeichen ungekürzt) |
| H3 — `ps` ist auf dem Runner blind (Container-PID-Namespace, hidepid) | Gegen die Sporadik geprüft | **verworfen** — wäre deterministisch rot; Attempt 2 lief grün |

**H1 präzisiert.** Das Ticket formuliert „Terminiert der Job schneller als die erste
ps-Iteration". Die Messung zeigt etwas Allgemeineres: der Transform lebt 31–56 ms, eine
Schleifeniteration (zwei `ps`-Aufrufe) kostet 11–23 ms. Es passen also nur **2–4 Stichproben**
in das gesamte Ereignisfenster. Abtastperiode und Ereignisdauer liegen in derselben
Größenordnung — das Verfahren hat strukturell keine Reserve, an keinem der beiden Enden:

- **zu früh:** `fork`/`exec` des Kindes ist noch nicht abgeschlossen, `ps` zeigt noch die
  Kommandozeile des Elternprozesses;
- **zu spät:** der Job ist bereits beendet.

Lokal (6 Kerne) ließ sich der Fehlschlag in 45 Läufen nicht reproduzieren, davon 25 unter
Volllast — dort skalieren `ps` und Transform gemeinsam, das Verhältnis bleibt erhalten. Die
Enge entsteht erst auf dem CI-Runner mit vier parallelen Shards auf 2–4 Kernen.

## Der zweite, stille Defekt

Bei der Ursachenanalyse trat ein Mangel zutage, der bisher nicht erfasst war und dieselbe
Wurzel hat.

Die Sachaussage des Tests ist `hits -eq 0` — der Schlüssel steht in **keiner** Kommandozeile.
Der wahrscheinlichste Leckweg ist dabei nicht das Transform-Skript selbst, sondern sein
`curl`-Kindprozess: der Schlüssel wandert in einen `Authorization`-Header, und ein
`curl -H "Authorization: Bearer …"` trüge ihn in seiner argv. Dieses Kind existiert nur
während des HTTP-Requests — also für einen Bruchteil der ohnehin knappen 35 ms.

Bei 2–4 Stichproben über das gesamte Fenster kann die Schleife den Request-Moment **verpassen**
und `hits = 0` melden, ohne je hingesehen zu haben. Der Test wäre grün und hätte nichts belegt.

Der Positiv-Anker ist das einzige Bauteil, das diesen Fall abfängt: fiele er ersatzlos weg,
bestünde `hits -eq 0` vakuos, sobald `ps` aus irgendeinem Grund nichts liefert. Er ist deshalb
**zu härten, nicht zu entfernen** — die Konvention aus T002356-M1 gilt hier wörtlich.

## Approach — Handshake statt Abtastung

Der Stub hält den Request offen und gibt dem Test damit ein Zeitfenster, dessen Beginn und Ende
der Test selbst bestimmt. Gemessen wird, während der Request aussteht — genau dann existiert der
`curl`-Kindprozess, und genau dann wäre ein Leck sichtbar.

```
Test                              Stub (HTTP)
 │                                  │
 ├─ bash TRANSFORM … &              │
 │                                  │
 │            ── POST ────────────► │
 │                                  ├─ schreibt Header/Body wie bisher
 │                                  ├─ legt  gate/arrived  an
 │  ◄──────────────────────────────┤
 ├─ wartet auf gate/arrived         ├─ wartet auf gate/release  (max 60 s)
 │  ▼ ANKER 1: Request kam an       │
 ├─ ps -eo args  ◄── Messung im offenen Request
 │  ▼ ANKER 2: ps ist aussagefähig  │
 │  ▼ SACHAUSSAGE: kein Schlüssel   │
 ├─ touch gate/release ───────────► │
 │                                  ├─ antwortet 200
 ├─ wait $job → rc == 0             │
```

### Verworfene Alternativen

**Fester Verzögerungs-Sleep im Stub** (`time.sleep(0.5)`, Test sonst unverändert). Verbreitert
das Fenster auf 20–45 Stichproben. Verworfen: bleibt ein Zeitversprechen statt eines Beweises,
die Zahl 0,5 ist willkürlich, sie verlängert jeden Lauf, und der stille Defekt bliebe bestehen —
die Messung läge weiterhin an einem zufälligen Punkt statt im Request.

**`/proc/<job-pid>/cmdline` des bekannten Hintergrund-PID lesen** statt global `ps` zu
durchsuchen. Wäre rund 200-mal billiger pro Stichprobe. Verworfen, weil es nur den
Transform-Prozess sieht und den `curl`-Kindprozess nicht — also ausgerechnet den Leckweg
verlöre, um dessentwillen der Test existiert.

## Änderungen

Genau eine Datei. Kein Produktionscode: `scripts/brain-ingest-transform.sh` verhält sich
korrekt, belegt durch `rc = 0` im CI-Log.

### 1. `start_stub` — optionales Gate, strikt additiv

`start_stub` wird von vier Tests genutzt. Die Erweiterung ist additiv: ein optionales zweites
Argument `gate_dir`, durchgereicht als fünftes `sys.argv` an `server.py`. Ohne Gate bleibt das
Verhalten unverändert — die drei übrigen Tests werden nicht angefasst und nicht neu bewertet.

Mit Gate hält `do_POST` den Request offen: `arrived` anlegen, auf `release` warten, antworten.

### 2. Der Test misst im offenen Request

`seen_running` und die 200er-Schleife entfallen. An ihre Stelle tritt: Job starten, auf
`arrived` warten, messen, `release` schreiben, `wait`.

### 3. Zwei getrennte Anker statt eines vermengten

Die alte Variable trug zwei Aussagen gleichzeitig und konnte deshalb an beiden scheitern, ohne
zu sagen, an welcher.

| Anker | Beweist | Vorher |
|---|---|---|
| `arrived` ist erschienen | Der Transform lief und sprach HTTP | implizit in `seen_running` vermengt |
| `brain-ingest-transform` in `ps` sichtbar | **`ps` ist in dieser Umgebung aussagefähig** — ohne das bestünde `hits -eq 0` vakuos | `seen_running`, zeitabhängig |

Anker 2 ist der eigentliche Ersatz des alten `seen_running` und jetzt deterministisch: der
Prozess wartet nachweislich auf die HTTP-Antwort, kann also nicht beendet sein.

Erst nach beiden Ankern folgt die Sachaussage `hits -eq 0`.

## Error Handling

| Fall | Verhalten |
|---|---|
| `arrived` erscheint nicht | Warten bricht nach 10 s ab, mit einer Meldung, die „Stub hat den Request nie gesehen" von „Schlüssel geleakt" unterscheidet |
| Test stirbt vor `release` | Der Stub antwortet nach 60 s von selbst; kein dauerhaft blockierter Server, kein hängender Shard |
| `teardown` | unverändert — der Stub wird weiterhin über `STUB_PID` beendet |

Der Deadlock-Schutz ist bewusst asymmetrisch: 10 s auf Testseite (ein ausbleibender Request ist
ein echter Fehler und soll schnell auffallen), 60 s auf Stubseite (großzügig, weil sein einziger
Zweck das Verhindern eines hängenden CI-Jobs ist).

## Rot-Grün

Der Fix-Pfad verlangt einen fehlschlagenden Test vor dem Plan. Er ergibt sich hier ohne
Kunstgriff aus der Reihenfolge:

1. **RED** — der umgebaute Test gegen das heutige `server.py`. Ohne Gate-Unterstützung wird
   `arrived` nie geschrieben, das Warten läuft in den 10-s-Timeout, der Test scheitert an
   Anker 1.
2. **GREEN** — der Gate-Zweig in `server.py` lässt ihn bestehen.

Beide Stufen liegen in derselben Datei; der RED-Commit trägt deshalb `chore(plans):` und keinen
Implementierungs-Präfix.

## Testing

- Der geänderte Test selbst, mehrfach ausgeführt, auch unter CPU-Last.
- Die drei übrigen Tests der Datei belegen die Abwärtskompatibilität von `start_stub`: sie rufen
  es weiterhin ohne Gate auf und müssen unverändert grün bleiben.
- Kein neuer Testfall, keine neue Datei — repariert wird ein bestehender `@test`-Block. Die
  Konvention „eigene Datei je Vorgang" (T002416) gilt für **neue** Blöcke.

## Out of Scope

- Jede Änderung an `scripts/brain-ingest-transform.sh`.
- Die drei übrigen `@test`-Blöcke der Datei.
- Eine allgemeine Stub-Bibliothek für andere Testdateien.
