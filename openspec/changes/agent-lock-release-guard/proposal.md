# Proposal: agent-lock-release-guard

## Why

`agent-lock.sh release` gibt den Lock einer **anderen, lebenden** Session ohne `--force` frei. Damit
ist die Kernzusage der Session-Koordination ausgehebelt: Ein Claim schützt laufende Arbeit nicht
mehr, und `--force` — das Instrument, mit dem man bewusst einen fremden Lock abräumt — verliert
seine Bedeutung, weil der Normalfall es nicht mehr verlangt.

### Ursache

`cmd_release` (`scripts/agent-lock.sh:357`) trägt seit T002374 einen **same-tool-Fallback**:

```bash
if [ -n "$force" ] || [ "$owner_sid" = "$(_my_sid)" ] \
   || { [ -n "$owner_sid" ] && ! _sid_alive "$owner_sid"; } \
   || [ "$(_lock_field "$f" tool)" = "$(_detect_tool)" ]; then   # ← diese Zeile
```

Im Betrieb reden praktisch immer zwei `claude`-Sessions miteinander. Der letzte Term ist dann
immer wahr, und die drei vorangehenden Prüfungen sind wirkungslos. Dieselbe Zeile steht in
`cmd_refresh` (Z. 342) — dort hält eine fremde Session den Lock einer anderen am Leben.

Der Fallback war ein **Workaround für eine bereits behobene Ursache**. Er entstand, weil `_my_sid`
auf den Unix-SID zurückfiel, der pro Bash-Tool-Call wechselt — die eigene Session galt dadurch als
fremd. T002375-p1 hat das an der Wurzel behoben (`CLAUDE_CODE_SESSION_ID` wird gelesen, stabil über
Tool-Call-Grenzen). Beide Changes wurden am 2026-07-28 gemergt; der SID-Fix lag zum Zeitpunkt von
`d552865be` bereits im Parent-Commit. Die T002374-Arbeit hatte aber vorher begonnen, und der
Workaround wurde nach dem Rebase nie neu bewertet.

Nicht die Ursache — und im Ticket zunächst vermutet — ist ein leerlaufendes `_my_sid`: es liefert
einen echten, stabilen Wert (belegt durch die Diagnoseausgabe
`current SID d4d44684-…` im fehlschlagenden Test).

### Warum es niemand gemerkt hat

Vier Tests decken den Bereich ab und sind **in CI grün, in einer Agent-Session rot**:

| Test | Lock `tool` | Aufrufer CI | Aufrufer Session | CI | Session |
|---|---|---|---|---|---|
| `t002374-mishap-bundle.bats` #3 | `unknown` | `unknown` | `claude` | ok (0) | rot (1) |
| `t002374-mishap-bundle.bats` #4 | `claude` | `unknown` | `claude` | ok (1) | rot (0) |
| `agent-lock-session-identity.bats` #10 | `claude` | `gemini` | `claude` | ok (1) | rot (0) |
| `agent-lock-session-identity.bats` #18 | `claude` | `gemini` | `claude` | ok (1) | rot (0) |

Ursache ist `_detect_tool` (Z. 89): die `claude`-Verzweigung greift, sobald *irgendeine* der
Variablen `CLAUDE_CODE_SESSION_ID`/`CLAUDE_SESSION_ID`/`CLAUDECODE`/`CLAUDE_CODE` gesetzt ist — und
die sind in jeder Agent-Session ambient exportiert. Tests #10/#18 setzen `GEMINI_CLI=1`, um eine
andere Tool-Klasse zu erzwingen; der `gemini`-Zweig ist unerreichbar, weil `claude` in der
Präzedenz davorsteht. Es fehlt schlicht ein expliziter Test-Override für die Tool-Klasse, wie ihn
`AGENT_LOCK_SID` für die Session-ID bereits bietet.

Das ist exakt die Fehlerklasse, die T002375-p1 für `_my_sid` schon dokumentiert hat („ein Override,
den ambient State überstimmen kann, ist keiner") — für `_detect_tool` wurde sie nicht mitgezogen.

## What

1. **`AGENT_LOCK_TOOL` als Test-Override in `_detect_tool`**, mit Präzedenz **vor** den ambient
   Harness-Markern — analog zu `AGENT_LOCK_SID` in `_my_sid`.
2. **Same-tool-Fallback ersatzlos entfernen** — in `cmd_release` *und* `cmd_refresh`. Release ohne
   `--force` gilt danach nur noch bei eigenem Lock oder totem Owner.
3. **Die vier bestehenden Tests auf explizite Vorbedingungen umstellen** (`AGENT_LOCK_SID` +
   `AGENT_LOCK_TOOL` gesetzt), damit sie in CI und Session dasselbe messen. Die beiden
   `t002374`-Tests kodieren dabei die *neue* Semantik: gleiche Tool-Klasse allein berechtigt nicht.
4. **Regressionstest gegen den Umgebungsleck-Effekt**: dieselbe Suite mit und ohne exportiertes
   `CLAUDECODE`/`CLAUDE_CODE_SESSION_ID` muss identisch urteilen.
5. **SSOT-Spec nachziehen**: Das Requirement „Harness-Stable Session Identity" nennt die
   Präzedenz noch `CLAUDE_SESSION_ID` → `AGENT_LOCK_SID` → Unix-SID; der Code macht seit T002375-p1
   das Gegenteil. Wird per `MODIFIED` korrigiert.

### Bewusst nicht Teil dieses Change

- **Session-Familien-Prüfung als Fallback-Ersatz.** Naheliegend für das Delegationsmuster
  (Orchestrator claimt, Subagent released), aber nicht sauber baubar: `CLAUDE_CODE_CHILD_SESSION`
  ist ein Flag (`1`), keine Parent-Referenz. Die Umgebung trägt keine Verknüpfung zur
  übergeordneten Session.
- **Aufräumen bestehender Zombie-Locks** (z. B. `ticket/T002374`, `tool=unknown`, aus einem längst
  gemergten Vorgang). Gehört in `repo-hygiene`, nicht in diesen Fix.

### Risiko

Sollte das Delegationsmuster doch abweichende Session-IDs erzeugen, kehrt „release verlangt
`--force`" zurück. Der Plan sichert das mit einem Test ab, der die Freigabe des **eigenen** Locks
über eine getrennte Bash-Invocation prüft (existiert bereits als
`agent-lock-session-identity.bats` #12 und bleibt grün).

_Ticket: T002447_
