# Proposal: agent-lock-main-checkout-reclaim

## Why

Beim ticket-ops-Durchlauf am 2026-08-09 setzte AGENT-LOCK einen Branch-Wechsel im
Haupt-Checkout wiederholt zurück: `git checkout -B fix/delta-spec-header-doc-T002772
origin/main` lief durch, aber `.githooks/post-checkout` checkte danach sofort wieder den
alten Branch `fix/openspec-flow-plan-delta-header-format` aus, mit der Meldung
`AGENT-LOCK: main-Checkout auf '…' zurückgesetzt (Lock-Halter aktiv)`. Workaround war
`git worktree add`.

**Ursache verifiziert (Reproduktion, nicht nur Hypothese):**

```bash
# Session A self-claimed main-checkout (Bookkeeping, wie es .githooks/pre-commit bei
# jedem Commit macht — siehe _self_claim_main_checkout in scripts/agent-lock.sh):
AGENT_LOCK_SID=session-A bash scripts/agent-lock.sh claim main-checkout '' \
  --branch fix/old-branch --label 'auto: pre-commit self-claim'

# Session B (neue SID — z.B. ein neuer Subagenten-Dispatch derselben Bedienperson)
# checkt einen neuen Branch aus:
git checkout -b fix/new-branch main
AGENT_LOCK_SID=session-B bash scripts/agent-lock.sh guard-postcheckout
# → "AGENT-LOCK: main-Checkout auf 'fix/old-branch' zurückgesetzt (Lock-Halter aktiv)."
# → HEAD steht danach wieder auf fix/old-branch.
```

`cmd_guard_postcheckout` (`scripts/agent-lock-guards.sh`) überspringt den Revert nur, wenn
`owner_sid` des Locks exakt der aktuellen `_my_sid()` entspricht (Zeile 46). Der
Self-Claim-Mechanismus (`_self_claim_main_checkout`, Label `auto: pre-commit self-claim`)
verankert bei jedem Commit die SID der COMMITTENDEN Session als `owner_sid` — und
`cmd_claim` überschreibt ohne `--force` keinen bestehenden Lock einer anderen (lebenden)
SID (`scripts/agent-lock.sh` Zeilen 334–349). Sobald eine SPÄTERE Session mit einer
ANDEREN SID (z.B. ein frischer Subagenten-Dispatch, dieselbe Bedienperson aber eine neue
Harness-Session) versucht, im selben Haupt-Checkout die Branch zu wechseln, sieht
`guard-postcheckout` eine fremde `owner_sid` und revertiert — obwohl es sich fachlich um
denselben Arbeitsstrang handelt, nur eben eine neue technische Session-ID.

`AGENT_LOCK_POSTCHECKOUT_REVERT=0` existiert bereits als Opt-out, ist aber ein **globaler
Kill-Switch**: er schaltet den Schutz auch gegen einen echten, gleichzeitig arbeitenden
FREMDEN Halter ab. Genau das darf der Fix nicht tun — der Guard schützt bewusst einen
`main`-Checkout, während eine andere Session dort deliberat arbeitet
(`claim main-checkout … --label dev-flow-chore` o.ä.).

## What

Ein neuer, gezielter Befehl `bash scripts/agent-lock.sh reclaim-main-checkout`:

- Ist der `main-checkout`-Lock frei → no-op, Exit 0 (nichts zu übernehmen).
- Gehört der Lock bereits der aktuellen Session → no-op, Exit 0.
- Trägt der Lock das Bookkeeping-Label (`auto: pre-commit self-claim`, siehe
  `_SELF_CLAIM_LABEL`) → wird deliberat auf die aktuelle Session/den aktuellen Branch
  umgeschrieben (Exit 0). Bookkeeping-Locks sind laut `cmd_guard_precommit`s eigener
  Dokumentation ohnehin „keine echte exklusive Haltung" — das Reclaim macht diese
  Einstufung für `guard-postcheckout` nutzbar, ohne sie zu ändern.
- Trägt der Lock ein ANDERES (deliberates) Label → wird **abgelehnt** (Exit 1,
  Lock unverändert). Das ist der Fall, den der Guard schützen soll, und bleibt
  unverändert geschützt.

`guard-postcheckout`s bestehende SID-Gleichheitsprüfung bleibt unverändert — sie ist die
Grundlage, auf der `reclaim-main-checkout` aufbaut: nach einem erfolgreichen Reclaim
matcht `owner_sid` die aktuelle SID, und der bestehende Skip (Zeile 46) greift beim
nächsten Checkout ganz normal.

Die Warnmeldung in `cmd_guard_postcheckout` bekommt zusätzlich einen Hinweis auf den
neuen Befehl, damit Operatoren ihn beim nächsten Vorfall finden, statt erneut den
`git worktree add`-Workaround zu suchen.

**Bewusst nicht enthalten:** keine Änderung an `_my_sid()`, an der Harness-SID-Erkennung
oder an `AGENT_LOCK_POSTCHECKOUT_REVERT` — die SID-Stabilität innerhalb EINER Session ist
bereits durch T002375-p1 belegt (Test `T002375-p1: release gelingt ohne --force ueber die
Tool-Call-Grenze hinweg`); das hier behobene Problem tritt ausschließlich beim Wechsel
ZWISCHEN Sessions auf.

_Ticket: T002809_
