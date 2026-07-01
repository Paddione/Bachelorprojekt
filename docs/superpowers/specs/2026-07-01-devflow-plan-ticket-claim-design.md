---
ticket_id: T001386
plan_ref: null
status: active
date: 2026-07-01
---

# T001386 — dev-flow-plan Feature-Pfad: expliziter Ticket-Claim vor Pre-Commit-Guard — Design Note

**Date:** 2026-07-01
**Branch:** `fix/t001386-devflow-plan-ticket-claim`
**Ticket:** T001386 — "fix(dev-flow-plan): Feature-Pfad fehlt expliziter Ticket-Claim-Schritt vor Pre-Commit-Guard"
**Component:** `.claude/skills/dev-flow-plan/SKILL.md`
**Related:** T001268 (führte den ticket-scoped Pre-Commit-Guard in Schritt 5 ein), T001374 M2 (Mishap-Herkunft dieses Tickets)

---

## 1. Context

T001268 (2026-06-27) fügte dem Feature-Pfad-Schritt 5 ("Commit & Push — dann STOPP") einen
Pre-Commit-Guard hinzu, dessen dritter Check die aktuelle Branch gegen einen **ticket-scoped**
agent-lock-Claim prüft:

```bash
CLAIMED_BRANCH="$(jq -r '.branch' .git/agent-locks/ticket__"$TICKET_EXT_ID".json 2>/dev/null)"
[ "$CLAIMED_BRANCH" = "$CURRENT_BRANCH" ] || { echo "FATAL: branch mismatch …"; exit 1; }
```

Dieser Guard ist **identisch** für Feature- und Fix-Pfad (beide teilen sich Schritt 5 textuell in
der SKILL.md — der Fix-Pfad hat eine eigene, kürzere Schritt-5-Variante ohne den Guard, siehe
unten). Der Guard setzt voraus, dass `.git/agent-locks/ticket__$TICKET_EXT_ID.json` existiert und
ein `branch`-Feld trägt.

## 2. Root-Cause Analysis

### 2.1 Asymmetrie zwischen Fix-Pfad und Feature-Pfad

**Fix-Pfad** (Schritt 2.5, "Ticket & Branch claimen"): claimt **beide** Scopes explizit, bevor
irgendetwas anderes passiert — der Ticket ist zu diesem Zeitpunkt bereits bekannt (Schritt 1 legt
es an oder übernimmt eine übergebene ID):

```bash
bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" \
  --branch "fix/<slug>" --worktree "$PWD" --label dev-flow-plan
bash scripts/agent-lock.sh claim branch "fix/<slug>" --worktree "$PWD" --label dev-flow-plan
```

**Feature-Pfad** (Schritt B.1, "Worktree anlegen"): claimt **nur** `branch`:

```bash
bash scripts/agent-lock.sh claim branch "feature/<slug>" --worktree "/tmp/wt-<slug>" --label dev-flow-plan
```

Es gibt **keinen** äquivalenten `claim ticket`-Aufruf im Feature-Pfad — weder in B.1 noch später.
Der Grund liegt in der Reihenfolge der Artefakte: der Feature-Pfad legt das Ticket typischerweise
**erst in Schritt 4.5** an ("Ticket anlegen oder wiederverwenden") — lange **nach** B.1 (Worktree +
Branch-Claim) und nach der gesamten Brainstorming-/OpenSpec-Propose-Phase. Zum Zeitpunkt von B.1
ist `$TICKET_EXT_ID` im Normalfall (kein vorab von `feature-intake` übergebenes Ticket) schlicht
noch nicht bekannt — ein `claim ticket` dort wäre technisch unmöglich.

### 2.2 Konsequenz: Guard liest eine nie erzeugte Datei

Wenn Schritt 5 (identischer Text für beide Pfade) den Guard-Check 3 ausführt, existiert
`.git/agent-locks/ticket__$TICKET_EXT_ID.json` im Feature-Pfad **nie** — sie wurde nie erzeugt.
`jq -r '.branch' <nicht-existente-datei>` liefert (dank `2>/dev/null`) einen leeren String statt
eines Fehlers. Der nachfolgende Vergleich `[ "$CLAIMED_BRANCH" = "$CURRENT_BRANCH" ]` ist dann
`[ "" = "feature/<slug>" ]` → **false** → der Guard bricht mit `FATAL: branch mismatch` ab, obwohl
die Session tatsächlich korrekt auf ihrem eigenen, per Branch-Claim geschützten Branch arbeitet.

