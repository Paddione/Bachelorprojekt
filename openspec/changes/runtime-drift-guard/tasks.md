---
title: Laufzeit-Drift-Guard — Repo-Stand gegen laufenden Stand pruefen
ticket_id: T003825
domains: [scripts, tests, agent-skills]
status: plan_staged
---

# runtime-drift-guard — Implementation Plan

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/runtime-drift-check.sh` | 0 (neu) | 800 |
| `scripts/one-shot/purge-fn-v8.sql` | 452 | unveraendert (nur eine Kommentarzeile) |
| `.claude/skills/repo-hygiene/SKILL.md` | 58 | Markdown, kein S1-Limit |
| `tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats` | 160 (RED, vorhanden) | Bats, kein S1-Limit |
| `website/src/data/test-inventory.json` | generiert | via `task test:inventory` |

`scripts/runtime-drift-check.sh` ist neu und nicht gebaselined; wirksame Schwelle ist das
statische `.sh`-Limit 800 aus `docs/code-quality/gates.yaml`. Der Guard wird bei rund 200
Zeilen liegen, die Reserve ist also reichlich.

## Partials

| Partial | Rolle | target_files |
|---|---|---|
| p1-guard | Implementierung | `scripts/runtime-drift-check.sh`, `scripts/one-shot/purge-fn-v8.sql`, `.claude/skills/repo-hygiene/SKILL.md` |
| p2-tests | Tests | `tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats`, `website/src/data/test-inventory.json` |

Die Dateimengen sind disjunkt (D1). Das letzte Partial traegt die Tests-Rolle.

---

## Task 1 — Rotphase belegen (p2-tests)

Der failing Test liegt bereits im Branch und ist im RED-Zustand. Vor jeder
Implementierungszeile den Rotlauf reproduzieren, damit die spaetere Gruenfaerbung
zurechenbar ist.

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats
# expected: FAIL — alle 8 Zusicherungen rot, scripts/runtime-drift-check.sh existiert nicht
```

Erwartet sind **8 von 8** rot. Schlaegt weniger als das fehl, ist das ein Befund am Test und
nicht am Code: eine Zusicherung, die ohne Implementierung gruen ist, prueft nichts
[T003548-Klasse]. Genau dieser Fall trat beim Schreiben auf — der Test „Guard beendet den
Prozess NICHT" war zunaechst gruen, weil ein nicht existierendes Skript naturgemaess nichts
beendet; er traegt jetzt einen vorgeschalteten Positiv-Anker.

**Verifikation:** Ausgabe enthaelt `not ok 1` bis `not ok 8`.

---

## Task 2 — Pruefer 1: MCP-Prozesse gegen ihre Binaries (p1-guard)

`scripts/runtime-drift-check.sh` anlegen, ausfuehrbar (`chmod +x`).

Die zu pruefenden Binaries werden aus `docs/agent-guide/registry/mcp.yaml` gelesen — jeder
Eintrag unter `clients:` mit `transport: stdio`, Feld `command`. Der Registry-Pfad ist ueber
`RUNTIME_DRIFT_REGISTRY` ueberschreibbar, damit Tests gegen eine eigene Registry laufen
koennen, ohne laufende Sessions zu beruehren.

Pro Eintrag:

1. Kommando zu einem absoluten Pfad aufloesen (`command -v`), wenn es kein Pfad ist.
2. Laufende Prozesse dieser Binary ermitteln.
3. Fuer jeden Prozess `readlink /proc/<pid>/exe` lesen:
   - Endet der Wert auf `" (deleted)"` → Drift: die Binary wurde ersetzt, der Prozess laeuft
     mit dem alten Code weiter.
   - Sonst `sha256sum /proc/<pid>/exe` gegen `sha256sum <datei>` stellen; Abweichung → Drift.
4. Bei Drift PID, Startzeit und Registry-Name ausgeben, dazu den Reparaturhinweis
   (`kill <pid>` — der Server startet beim naechsten Tool-Aufruf neu).

Prozesse, deren `/proc/<pid>/exe` nicht lesbar ist (fremder Benutzer), werden uebersprungen
und nicht als Drift gewertet.

`npx`- und Wrapper-basierte Eintraege brauchen **keine** Sonderbehandlung: dort zeigt
`/proc/<pid>/exe` auf den Interpreter (`node`, `python3`), der nicht ersetzt wird. Der
generische Test trifft damit von selbst nur die selbstgebauten Binaries — das ist praeziser
als eine gepflegte Ausnahmeliste und veraltet nicht.

**Verifikation:**

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats \
  --filter 'Binary|Prozess'
