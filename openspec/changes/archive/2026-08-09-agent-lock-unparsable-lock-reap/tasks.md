---
title: agent-lock-unparsable-lock-reap — Implementation Plan
ticket_id: T002702
domains: [software-factory, tooling]
status: plan_staged
---

# agent-lock-unparsable-lock-reap — Implementation Plan

Eine Lockdatei unter `.git/agent-locks/` ohne parsbaren Inhalt gilt bisher als „lebt" und blockiert
damit jeden Commit im main-Checkout dauerhaft. Dieser Plan macht „unparsbar ⇒ tot" wahr — in
`_reapable()`, im Reap-Log, in `list` und in der Guard-Meldung. Die Liveness-Regeln für *gültige*
Locks bleiben unangetastet.

## File Structure

### Changed files

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/agent-lock.sh` | 535 | 265 |
| `scripts/agent-lock-guards.sh` | 59 | 741 |

- `scripts/agent-lock.sh` — `_reapable()` bekommt eine Parsbarkeits-Vorabprüfung, `_reap_log()` einen
  Dateinamen-Fallback, `cmd_list()` eine `FILE`-Spalte. Wirksame Schwelle ist das statische
  Extension-Limit `.sh = 800` (die Datei ist **nicht** in `docs/code-quality/baseline.json`
  gebaselined), Ist 535 → Budget 265. Das sind rund 67 % der wirksamen Schwelle, also unter der
  80-%-Marke: **kein Modul-Split nötig**. Der erwartete Zuwachs liegt bei ~25 Zeilen inklusive
  Kommentaren und damit weit im Budget.
- `scripts/agent-lock-guards.sh` — `cmd_guard_precommit()` bekommt einen eigenen Zweig für den
  beschädigten Lock. Ebenfalls nicht gebaselined, Ist 59 → Budget 741.

### Unchanged (nur ausgeführt, nicht editiert)

- `tests/spec/software-factory/unparsable-lock-reap.bats` — der bereits geschriebene RED-Test. Er
  wird in diesem Plan **nicht** verändert und nicht abgeschwächt. Die Datei hat die Endung `.bats`,
  für die `docs/code-quality/gates.yaml` unter `s1.limits` kein Limit führt — es gibt hier also kein
  S1-Gate und kein Zeilenbudget.

<!-- vitest: kein neuer Test nötig, weil dieser Change ausschließlich Bash-Skripte unter scripts/ berührt und keine Datei unter website/src anlegt oder ändert. -->

---

## Task 1: RED-Lauf bestätigen (Ausgangsbefund festhalten)

**Files:** `tests/spec/software-factory/unparsable-lock-reap.bats` (nur ausführen)

Vor jedem Eingriff den Ist-Zustand messen, damit später belegbar ist, dass die Implementierung und
nicht ein Testartefakt die Farbe gedreht hat.

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/agent-lock-unparsable-lock-reap
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/unparsable-lock-reap.bats
# expected: FAIL — 6 von 7 Tests rot.
```

Erwartetes Bild (verifiziert am 2026-08-09):

- rot: 0-Byte-Reap, ungültiges JSON, `{}` ohne Identitätsfeld, `list`-Zeile `stale`,
  `.reap.log`-Grund `unparsable`, Guard-Meldung.
- grün: „ein Lock mit lebendem owner_pid überlebt reap" — der Positiv-Anker nach T002356-M1. Er ist
  von Anfang an grün und muss es über alle folgenden Tasks bleiben; kippt er, hat der Fix zu breit
  gegriffen und räumt lebende Locks.

Syntax-Prüfung der Testdatei — falls nötig — mit dem Zähl-Modus, **nicht** mit `bash -n`
(`@test "name" { … }` ist keine gültige Bash-Syntax und liefert dort eine irreführende Fehlermeldung,
T002351-M2):

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/software-factory/unparsable-lock-reap.bats   # 7
```

**Done when:** Der Lauf zeigt 6 Fehlschläge und den grünen Positiv-Anker; die Zahlen sind notiert.

---

## Task 2: `_unparsable_lock()` einführen und in `_reapable()` ganz vorn prüfen

**Files:** `scripts/agent-lock.sh`

Neue Hilfsfunktion direkt über `_reapable()` (in der Nähe von `_lock_field`, dessen Mittel sie teilt):

```bash
# Identitätsfelder: trägt ein Lock keines davon, benennt er keinen Halter.
_AGENT_LOCK_IDENTITY_FIELDS="owner_sid owner_pid worktree branch created_at heartbeat_at"