Das ist kein Sicherheits-Feature, sondern ein **Fehlalarm**: der Guard soll verhindern, dass ein
plan-stage-Commit auf der falschen Branch landet (die eigentliche Intention von T001268 M2 war der
`main`-Branch-Fall, nicht der Ticket/Branch-Scope-Mismatch). Für den Feature-Pfad ist der Check in
seiner jetzigen Form nicht erfüllbar, weil die Voraussetzung (ticket-scoped Claim) nie geschaffen
wurde.

### 2.3 Herkunft

Laut Ticket-Beschreibung wurde dies als **Mishap aus T001374 M2** entdeckt — vermutlich ein
dev-flow-execute- oder dev-flow-plan-Lauf, bei dem der Guard-Check in Schritt 5 (Feature-Pfad) auf
den leeren `CLAIMED_BRANCH` traf und fälschlich abbrach oder (schlimmer) bei einer laxeren
Implementierung des Checks stillschweigend durchgelassen wurde.

## 3. Fix Approach

Ergänze den Feature-Pfad um einen expliziten `claim ticket`-Schritt, **positioniert dort, wo die
Ticket-ID im Feature-Pfad tatsächlich zum ersten Mal bekannt ist** — analog zum Fix-Pfad, aber mit
pfadspezifischem Timing:

### 3.1 Fall A — Ticket bereits bekannt vor Phase A (z. B. von `feature-intake` übergeben)

Ergänze Schritt B.1 um einen `claim ticket`-Aufruf **direkt neben** dem bestehenden
`claim branch`-Aufruf, bedingt auf `$TICKET_EXT_ID` gesetzt:

```bash
# Ticket-Claim (Session-Koordination [T000510]) — nur falls Ticket-ID schon bekannt ist
# (z. B. von feature-intake übergeben). Sonst folgt der Claim in Schritt 4.5.
if [[ -n "${TICKET_EXT_ID:-}" ]]; then
  bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" \
    --branch "feature/<slug>" --worktree "/tmp/wt-<slug>" --label dev-flow-plan \
    || { echo "🛑 Ticket wird bereits von einer anderen Session bearbeitet — koordinieren."; exit 1; }
fi
```

### 3.2 Fall B — Ticket wird erst in Schritt 4.5 neu angelegt (Regelfall)

Ergänze Schritt 4.5 direkt **nach** der Ticket-Erzeugung/-Wiederverwendung (nach dem
`stage_plan`/`stage-plan`-Aufruf, vor Schritt 5) um denselben `claim ticket`-Aufruf:

```bash
# Ticket-Claim jetzt nachholen (Session-Koordination [T000510]) — Feature-Pfad kennt die
# Ticket-ID erst ab hier; Schritt 5's Pre-Commit-Guard prüft ticket-scoped und braucht
# diesen Claim VOR dem Commit. [T001386]
bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" \
  --branch "$(git branch --show-current)" --worktree "$(pwd)" --label dev-flow-plan \
  || { echo "🛑 Ticket wird bereits von einer anderen Session bearbeitet — koordinieren."; exit 1; }
```

Die Bedingung "nur claimen, wenn noch nicht durch B.1 (Fall A) geclaimt" wird durch
`agent-lock.sh claim` selbst gehandhabt: ein erneuter `claim` desselben Scopes durch dieselbe
Session (gleiche `_my_sid()`) ist idempotent (Refresh/Heartbeat), kein Fehler. Ein Claim-Versuch
durch eine **andere** Session schlägt korrekt mit Exit 1 fehl. Damit ist Fall A + Fall B
gefahrlos kombinierbar (kein doppeltes Claimen mit Konflikt).

### 3.3 Kein Verhaltenswechsel für den Fix-Pfad

Der Fix-Pfad claimt Ticket + Branch bereits korrekt in Schritt 2.5 — keine Änderung nötig. Der Fix
ist rein additiv im Feature-Pfad.