```

Die vier Prozess-Zusicherungen sind gruen, die DB- und Einbindungs-Zusicherungen noch rot.

---

## Task 3 — Pruefer 2: DB-Funktionen gegen ihre Migrationen (p1-guard)

Denselben Guard um den zweiten Pruefer erweitern.

Migrationsdateien unter `scripts/one-shot/*.sql` werden nach Kommentarzeilen der Form

```sql
-- RUNTIME-CHECK: function=<schema>.<funktion> marker=<substring>
```

durchsucht. Verzeichnis ueber `RUNTIME_DRIFT_MIGRATIONS` ueberschreibbar, DB-Kontext ueber
`RUNTIME_DRIFT_CTX`. Pro Fund wird `pg_proc.prosrc` der genannten Funktion gelesen und auf
den Marker geprueft:

```sql
SELECT prosrc LIKE '%<marker>%'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = '<schema>' AND p.proname = '<funktion>';
```

Fehlt der Marker, wird die Funktion samt erwartetem Marker und der Migrationsdatei gemeldet,
die ihn liefert.

**Nicht erreichbare DB ist kein Drift.** Laesst sich kein Pod oder keine Verbindung
aufloesen, meldet der Pruefer `uebersprungen` mit Begruendung und traegt **nicht** zum
Exit-Status bei. Ein Guard, der ohne Cluster rot wird, misst die Ausstattung der Umgebung
statt den Zustand des Systems und wird nach kurzer Zeit ignoriert.

Gesamt-Exit: `0` ohne Drift, `1` mit mindestens einem Drift. Der Guard schreibt nie — er
beendet keine Prozesse und spielt keine Migrationen ein.

**Verifikation:**

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats
```

Sieben der acht Zusicherungen gruen; rot bleibt nur die Einbindung aus Task 5.

---

## Task 4 — Marker deklarieren und v8 anwenden (p1-guard)

In `scripts/one-shot/purge-fn-v8.sql` die Nachweiszeile ergaenzen (unter dem Kopfkommentar,
vor `\set ON_ERROR_STOP`):

```sql
-- RUNTIME-CHECK: function=tickets.fn_purge_test_data marker=to_regclass
```

`to_regclass` ist der Marker, weil genau diese Guards v8 von der installierten Vorversion
unterscheiden — die Pruefung, mit der die Ursache belegt wurde.

Danach die Migration auf die lokale k3d-DB anwenden:

```bash
POD=$(kubectl get pod -n workspace --context k3d-mentolder-dev -l app=shared-db -o name | head -1)
kubectl exec -i "$POD" -n workspace --context k3d-mentolder-dev -c postgres -- \
  psql -U postgres -d website < scripts/one-shot/purge-fn-v8.sql
```

Ohne diesen Schritt waere der Guard ab seinem ersten Lauf rot, und ein Guard, der von Anfang
an rot ist, wird ignoriert.

**Verifikation:** Der Aufruf, der die Ursache belegt hat, laeuft jetzt durch statt
abzubrechen:

```bash
kubectl exec -i "$POD" -n workspace --context k3d-mentolder-dev -c postgres -- \
  psql -U postgres -d website -qtAc "SELECT tickets.fn_purge_test_data();"
```

Erwartet: ein JSONB-Ergebnis statt `ERROR: relation "billing_invoices" does not exist`.

---

## Task 5 — Einbindung in repo-hygiene (p1-guard)

In `.claude/skills/repo-hygiene/SKILL.md` einen Abschnitt „Laufzeit-Drift" ergaenzen, der
`bash scripts/runtime-drift-check.sh` aufruft und seine Befunde neben den bestehenden
Branch-, Worktree- und Queue-Befunden auffuehrt. Der Abschnitt haelt fest, dass der Guard
meldet und nicht eingreift: das Beenden eines Prozesses und das Einspielen einer Migration
bleiben Entscheidungen des Betreibers.

Ein Nebeneffekt, der hier benannt gehoert: der Guard erfuellt zugleich T003071 („Stale
factory-mcp binary deployed via systemd"), weil `factory-mcp` als stdio-Eintrag in derselben
Registry steht und damit automatisch mitgeprueft wird.

**Verifikation:**

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats
```

Alle acht Zusicherungen gruen.

---

## Task 6 — Abschliessende Verifikation (p2-tests)

```bash
# Der Guard gegen das reale System — findet er den Zustand, den er finden soll?
bash scripts/runtime-drift-check.sh; echo "exit=$?"

# Vollstaendiger Spec-Lauf, beide Formen der Ablagekonvention [T002696]
tests/unit/lib/bats-core/bin/bats -r tests/spec/batch-repo-hygiene-ops-fixes*

# Test-Inventar nach der Test-Aenderung regenerieren und mitcommitten
task test:inventory

task test:changed
task freshness:regenerate
task freshness:check
```

Der erste Befehl ist der eigentliche Nachweis: nachdem v8 angewendet und die stale Prozesse
beendet sind, muss der Guard `exit=0` liefern. Meldet er weiterhin Drift, benennt seine
Ausgabe die Fundstelle — dann ist entweder eine Instanz uebersehen worden oder der Pruefer
meldet falsch-positiv, und beides ist vor dem PR zu klaeren.
