---
title: "plan-qa-check-quoting — Implementation Plan"
ticket_id: T002595
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-qa-check-quoting — Implementation Plan

_Ticket: T002595 · Design: `openspec/changes/plan-qa-check-quoting/design.md`_

## File Structure

| File | Ist | Budget |
|------|-----|--------|
| `scripts/plan-qa-check.sh` | 227 | 573 |

```
GEAENDERT:
  scripts/plan-qa-check.sh    D1 quoted Heredoc, D2 jq-Payload, Gateway-Umstellung,
                              --emit-payload, getrennte Ausfallarten, curl-Timeout

NEU (liegt bereits als RED-Test im Branch):
  tests/spec/dev-flow-plan/plan-qa-payload.bats   ungated (.bats), kein S1-Budget
```

Die geänderte Datei liegt mit 227 Zeilen weit unter ihrer wirksamen Schwelle (Restbudget 573);
ein Verkleinerungs- oder Split-Schritt ist nicht nötig.

## Ausgangslage

`scripts/plan-qa-check.sh` ist seit dem 2026-06-14 funktionsunfähig. Zwei verifizierte Ursachen,
beide aus unkontrollierter Shell-Interpolation:

- **D1** (Zeile 76): `` `< file` `` steht wörtlich im doppelt gequoteten `SYSTEM_PROMPT` und wird
  beim Zuweisen als Command Substitution ausgeführt. Folge: Meldung auf stderr, und Kriterium 6
  erreicht das Modell ohne sein Beispiel.
- **D2** (Zeile ~101): `${PLAN_CONTENT}` wird roh in das curl-Payload interpoliert. Schon der
  erste Zeilenumbruch erzeugt `Invalid control character` — der API-Call kann nie geglückt sein.

Unbemerkt blieb das, weil die Aufrufer `|| true` nutzen, das Skript auch im Defektfall `exit 0`
liefert und kein Test existiert. Der `DEEPSEEK_API_KEY` ist gesetzt, die Skip-Meldung erschien
also nie — es sah aus, als liefe die Prüfung.

## Task 1 — RED: den Payload-Bau offline festnageln

**Datei:** `tests/spec/dev-flow-plan/plan-qa-payload.bats`

- [ ] **Step 1:** Der Test liegt bereits im Branch. Er ruft `plan-qa-check.sh --emit-payload` mit
      einem Fixture-Plan auf, der Anführungszeichen, Backticks, Backslashes, Dollar-Zeichen und
      Zeilenumbrüche enthält, und prüft die Ausgabe mit `jq -e .`.

- [ ] **Step 2: Rotlauf bestätigen** — `--emit-payload` existiert noch nicht.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-qa-payload.bats
```

Expected: FAIL — alle fünf Tests rot, weil das Skript die Option nicht kennt.

## Task 2 — D1 beheben und `--emit-payload` einführen

**Datei:** `scripts/plan-qa-check.sh`

- [ ] **Step 1:** `SYSTEM_PROMPT` über ein quoted Heredoc (`<<'EOF'`) aufbauen. Der quotete
      Delimiter unterbindet jede Substitution; der Text steht wörtlich im Prompt. Das beseitigt
      die Fehlerklasse, nicht nur die eine Fundstelle.

- [ ] **Step 2:** Argument-Parsing um `--emit-payload` erweitern: Payload auf stdout schreiben und
      mit `exit 0` enden, ohne curl aufzurufen. Der Modus ist der Testzugang und darf weder Netz
      noch Schlüssel noch Gateway brauchen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-qa-payload.bats
```

Erwartung nach diesem Task: die Tests zu System-Prompt und Command-Substitution sind grün, die
Payload-Struktur-Tests noch rot.

## Task 3 — D2 beheben und auf das Gateway umstellen

**Datei:** `scripts/plan-qa-check.sh`

- [ ] **Step 1:** Payload mit `jq -n --arg` bauen statt per String-Interpolation. `jq` escapt
      Anführungszeichen, Backslashes und Steuerzeichen korrekt.

- [ ] **Step 2:** Auf das lokale Gateway umstellen — Basis-URL `127.0.0.1:18235`, Endpunkt
      `/v1/chat/completions`, Modell `gemma26-factory`, System-Prompt als `messages[0]` mit
      `role=system`, Antwortpfad `choices[0].message.content`. Die Skip-Bedingung wandert von
      „kein API-Key gesetzt" auf „Gateway nicht erreichbar".

- [ ] **Step 3:** `enable_thinking: false` setzen, top-level und unter `chat_template_kwargs`,
      weil beide Schreibweisen je nach Backend-Version gelesen werden. Ohne das Flag liefert
      `gemma26-factory` ein leeres `content` bei `finish_reason=length` (gemessen 2026-08-03);
      das Flag ist Funktionsbedingung, keine Optimierung.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-qa-payload.bats
```

Erwartung: alle fünf Tests grün.

## Task 4 — Ausfallarten trennen und Timeout setzen

**Datei:** `scripts/plan-qa-check.sh`

- [ ] **Step 1:** Die zwei Ausfallarten unterschiedlich behandeln. *Gateway nicht erreichbar*
      bleibt ein stilles Überspringen mit `exit 0` — CI und Offline-Arbeit dürfen nicht
      blockieren. *Payload ungültig* erzeugt eine deutliche stderr-Warnung, ebenfalls mit
      `exit 0`, damit der advisory Charakter erhalten bleibt.

- [ ] **Step 2:** `curl --max-time` setzen, damit ein hängendes Gateway keinen Planungslauf
      blockiert, sondern sauber in den Skip-Pfad fällt.

- [ ] **Step 3: Manuelle Live-Probe** gegen das laufende Gateway — der Teil, den die
      Offline-Suite bewusst nicht abdeckt (Antwort-Parsing und Thinking-Verhalten):

```bash
bash scripts/plan-qa-check.sh openspec/changes/plan-qa-check-quoting/tasks.md
```

Erwartung: ein Urteil auf stdout statt einer Fehlermeldung, insbesondere kein
`No such file or directory`. Ist das Gateway nicht erreichbar, erscheint stattdessen die
Skip-Meldung — auch das ist ein gültiges Ergebnis dieses Schritts.

## Task 5 — Final Verification

- [ ] **Step 1: Mutationstest.** Den `jq`-Payload-Bau testweise durch die alte
      String-Interpolation ersetzen und bestätigen, dass die Suite rot wird. Ein Test, der die
      Regression nicht fängt, sichert nichts ab. Änderung danach zurücknehmen.

- [ ] **Step 2:** `bash scripts/plan-lint.sh openspec/changes/plan-qa-check-quoting/tasks.md`
      muss PASS liefern.

- [ ] **Step 3:** Vollständige Prüfkette.

```bash
task test:spec:changed
task test:changed
task freshness:regenerate
task freshness:check
```