### 3.4 Guard-Härtung (optional, aber empfohlen im selben Schritt)

Zusätzlich zur strukturellen Lücke ist der aktuelle Guard-Check in Schritt 5 fehleranfällig: er
unterscheidet nicht zwischen "Datei existiert nicht" (strukturelles Problem — sollte laut, nicht
still fehlschlagen) und "Datei existiert, aber Branch weicht ab" (echter Sicherheitsfall). Ergänze
den Check um eine explizite Existenzprüfung mit klarer Fehlermeldung:

```bash
LOCK_FILE=".git/agent-locks/ticket__${TICKET_EXT_ID}.json"
[ -f "$LOCK_FILE" ] || { echo "FATAL: kein ticket-scoped agent-lock-Claim für $TICKET_EXT_ID gefunden ($LOCK_FILE fehlt) — claim zuerst mit agent-lock.sh claim ticket." >&2; exit 1; }
CLAIMED_BRANCH="$(jq -r '.branch' "$LOCK_FILE" 2>/dev/null)"
[ "$CLAIMED_BRANCH" = "$CURRENT_BRANCH" ] || { echo "FATAL: branch mismatch — agent-lock claim = $CLAIMED_BRANCH, HEAD = $CURRENT_BRANCH." >&2; exit 1; }
```

Diese Härtung macht den Fehlerfall aus 2.2 (leerer String durch fehlende Datei) unterscheidbar von
einem echten Branch-Mismatch und verhindert stille False-Negatives in zukünftigen Fällen, in denen
der `claim ticket`-Schritt aus anderen Gründen übersprungen wird.

## 4. Out of scope

- Änderungen an `scripts/agent-lock.sh` selbst (Idempotenz-Verhalten bei Re-Claim durch dieselbe
  Session ist bereits gegeben, siehe T001268 ST-1 / `_sid_alive`).
- Änderungen am Fix-Pfad (bereits korrekt).
- Migration bestehender, bereits laufender Feature-Pfad-Sessions (kein Backfill nötig — der Fix
  betrifft nur künftige `dev-flow-plan`-Läufe).

## 5. Risks

1. **Doppeltes Claimen bei Fall A + Fall B kombiniert** — mitigiert durch Idempotenz von
   `agent-lock.sh claim` für dieselbe Session (siehe 3.2).
2. **Doku-only Fix ist umgehbar** — wie bei T001268 ST-2/ST-3 ist dies ein reiner Skill-Text-Fix;
   ein LLM-Agent kann den Schritt trotzdem überspringen. Der Test (Schritt 6) prüft die *Präsenz*
   der Regel-Formulierung in der SKILL.md (deterministisch, wie beim Vorgänger-Ticket), nicht
   Subagenten-Compliance zur Laufzeit — das ist die stärkste deterministische Prüfung ohne
   Harness-Änderung.
3. **`git branch --show-current` in Schritt 4.5** — Feature-Pfad-Text nutzt an anderer Stelle
   `feature/<slug>` als Literal; der Plan muss sicherstellen, dass der tatsächliche Branch-Name
   (nicht der `<slug>`-Platzhalter) verwendet wird, sonst claimt der Aufruf den falschen
   Branch-Namen wörtlich ("feature/<slug>" statt des echten Branches). Der obige Codeblock
   verwendet daher `$(git branch --show-current)` statt des Literals.

## 6. Verification

Nach dem Fix müssen folgende Prüfungen grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-skill-contracts.bats   # neuer/erweiterter Test für den claim-ticket-Schritt
task test:changed
task freshness:regenerate && task freshness:check
```

Der neue/erweiterte BATS-Test prüft **statisch** (grep gegen `.claude/skills/dev-flow-plan/SKILL.md`),
dass:
1. Schritt B.1 einen bedingten `claim ticket`-Aufruf enthält (Fall A).
2. Schritt 4.5 einen `claim ticket`-Aufruf **vor** dem Verweis auf Schritt 5 enthält (Fall B).
3. Der Pre-Commit-Guard in Schritt 5 die Existenz der Lock-Datei explizit prüft, bevor er
   `jq` darauf ausführt (Guard-Härtung 3.4).