# 0 = die Datei trägt keinen auswertbaren Inhalt (leer / kein gültiges JSON /
# gültiges JSON ohne jedes Identitätsfeld).
_unparsable_lock() {  # <lock-file>
  local f="$1" _fld
  [ -s "$f" ] || return 0                      # Groesse 0 — der gemeldete Fall, kostenlos geprueft
  for _fld in $_AGENT_LOCK_IDENTITY_FIELDS; do
    [ -n "$(_lock_field "$f" "$_fld")" ] && return 1
  done
  return 0
}
```

Bewusst **keine** neue Systemabhängigkeit: `_lock_field` parst heute per `sed` und braucht kein `jq`
(siehe `_lock_field` in derselben Datei). Die drei Fälle aus dem Design fallen damit auf **eine**
Messung zusammen — ein halbgeschriebenes `{not json` und ein `{}` tragen beide kein vollständiges
`"feld": "wert"`-Paar aus der Identitätsliste, werden also von derselben Schleife erfasst. Ein
separater JSON-Validator wäre eine zusätzliche Abhängigkeit ohne zusätzlichen Erkenntnisgewinn.

Einbau in `_reapable()` — **ganz vorn**, direkt nach `[ -f "$f" ] || return 0` und **vor** jeder
Feldauswertung, damit die Prüfung nicht von derselben Leere abhängt, die sie erkennen soll:

```bash
_reapable() {
  local f="$1" sid wt hb ct now age pid br
  [ -f "$f" ] || return 0
  # [T002702] Unparsbar ⇒ tot, OHNE Grace-Periode. Rationale: _write_lock() schreibt
  # nach "$f.tmp.$$" und schliesst mit atomarem `mv -f` ab, zusaetzlich serialisiert
  # _with_lock alle Schreiber ueber flock. Ein regulaerer Claim kann daher nie eine
  # leere oder halbgeschriebene Lockdatei am Zielpfad hinterlassen — ein unparsbarer
  # Lock ist immer externe Beschaedigung (hier: WSL2-Crash), nie ein legitimer
  # Zwischenzustand eines lebenden Halters. Es gibt kein Race-Fenster, das eine
  # Karenzzeit rechtfertigen wuerde (anders als bei den PID-/SID-Zweigen unten).
  if _unparsable_lock "$f"; then _reap_log "$f" unparsable; return 0; fi
  sid="$(_lock_field "$f" owner_sid)"; …
```

Der Rest der Kette bleibt **wortwörtlich unverändert**. Die neue Prüfung greift ausschließlich, wenn
kein einziges Identitätsfeld gesetzt ist; ein Lock mit auch nur einem gesetzten Feld läuft weiter
durch die bestehende Reihenfolge (confirmed-alive SID, Worktree+Branch-Match, lebende PID, tote PID
nach Grace, fehlender Worktree, tote SID, Heartbeat-TTL).

**Nebenwirkung, die zum Fix gehört:** `cmd_list`, `cmd_check`, `cmd_claim`, `cmd_check_and_claim`,
`_branch_is_live_claimed` und beide Guards rufen alle `_reapable` auf. Sie erben die Korrektur ohne
Signaturänderung — genau deshalb liegt der Eingriff hier und nicht in den Aufrufern.

**Done when:**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/unparsable-lock-reap.bats
```

zeigt die drei Reap-Tests (0-Byte, ungültiges JSON, `{}`) grün und den Positiv-Anker weiterhin grün.

---

## Task 3: `_reap_log()` führt bei inhaltslosem Lock den Dateinamen

**Files:** `scripts/agent-lock.sh`

`_reap_log` rendert heute `<ts> <scope>/<id> <grund>`. Bei einem leeren Lock sind beide Felder leer,
die Audit-Zeile lautet `<ts> / unparsable` und benennt nicht, welche Datei geräumt wurde — sie ist
dann so nichtssagend wie die `list`-Zeile es war.

```bash
_reap_log() {  # <lock-file> <reason>
  local _sc _id _what
  _sc="$(_lock_field "$1" scope)"; _id="$(_lock_field "$1" id)"
  # [T002702] Fallback auf den Basename, wenn WEDER scope NOCH id gesetzt sind.
  # Beide gesetzt/teilbesetzt => bisheriges Format bleibt bitgleich; darauf greifen
  # bestehende Guards (z.B. der heartbeat-ttl-Eintrag in
  # tests/spec/active-sessions-hub.bats greppt 'ticket__… heartbeat-ttl').
  if [ -z "$_sc" ] && [ -z "$_id" ]; then
    _what="$(basename "$1" .json)"
  else
    _what="$_sc/$_id"
  fi
  printf '%s %s %s\n' "$(_now)" "$_what" "$2" >> "$(_lock_dir)/.reap.log" 2>/dev/null || true
}
```

Die Bedingung ist absichtlich „beide leer" und nicht „eines leer": ein Lock mit gesetztem `scope`,
aber leerer `id` (Scope `main-checkout` schreibt `id` regulär mit) soll das gewachsene Format
behalten. Bestehende Konsumenten der Datei sind
`tests/spec/active-sessions-hub.bats` (`heartbeat-ttl`), `tests/spec/agent-lock-force-claim.bats`
(`claim-force`) und `tests/spec/t001415-mishap-bundle.bats` (`pid-dead`) — alle greppen auf
Substrings, keiner auf Spaltenpositionen, und alle schreiben `scope`/`id` in ihre Fixtures. Sie
bleiben von diesem Fallback unberührt und werden in Task 6 mitgeprüft.

**Done when:**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/unparsable-lock-reap.bats
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub.bats tests/spec/agent-lock-force-claim.bats tests/spec/t001415-mishap-bundle.bats
```

Der `unparsable`-Log-Test ist grün und nennt `main-checkout`; die drei Bestandsdateien bleiben grün.

---

## Task 4: `cmd_list()` weist jede Zeile einer Datei zu

**Files:** `scripts/agent-lock.sh`

Der `STATE`-Wert folgt bereits aus Task 2, weil `cmd_list` `_reapable` aufruft. Offen bleibt die
Zuordenbarkeit: im gemeldeten Fall waren `SCOPE`, `ID` und `SID` leer, und aus der Ausgabe ging nicht
hervor, welche Datei betroffen war.

Ergänzung einer `FILE`-Spalte am **Zeilenende** — Kopfzeile und Datenzeile im selben Format:

```bash
printf '%-14s %-24s %-8s %-10s %-6s %-20s %s\n' SCOPE ID TOOL SID STATE LABEL FILE
…
printf '%-14s %-24s %-8s %-10s %-6s %-20s %s\n' \
  "$(_lock_field "$f" scope)" "$(_lock_field "$f" id)" "$(_lock_field "$f" tool)" \
  "$(_lock_field "$f" owner_sid)" "$state" "$(_lock_field "$f" label)" "$(basename "$f" .json)"
```

Anhängen statt Einschieben ist Absicht: die bekannten Konsumenten der Ausgabe —
`scripts/agent-msg.sh` (`cmd_peers`), `scripts/task-context.sh`, `scripts/pr-refresh.sh`,
`scripts/factory/babysit-prs.sh` — filtern per Substring-Grep, nicht über Spaltenindizes. Eine neue
letzte Spalte verschiebt keine bestehende.

**Done when:** Der `list`-Test aus der RED-Suite ist grün: die Zeile für die 0-Byte-Datei enthält
`main-checkout`, trägt `stale` und nicht `live`.

---

## Task 5: Guard meldet den beschädigten Lock als beschädigt

**Files:** `scripts/agent-lock-guards.sh`

Nach Task 2 ist ein leerer Lock reapbar, die Bedingung `! _reapable "$f"` in
`cmd_guard_precommit` greift nicht mehr — der Commit ist damit bereits entsperrt. Ohne weiteren
Eingriff liefe der Guard aber **stumm** durch, und der Operator erführe nie, dass eine beschädigte
Datei herumlag. Deshalb ein eigener Zweig **vor** der Kollisionsprüfung:

```bash
cmd_guard_precommit() {
  [ -n "${AGENT_LOCK_FORCE:-}" ] && return 0
  local f; f="$(_lock_file main-checkout)"
  _with_lock
  # [T002702] Beschaedigter Lock: eigene Meldung, KEINE Kollisionsmeldung. Der
  # Kollisionstext empfiehlt scripts/worktree-create.sh — bei einem Lock, den
  # niemand haelt, ist das die falsche Handlung und kostet den Leser die Zeit,
  # den Widerspruch zwischen "gehalten von " (leer) und "eine andere Session
  # arbeitet" aufzuloesen. Der Commit wird NICHT blockiert (return 0-Pfad): der
  # Lock ist tot, das anschliessende _self_claim_main_checkout raeumt ihn ueber
  # den pre-claim reap in cmd_claim und legt einen intakten an.
  if [ -f "$f" ] && _unparsable_lock "$f"; then
    echo "AGENT-LOCK: Lockdatei $f ist beschaedigt (kein auswertbarer Inhalt)." >&2
    echo "  Sie benennt keinen Halter — kein Commit wird dadurch blockiert." >&2
    echo "  Beheben: 'bash scripts/agent-lock.sh reap' oder die Datei entfernen." >&2
  elif [ -f "$f" ] && ! _reapable "$f" \
     && [ "$(_lock_field "$f" owner_sid)" != "$(_my_sid)" ] \
     && [ "$(_lock_field "$f" label)" != "$_SELF_CLAIM_LABEL" ]; then
    …bestehender Kollisionstext, unverändert…
  fi
  _self_claim_main_checkout || true
  return 0
}
```

Drei Punkte, die der Test genau so prüft:

1. Die Meldung nennt den Pfad und damit den String `main-checkout` — der Guard bemerkt die Datei
   überhaupt (Positiv-Anker; ein stilles Exit 0 ohne Ausgabe würde die Negativaussage vakuos
   erfüllen).
2. Sie enthält `worktree-create.sh` **nicht**.
3. Der bisherige Kollisionstext bleibt für echte Kollisionen wortgleich erhalten — er wandert nur in
   den `elif`-Zweig.

`_unparsable_lock` steht zum Sourcing-Zeitpunkt zur Verfügung: `scripts/agent-lock.sh` definiert es
in Task 2 oberhalb der `for`-Schleife, die die Fragmente einliest (dieselbe Zusicherung, die im Kopf
von `scripts/agent-lock-guards.sh` bereits für `_reapable`, `_lock_field` und `_holder_msg` steht).

**Done when:** Der Guard-Test der RED-Suite ist grün, und
`tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory` zeigt keine Regression in den
übrigen Guard-Tests.

---

## Task 6: Verifikation und Gates

**Files:** `scripts/agent-lock.sh`, `scripts/agent-lock-guards.sh`

Erst die Zielsuite, dann die Nachbarschaft, dann die Repo-Gates.

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/agent-lock-unparsable-lock-reap

# 1) Zielsuite — alle 7 Tests gruen, keiner abgeschwaecht
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/unparsable-lock-reap.bats

# 2) Nachbarschaft. BEIDE Formen erfassen (Sammeldatei UND Verzeichnis, T002696):
#    eine gezielte Suche nach tests/spec/<spec>.bats findet nur die Haelfte.
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory*
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub.bats \
  tests/spec/agent-lock-force-claim.bats tests/spec/agent-lock-claim-persist.bats \
  tests/spec/t001415-mishap-bundle.bats tests/spec/t001408-mishap-bundle.bats

# 3) Statischer Syntax-Check der beiden geaenderten Shell-Dateien
bash -n scripts/agent-lock.sh && bash -n scripts/agent-lock-guards.sh

# 4) S1-Budget nachmessen (erwartet: unter 800 bzw. 741 Rest)
wc -l scripts/agent-lock.sh scripts/agent-lock-guards.sh

# 5) Repo-Gates
task test:changed
task freshness:regenerate
task freshness:check
```

Der Runner-Pfad ist durchgehend das vendorte `tests/unit/lib/bats-core/bin/bats` — niemals
`which bats` (globale npm-Version, kann von CI abweichen) und nicht `./tests/bats/bin/bats` (existiert
nicht).

`task freshness:regenerate` erzeugt unter anderem `website/src/data/test-inventory.json` neu. Da
dieser Change **keine** neue Testdatei anlegt (die `.bats`-Datei liegt bereits im Branch), sollte das
Inventar unverändert bleiben; ändert es sich doch, wird es mitcommittet, sonst schlägt der
Inventar-Check in CI fehl.

**Done when:** Alle drei Gate-Kommandos aus Schritt 5 laufen grün durch, die Zielsuite zeigt 7 von 7
grün, und keiner der Bestands-Tests aus Schritt 2 ist rot geworden.
