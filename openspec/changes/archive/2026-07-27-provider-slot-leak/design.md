# Design: Provider-Slot-Leak und Test-Nebenwirkungen [T002281]

## Purpose

Vier Befunde aus dem Gemma-Cutover (T002277, 2026-07-27). Drei davon teilen dieselbe
Fehlerklasse: **eine Bedingung prüft einen Stellvertreter statt den tatsächlichen Zustand** —
ein Zähler statt des lebenden Prozesses, ein PID-File statt des Ports, ein `cd` ohne
Erfolgsprüfung. Der vierte ist Datenmüll aus einer abgelösten Codeversion.

## Root Causes

### B1 — `provider_health.active_agents` wird nie freigegeben

`route-provider.sh` claimt in der `provider_config`-Kette atomar einen Slot
(`active_agents + 1`) und liefert `slotId`. Freigegeben wird über
`scripts/factory/release-slot.sh`.

**Dieses Skript wird von keinem Produktionscode aufgerufen — nur von Tests.**

Die Treffer, die nach Freigabe aussehen (`ticket.sh release-slot --id …` in
`factory-prep-bridge.sh`, `factory-prep-runner.sh`, `ticket-reclaim.sh`), sind ein
**gleichnamiges, anderes Kommando**: es gibt den Ticket-Pipeline-Slot frei, nicht den
`provider_health`-Zähler. Zwei Dinge mit identischem Namen und verschiedener Semantik.

Von den zwei echten Aufrufern des Routers macht es nur einer richtig:

| Aufrufer | Claim | Release |
|---|---|---|
| `scout-llm-fallback.sh` | ja | ja — `trap release_slot EXIT` (Zeile 68) |
| `auto-triage.sh` | ja (Zeile 153, `triage flash`) | **nein** — liest `slotId` nicht einmal aus |

`auto-triage.sh` befragt laut Header „pro Ticket DeepSeek via route-provider". Das erklärt
exakt, warum `deepseek` auf `active_agents=3` steht — genau `max_concurrent`. Der Provider
wird seitdem von `route-provider.sh` still übersprungen; es gibt keine Fehlermeldung, die
Kette fällt einfach auf den nächsten Kandidaten durch.

Gemessen 2026-07-27: `deepseek=3`, `lmstudio=8`, `ternary-bonsai-27b=3`. `llamacpp` wuchs
innerhalb einer Stunde nach manuellem Reset wieder auf 1 — der Leak ist aktiv.

Nebenbefund: der Kommentar in `route-provider.sh:4` behauptet „inlined into pipeline.js".
`pipeline.js` enthält weder `slotId` noch `route-provider` noch `provider_health`.

### B2 — Korrupte `provider`-Werte

Zwei Zeilen in `provider_health` tragen als Provider-Namen eine ganze Ergebniszeile:

```
anthropic\tclaude-sonnet-4-6\t\t3
deepseek\tdeepseek-v4-pro\thttps://api.deepseek.com/anthropic\t3
```

Zwei Beobachtungen datieren das: die Werte enthalten **literale** `\t`-Sequenzen (keine
echten Tabs, sonst zeigte psql sie als Leerraum), und sie haben **vier** Felder. Die heutige
Kandidaten-Query liefert **sechs** (mit `ctx` und `budget`, seit T001590). Die Zeilen stammen
also aus einer abgelösten Codeversion, in der `E'\t'` nicht als Escape interpretiert wurde.
Sie sind mit `active_agents=0` folgenlos.

### B3 — Tests schreiben ins echte Repo und in die echte DB

`tests/unit/check-commit-vs-diff.bats` (Zeilen 141, 151, 169):

```bash
mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q && …
printf 'fix(infra): …\n' > "$TMP/msg-subject"
mkdir -p openspec/changes/x && printf 'plan' > openspec/changes/x/tasks.md
```

Die dritte Zeile hängt **nicht** an der `&&`-Kette der ersten. Schlägt `cd` fehl, entsteht
`openspec/changes/x/` im Repo-Root. Bats setzt in `@test`-Blöcken kein `set -e`, der Test
bricht deshalb nicht ab — er verschmutzt still das Arbeitsverzeichnis. Genau das wurde am
2026-07-27 beobachtet (0-Byte-`tasks.md`, Zeitstempel im Testfenster).

Verwandt: `FA-SF-70` ruft `provider-config.sh set --source x --tier opus …` gegen die
**echte** `provider_config` auf und hinterlässt dort dauerhaft `x|opus|1|anthropic|m`.
Folgenlos, weil `source='x'` nie matcht — aber ein Test, der in eine produktive
Routing-Tabelle schreibt, ist eine Zeitbombe.

### B4 — `install-service` prüft den Port nicht

`task llm:proxy:install-service` (aus PR #3320) beendet eine laufende `nohup`-Instanz nur
über das PID-File. Am 2026-07-27 05:02 lief die Altinstanz mit PID 280029, das PID-File
enthielt `280029`, `kill -0 280029` war erfolgreich — der Block griff trotzdem nicht, und die
frisch installierte Unit lief in eine `EADDRINUSE`-Restart-Schleife. Sichtbar nur im Journal;
`systemctl is-active` meldet währenddessen `activating`, was wie ein langsamer Start aussieht.

## Entscheidungen

**B1 → Aufrufer fixen UND die Klasse absichern.** `auto-triage.sh` bekommt denselben
`trap release_slot EXIT` wie `scout-llm-fallback.sh`. Zusätzlich ein TTL-Reaper: `provider_health`
bekommt `claimed_at`, und ein Aufräumlauf gibt Claims frei, die älter als die TTL sind.
Begründung: zwei Aufrufer, einer hat den Release bereits vergessen — der nächste wird es
wieder. Ein reiner Aufrufer-Fix macht den Leak unsichtbar, nicht unmöglich.

**B2 → Bereinigen und Wiederkehr ausschließen.** Migration löscht die Müllzeilen und ergänzt
einen CHECK auf `provider`: kein Backslash, kein Tab, kein Whitespace. Der Constraint ist
unabhängig davon, welcher Schreibpfad die Zeilen erzeugt hat — genau deshalb ist er den
Ballast wert.

**B3 → `cd` absichern, Testschreibzugriff auf die echte DB entfernen.**

**B4 → Port-Check vor `enable --now`, Zustandsprüfung danach.** Derselbe Check, den
`proxy:start` bereits hat. Zusätzlich verifizieren, dass die Unit `active (running)` erreicht,
statt nur die Erfolgsmeldung zu drucken — die Klasse „Erfolgsmeldung ohne Prüfung", die
T002276 bei `schtasks` schon einmal gefunden hat.

## Nicht in diesem Fix

- Die TTL-Länge ist konservativ zu wählen (Vorschlag: 30 min). Ein zu kurzer Wert gäbe Slots
  laufender Anfragen frei und höbe die Concurrency-Begrenzung faktisch auf.
- `route-provider.sh:4` (falscher `pipeline.js`-Kommentar) wird mitkorrigiert, weil er beim
  Debuggen dieses Befunds aktiv in die Irre geführt hat.
