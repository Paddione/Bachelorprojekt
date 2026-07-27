---
title: "factory-reclaim-lock-respect — Implementation Plan"
ticket_id: T002267
domains: [factory, scripts, ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-reclaim-lock-respect — Implementation Plan

_Ticket: T002267 — Folge aus dem T002255/T002256-Zyklus._
_Design: `openspec/changes/factory-reclaim-lock-respect/design.md`_

## File Structure

```
scripts/factory/dispatcher.js                    (mod)  — ticket-scoped Lock-Check statt Sentinel
scripts/ticket-reclaim.sh                        (neu)  — reclaim-Logik
scripts/ticket.sh                                (mod)  — dispatcht `reclaim` an das neue Skript
tests/spec/factory-reclaim-lock-respect.bats     (neu)  — 19 Tests, bereits RED committed
scripts/factory/queue.sh                         (unveraendert — Regressionswaechter)
scripts/agent-lock.sh                            (unveraendert — Regressionswaechter)
```

### S1-Budgets

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/factory/dispatcher.js` | 210 | 390 |

`scripts/ticket.sh` (862 Zeilen) steht **namentlich auf der `s1.ignore`-Liste** in
`docs/code-quality/gates.yaml` — das echte S1-Gate greift dort nicht.

> **Divergenz-Befund:** der Plan-Linter kennt `s1.ignore` nicht und rechnet für diese Datei
> ein Restbudget von −362 (862 − 500), weshalb er einen Split-Schritt anmahnt. Das echte
> S1-Gate liefert über seine evalFile-Funktion für dieselbe Datei `null`. Die beiden
> Werkzeuge widersprechen sich; hier ist das folgenlos, weil dieser Plan ohnehin auslagert.
> Eigenes Ticket wert, damit der Linter künftig keine Splits für ignorierte Dateien
> einfordert.

Die `reclaim`-Logik wird deshalb in ein eigenes Skript **extrahiert** statt `ticket.sh`
weiter wachsen zu lassen — die Ignore-Liste ist ein Eingeständnis, kein Freibrief. Dieser
Split hält `ticket.sh` netto zeilenneutral (zwei Zeilen Dispatch, keine Logik).
`scripts/ticket-reclaim.sh` ist neu (.sh, Limit 500, Zielgröße ~90 Zeilen). `queue.sh` und
`agent-lock.sh` werden nicht angefasst.

S4 (Orphan-Gate): `scripts/ticket-reclaim.sh` wird von `scripts/ticket.sh` referenziert.

<!-- vitest: kein neuer Test nötig — der Change fasst keine Datei unter
     website/src/lib/** oder website/src/pages/api/** an. -->

---

## Task 1 — RED-Nachweis (Failing-Test-Step)

`tests/spec/factory-reclaim-lock-respect.bats` ist im Stage-Commit enthalten und beschreibt
den Zielzustand. Vor der ersten Implementierungszeile den roten Stand bestätigen:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/factory-reclaim-lock-respect.bats
# expected: FAIL — 15 von 19 Tests rot
```

Vier Tests sind bereits grün und **müssen grün bleiben** — sie sichern, dass der Fix nichts
kaputtmacht, das schon richtig ist:

- `agent-lock check meldet 'free' fuer fehlenden Lock` — die Stale-Sicherheit, auf die sich
  der Dispatcher stützt.
- `queue.sh selektiert weiterhin plan_staged` — die Queue-Sichtbarkeit ist gewollt.
- `queue.sh filtert NICHT selbst nach agent-lock` — der Skip gehört in den Dispatcher.
- `agent-lock.sh bleibt unveraendert` — der `check`-Kontrakt genügt.

> **Warnung aus der RED-Phase:** Ein früher Entwurf des Usage-Tests matchte unqualifiziert
> gegen `$output`. `ticket.sh` gibt in seiner Usage-Zeile `$0` aus, und der Worktree-Pfad
> `.worktrees/factory-reclaim-lock-respect/…` enthält den Suchbegriff `reclaim` bereits —
> der Test war grün, ohne irgendetwas zu prüfen. Assertions gegen Kommando-Ausgaben deshalb
> immer auf die relevante Zeile einschränken (hier: `grep '^Commands:'`).

---

## Task 2 — `scripts/factory/dispatcher.js`: ticket-scoped Lock-Check

Der bestehende Block (Zeilen 106–120) wird ersetzt. Alt:

```js
let sentinel = { interactive_worker_active: false };
try {
  const locks = execFileSync('bash', [`${REPO}/scripts/agent-lock.sh`, 'list'], { /* … */ });
  sentinel = { interactive_worker_active: /interactive-worker/.test(locks) };
} catch {}

let maxParallel = launches.length;
if (sentinel && sentinel.interactive_worker_active) {
  maxParallel = Math.max(1, launches.length - 1);
  log(`Dispatcher: interactive-worker detected, reducing slots to ${maxParallel}`);
}
```

Neu — eine Prüfung **pro Ticket** statt eines pauschalen Slot-Abzugs:

```js
/**
 * True iff a live interactive session holds a ticket-scoped agent-lock.
 * agent-lock.sh check exits 0 for "free"/"mine" and 3 for "held" (foreign LIVE
 * session). A reapable (dead) lock reports "free" — an abandoned session can
 * therefore never starve the queue.
 */
function heldByLiveSession(extId) {
  try {
    execFileSync('bash', [`${REPO}/scripts/agent-lock.sh`, 'check', 'ticket', extId], {
      encoding: 'utf8', timeout: 30000, stdio: 'pipe',
    });
    return false;                                // exit 0 → free | mine
  } catch (err) {
    if (err && err.status === 3) return true;    // exit 3 → held
    return false;                                // Skript kaputt/fehlend → nicht blockieren
  }
}
```

Vor dem Slot-Claim je Kandidat:

```js
if (heldByLiveSession(t.external_id)) {
  log(`Dispatcher: skipping ${t.external_id} — held by a live interactive session (agent-lock)`);
  continue;
}
```

Der `maxParallel`-Abzug entfällt ersatzlos — er war der grobe Ersatz für genau diese
Prüfung und würde jetzt nur noch grundlos Kapazität kosten.

**Fail-open ist Absicht:** ist `agent-lock.sh` nicht ausführbar oder liefert es einen anderen
Exit-Code, dispatcht der Dispatcher wie bisher. Ein kaputter Lock-Check darf die Factory
nicht stilllegen; der Slot-Claim selbst ist ohnehin race-free (`WHERE pipeline_slot IS NULL`).

Die exakte Einbaustelle (Kandidaten-Schleife vs. Vorfilterung) beim Umsetzen aus dem
umgebenden Code ableiten — maßgeblich ist, dass der Check **vor** `slots.sh claim` läuft.

---

## Task 3 — `scripts/ticket-reclaim.sh` anlegen

Neues Skript, ~90 Zeilen. Ablauf:

1. **Ticket-Zustand lesen** — `status`, `pipeline_slot`, `updated_at`.
2. **Worker-Liveness bestimmen.** Ein Worker gilt als lebend, wenn
   `pipeline_slot IS NOT NULL AND status='in_progress'` **und** `updated_at` jünger als die
   Stale-Schwelle ist. Die Schwelle stammt aus derselben Quelle wie in
   `scripts/factory/watchdog.sh` (`STALE_MIN`) — beide Urteile über "Worker lebt" müssen
   übereinstimmen, sonst widersprechen sich Watchdog und `reclaim`.
3. **Lebt ein Worker und fehlt `--force`:** abbrechen mit Exit ungleich 0 und einer Meldung,
   die `pipeline_slot`, `status` und das Alter des letzten Fortschritts nennt, plus dem
   Hinweis auf `--force`. Nichts verändern.
4. **Sonst:** Slot freigeben (`bash scripts/ticket.sh release-slot` bzw. direkt
   `scripts/factory/slots.sh release`), Status auf **`plan_staged`** setzen, dann
   `bash scripts/agent-lock.sh claim ticket "$ID" --label dev-flow-execute`.

**`plan_staged`, nicht `blocked`** — das ist der Kern. Der Plan ist fertig; `blocked` würde
den Zustand falsch berichten und die Auswertung verfälschen. Die Zuständigkeit drückt der
Lock aus, nicht der Status. Genau deshalb greift Task 2: nach dem Claim überspringt der
Dispatcher das Ticket, obwohl es korrekt als `plan_staged` in der Queue steht.

`chmod +x scripts/ticket-reclaim.sh` — Test 8 prüft das Executable-Bit.

DB-Zugriffe über die im Repo übliche Route (`scripts/ticket.sh get` bzw. der
`factory_psql`-Helper aus `scripts/factory/lib.sh`); keine neue Verbindungsart einführen.

---

## Task 4 — `scripts/ticket.sh`: `reclaim` dispatchen

Nur zwei Stellen:

1. Im `case`-Block ein `reclaim)` ergänzen, das an das neue Skript weiterreicht:
   ```bash
   reclaim) exec bash "$(dirname "$0")/ticket-reclaim.sh" "$@";;
   ```
2. `reclaim` in die `Commands:`-Zeile der Usage aufnehmen.

Bewusst kein Logik-Import: `ticket.sh` ist mit 862 Zeilen bereits auf der `s1.ignore`-Liste
geparkt.

---

## Task 5 — Verifikation

```bash
# 1. Alle Tests dieses Changes grün
./tests/unit/lib/bats-core/bin/bats tests/spec/factory-reclaim-lock-respect.bats

# 2. Regression: die Factory-Suite bleibt grün
./tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats

# 3. Dispatcher lädt ohne Syntaxfehler
node --check scripts/factory/dispatcher.js

# 4. reclaim-Skript ist syntaktisch sauber
bash -n scripts/ticket-reclaim.sh

# 5. Test-Inventar nach der neuen BATS-Datei regenerieren
task test:inventory

# 6. OpenSpec-Delta validieren
task openspec:validate

# 7. Mandatory CI-Gates
task test:changed
task freshness:regenerate
task freshness:check
```

**Manuelle Probe (empfohlen, nicht automatisierbar):** ein Testticket auf `plan_staged`
setzen, `agent-lock.sh claim ticket <id>` absetzen und einen Factory-Tick auslösen — das
Ticket muss in der Queue sichtbar bleiben und darf keinen `pipeline_slot` bekommen. Danach
`agent-lock.sh release` und erneut ticken: jetzt muss es normal gegriffen werden. Diese
Probe deckt das Zusammenspiel ab, das die Content-Assertions nur einzeln prüfen.
