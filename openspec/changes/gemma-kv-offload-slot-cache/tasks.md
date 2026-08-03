---
title: "gemma-kv-offload-slot-cache — Implementation Plan"
ticket_id: T002482
domains: [bachelorprojekt-ops, bachelorprojekt-test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# gemma-kv-offload-slot-cache — Implementation Plan

## File Structure

| Datei | Ist-Zeilen | S1-Budget |
|---|---|---|
| `scripts/llm/start-gemma-server.ps1` | 329 | n.a. |
| `tests/spec/llm-pipeline/kv-offload.bats` | neu | n.a. |
| `openspec/changes/gemma-kv-offload-slot-cache/design.md` | vorhanden | n.a. |

`.ps1` und `.bats` stehen nicht in `s1.limits` von `docs/code-quality/gates.yaml` und sind auch
nicht in `docs/code-quality/baseline.json` eingetragen. `bash scripts/plan-lint.sh
residual_budget scripts/llm/start-gemma-server.ps1` liefert entsprechend eine leere Ausgabe —
das S1-Ratchet misst diese Dateien nicht, deshalb steht in der Budget-Spalte kein Zahlenwert.
Das entbindet nicht von Augenmass: die 329 Zeilen sind ueberwiegend Kommentar, und die
Erweiterung soll diesen Charakter behalten.

_Ticket: T002482 — Entwurfsentscheidungen und Trade-offs in `design.md` desselben Ordners._

## Randbedingungen fuer jede Aenderung an der `.ps1`

Gelten fuer Task 3 und Task 4 gleichermassen, bei jedem Schreibvorgang:

- Die Datei ist **CRLF** und **reines ASCII**, ohne BOM. Kein Em-Dash, keine typografischen
  Anfuehrungszeichen, keine Umlaute — Windows PowerShell 5.1 decodiert BOM-loses UTF-8 als
  CP1252. Editor-Einstellungen pruefen, bevor gespeichert wird.
- Pruefbefehle nach jeder Aenderung:
  ```bash
  LC_ALL=C grep -nP '[^\x00-\x7F]' scripts/llm/start-gemma-server.ps1 && echo "NICHT-ASCII" || echo "ASCII ok"
  head -c 3 scripts/llm/start-gemma-server.ps1 | od -An -tx1   # darf nicht 'ef bb bf' sein
  file scripts/llm/start-gemma-server.ps1                      # muss 'ASCII text' melden
  ```
- Keine BATS-Regex gegen diese Datei darf auf `$` ankern. `\r` gehoert zur POSIX-Klasse
  `[[:space:]]`, also `[[:space:]]*$` verwenden — sonst schlaegt der Guard falsch-negativ fehl.
- `bash -n` ist kein Syntaxcheck fuer `.bats`. Verwendbar ist
  `tests/unit/lib/bats-core/bin/bats --count <datei>`.

---

## Task 1: Kapabilitaets-Probe am GPU-Host (Entscheidungs-Gate)

**Warum zuerst:** Gemma 4 nutzt Sliding-Window-Attention (1024er-Fenster, im Skriptkopf
dokumentiert). llama.cpp schraenkt die Serialisierung eines Sequenz-States bei SWA-Modellen ein;
der uebliche Ausweg ist `--swa-full`, das im selben Build vorhanden ist und zusaetzlichen
Speicher kostet. Aus dem Hilfetext ist nicht ableitbar, ob `--slot-save-path` bei diesem Modell
ohne `--swa-full` traegt. Task 4 haengt an dieser Antwort; sie zu raten hiesse, eine Annahme zu
implementieren und sie erst im Betrieb zu widerlegen.

**Schritte:**

1. Vorhandensein der Flags im eingesetzten Build bestaetigen (Erwartung: drei Treffer):
   ```bash
   cd /mnt/c/Users/PatrickKorczewski/llama-bonsai-cuda13.3/bin
   ./llama-server.exe --help 2>&1 | grep -iE "kv-offload|slot-save-path|swa-full"
   ```
2. Testserver auf einem freien Port starten, damit der Produktivserver auf :8091 unberuehrt
   bleibt. `--slot-save-path` wird fuer die Probe von Hand an einen direkten
   `llama-server.exe`-Aufruf gehaengt; das Skript kennt den Schalter zu diesem Zeitpunkt noch
   nicht. Kein `--swa-full` im ersten Durchgang.
3. Guardrail-Prompt in Slot 0 laden, dann speichern und wiederherstellen:
   ```bash
   curl -s -X POST "http://127.0.0.1:8092/slots/0?action=save" \
     -H 'Content-Type: application/json' -d '{"filename":"probe-slot0.bin"}'
   curl -s -X POST "http://127.0.0.1:8092/slots/0?action=restore" \
     -H 'Content-Type: application/json' -d '{"filename":"probe-slot0.bin"}'
   ```
4. Falls Schritt 3 einen Fehler liefert: Durchgang mit `--swa-full` wiederholen.

**Ergebnis festhalten:** Antwort und Rohausgabe als Abschnitt "## Ergebnis der
Kapabilitaets-Probe" in `openspec/changes/gemma-kv-offload-slot-cache/design.md` eintragen und
als Ticket-Kommentar an T002482 haengen.

**Entscheidungs-Gate fuer Task 4:**

| Probe-Ergebnis | Konsequenz |
|---|---|
| Save/Restore erfolgreich ohne `--swa-full` | Task 4 implementiert nur `-SlotSavePath` |
| Save/Restore erst mit `--swa-full` erfolgreich | Task 4 implementiert zusaetzlich `-SwaFull` und koppelt beide: `-SlotSavePath` ohne `-SwaFull` bricht mit erklaerender Meldung ab |
| Save/Restore auch mit `--swa-full` erfolglos | Task 4 entfaellt; der Befund wird im Design festgehalten und als Folge-Ticket gegen T002370 erfasst. Task 3 bleibt unberuehrt und wird normal ausgeliefert |

**Akzeptanz:** Der Design-Abschnitt existiert, nennt die Rohausgabe und benennt genau eine der
drei Tabellenzeilen als eingetretenen Fall.

---

## Task 2: Guards schreiben — rot vor gruen

Neue Datei `tests/spec/llm-pipeline/kv-offload.bats`, geschrieben **vor** der Implementierung.

**Kopfkommentar (verbindlich):** Die Datei dokumentiert ihren Pruefmodus. Sinngemaess: Diese
Guards pruefen den Quelltext per `grep`, nicht das Laufzeitverhalten. Begruendung: das Skript
laeuft ausschliesslich unter Windows-PowerShell auf dem GPU-Host, CI laeuft auf Linux ohne
PowerShell und ohne GPU. Damit greift die dokumentierte Ausnahme der Test-Resultats-Konvention
(T002448-M4) fuer Faelle, deren Ergebnis sich nur im Quelltext manifestiert. Die
Laufzeit-Akzeptanz wird in Task 5 manuell belegt.

**Zu schreibende `@test`-Bloecke** — jeder mit Positiv-Anker im selben Block (T002356-M1: erst
pruefen, dass der gueltige Fall existiert, dann die Negativ-Aussage):

1. `-KvOffload` existiert als `[switch]`-Parameter im `param()`-Block. Positiv-Anker: derselbe
   Block enthaelt weiterhin `$Ctx` — findet die Regex den Anker nicht, ist die Messung kaputt
   und nicht die Aussage wahr.
2. `-nkvo` wird genau dann angehaengt, wenn `$KvOffload` gesetzt ist: Bedingung und Anhaengen
   stehen im selben `if`-Ausdruck, damit ein loses Vorkommen des Strings den Test nicht
   erfuellt (dieselbe Falle, die der `-kvu`-Guard in `tests/spec/llm-pipeline.bats` adressiert).
3. Die VRAM-Rechnung kennt den Modus: der `$needMiB`-Block enthaelt einen Zweig auf
   `$KvOffload`.
4. `-SlotSavePath` existiert als `[string]`-Parameter mit leerem Default, und
   `--slot-save-path` wird nur bei nicht-leerem Wert angehaengt.
5. Regressions-Guard: weder `-nkvo` noch `--slot-save-path` erscheinen unbedingt in `$Params`,
   sondern ausschliesslich innerhalb einer `if`-Bedingung. Positiv-Anker: `"-fit", "off"` steht
   weiterhin unbedingt in `$Params`.
6. Kodierungs-Guard: die Datei enthaelt kein Byte ausserhalb ASCII und kein BOM.

**Failing-Test-Step:**

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/llm-pipeline/kv-offload.bats   # muss 6 melden
tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline/kv-offload.bats
# expected: FAIL — Guards 1-5 sind rot, solange scripts/llm/start-gemma-server.ps1 weder
# -KvOffload noch -SlotSavePath kennt. Guard 6 ist bereits gruen und belegt, dass die Datei
# ueberhaupt laeuft (kein vakuoser Durchlauf).
```

**Akzeptanz:** Der Lauf meldet 6 Tests, davon 5 rot und Guard 6 gruen.

---

## Task 3: `-KvOffload` implementieren

Datei: `scripts/llm/start-gemma-server.ps1`. Randbedingungen aus dem Abschnitt oben beachten.

**Schritte:**

1. `.PARAMETER KvOffload`-Block im Kommentarkopf ergaenzen: Default aus; der KV-Cache wandert in
   den Host-RAM, der VRAM-Sockel wird frei, jeder Attention-Schritt erreicht den Cache ueber
   PCIe — der Durchsatz sinkt, der Kontext wird billiger. Fuer den Bedarf auf
   `scripts/llm/kv-budget.sh --no-kv-offload` verweisen, statt die Formel ein drittes Mal zu
   duplizieren.
2. `[switch]$KvOffload` in den `param()`-Block aufnehmen, nach `$NoMmproj`.
3. Im Bedarfsblock den KV-Term modusabhaengig machen: bei gesetztem `$KvOffload` faellt
   `[int]($Ctx * $perTokMiB)` aus `$needMiB` heraus, und eine eigene Ausgabezeile nennt
   stattdessen den Host-RAM-Bedarf mit derselben Konstante. Ohne diese Anpassung warnte das
   Skript im KV-Offload-Modus vor genau dem VRAM-Mangel, den der Modus beseitigt.
4. Die Statuszeile (`Starting Gemma 4 12B QAT + MTP head on port …`) um ein Modus-Wort
   erweitern, analog zu `$slotWord` und `$mmWord`.
5. `$Params` erweitern: `if ($KvOffload) { $Params += "-nkvo" }` als eigene Zeile nach dem
   bestehenden `-kvu`-Block, damit Bedingung und Anhaengen zusammenstehen.

**Akzeptanz:** Guards 1, 2, 3 und 5 aus Task 2 sind gruen; der ASCII/BOM-Pruefbefehl meldet
`ASCII ok`.

---

## Task 4: `-SlotSavePath` implementieren

Datei: `scripts/llm/start-gemma-server.ps1`. Umfang richtet sich nach dem Entscheidungs-Gate aus
Task 1.

**Schritte:**

1. `[string]$SlotSavePath = ""` in den `param()`-Block aufnehmen.
2. Bei nicht-leerem Wert das Verzeichnis anlegen, falls es fehlt (`New-Item -ItemType Directory
   -Force`), und `@("--slot-save-path", $SlotSavePath)` an `$Params` haengen. llama.cpp erwartet
   einen existierenden Pfad; ohne das Anlegen scheitert der Start mit einer Meldung, die nicht
   auf das Verzeichnis zeigt.
3. Falls das Gate `--swa-full` verlangt: `[switch]$SwaFull` ergaenzen, `--swa-full` analog
   anhaengen und `-SlotSavePath` ohne `-SwaFull` mit erklaerender Fehlermeldung abbrechen lassen
   — fail-loud statt eines Servers, der Save-Aufrufe erst zur Laufzeit ablehnt.
4. `.PARAMETER SlotSavePath`-Block und einen Abschnitt "GUARDRAIL-CACHE" in `.DESCRIPTION`
   ergaenzen. Der Abschnitt dokumentiert die Aufrufsequenz, die bewusst **nicht** im Skript
   liegt: Guardrail-Prompt einmal an den Slot schicken, dann `POST /slots/{id}?action=save` mit
   `{"filename":"…"}`, spaeter `POST /slots/{id}?action=restore` mit demselben Namen.
   Begruendung fuer die Trennung: der Zeitpunkt des Speicherns haengt am Factory-Lebenszyklus,
   nicht am Serverstart.
5. `.EXAMPLE`-Block fuer das Guardrail-Profil ergaenzen.

**Akzeptanz:** Guards 4 und 5 aus Task 2 sind gruen; der ASCII/BOM-Pruefbefehl meldet
`ASCII ok`.

---

## Task 5: Laufzeit-Verifikation am GPU-Host

Belegt die Akzeptanzkriterien 1 und 2 des Tickets, die BATS aus den in Task 2 genannten Gruenden
nicht abdeckt. Manuell, mit gemessenen Zahlen.

**Schritte:**

1. Ausgangslage notieren:
   `nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader`.
2. Referenzlauf ohne die neuen Schalter, `/health` und `/props` abfragen, VRAM notieren.
3. Lauf mit `-KvOffload` bei gleichem `-Ctx` und `-KvType q4_0`, `/health` abfragen, VRAM
   erneut notieren. Erwartung: die Differenz entspricht ungefaehr dem KV-Beitrag, den
   `bash scripts/llm/kv-budget.sh --ctx <ctx> --slots 1 --kv-type q4_0 --mmproj` ausweist.
   Weicht sie deutlich ab, ist das ein Befund und kein Rundungsfehler — dann die Konstante im
   Skript pruefen, nicht die Messung anpassen.
4. Slot-Save/Restore gegen den laufenden Server fahren (Sequenz aus Task 1, Schritt 3) und
   belegen, dass der wiederhergestellte Slot den Guardrail-Kontext ohne Re-Prefill haelt: die
   Server-Logzeile zum Prompt-Processing meldet beim zweiten Aufruf deutlich weniger Tokens als
   beim ersten.
5. Regression: Start ohne die neuen Schalter, `/props` mit dem Referenzlauf aus Schritt 2
   vergleichen — identisch.
6. Alle drei Messreihen als Ticket-Kommentar an T002482 haengen.

**Akzeptanz:** Die drei Messreihen liegen am Ticket, und die VRAM-Differenz aus Schritt 3 ist
positiv.

---

## Task 6: Verifikation und Abschluss

**Schritte:**

1. Test-Inventar regenerieren, weil eine neue Testdatei hinzugekommen ist:
   ```bash
   task test:inventory
   git add website/src/data/test-inventory.json
   ```
2. Guard-Lauf beider betroffener Dateien:
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline/kv-offload.bats
   tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline.bats
   ```
   Beide gruen — der zweite Lauf belegt, dass die bestehenden Gemma-Guards (`-fit off`,
   `-np`/`-kvu`, `--mmproj`, `-fa on`) von der Aenderung unberuehrt sind.
3. Pflicht-Gates:
   ```bash
   task test:changed
   task freshness:regenerate
   task freshness:check
   ```
4. `bash scripts/openspec.sh validate` fuer den Change-Ordner.

**Akzeptanz:** Alle vier Schritte gruen; `git status --porcelain` enthaelt keine Aenderungen
ausserhalb der drei Dateien der File-Structure-Tabelle plus
`website/src/data/test-inventory.json`.
