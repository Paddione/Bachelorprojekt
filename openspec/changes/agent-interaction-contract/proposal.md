# Proposal: agent-interaction-contract

## Why

`AGENTS.md` §Status Protocol (eingeführt am 2026-08-24 mit `7a213f4a7`, T016441) verlangt von
jeder Antwort einen Footer mit zwei Feldern, die zusammen ein Gate bilden:

```
NEXT: <top-ranked next objective + why, one line>
CONF: <high|medium|low> — certainty of the NEXT pick
```

und dazu die Regel *„You override with one word."* Der Agent ermittelt also den nächsten Schritt,
formuliert ihn als Vorschlag und gibt die Kontrolle zurück — statt den Schritt auszuführen, den er
gerade selbst empfohlen hat. In der Praxis zerfällt dadurch jeder Auftrag in eine Kette von
Bestätigungsrunden: der Nutzer tippt wiederholt ein Wort, um Arbeit freizugeben, die ohnehin
unstrittig war.

Der Abschnitt ist bisher **nicht spezifiziert und nicht abgesichert**: Messung gegen den Stand
`0581141f3`:

```bash
# Der Vertrag existiert an genau einer Stelle, ohne Spec und ohne Guard.
grep -rn 'Status Protocol' AGENTS.md CLAUDE.md GEMINI.md openspec/specs/ tests/spec/
# → einziger Treffer: AGENTS.md:89
```

Deshalb konnte die Regel entstehen, ohne dass ein Requirement sie trägt, und sie kann genauso still
wieder verschwinden oder zurückkehren.

Ein Gegenstück existiert bereits und wird **nicht** dupliziert:
`.claude/lib/behaviors/escalation-protocol.md` regelt, wann ein Agent bei echter Blockade stoppt
(„blockiert ist ein Ergebnis, kein Fehler"), inklusive der Regel, die teilbare Arbeit trotzdem zu
liefern. Der neue Vertrag verweist darauf, statt die Eskalation neu zu beschreiben.

## What

`AGENTS.md` §Status Protocol wird durch §Interaction Contract ersetzt. Der neue Abschnitt trägt vier
Aussagen:

- **D1 — Footer ohne Vorschlag.** `NEXT` und `CONF` entfallen ersatzlos. `STATUS`, `RUNNING` und
  `BLOCKED` bleiben, erscheinen aber genau einmal am Ende eines abgeschlossenen Threads statt nach
  jeder Aktion.
- **D2 — Autonomiegrenze.** Ein Agent führt den erteilten Auftrag bis zu dessen eigenem Ende durch,
  einschließlich Verifikation, Commit und PR, soweit der Auftrag sie umfasst. Er zieht **kein**
  neues Ticket und beginnt keine neue Aufgabe ohne Auftrag.
- **D3 — Abschließende Stop-Liste.** Unterbrochen wird nur bei: destruktiv/irreversibel; echter
  Weggabelung ohne Default (nach der Prior-Art-Pflicht T002829); Blockade/fehlendem Kontext
  (→ `escalation-protocol.md`); Kosten über Schwelle. Alles andere ist reversibel und wird getan.
- **D4 — Frageform.** Eine Entscheidungsfrage wird tastaturwählbar gestellt: `AskUserQuestion`
  (Claude Code) bzw. `question` (opencode/agy); ohne beides nummerierte Markdown-Optionen mit der
  Empfehlung an erster Stelle. Keine Entscheidungsfrage in freier Prosa.

Verankert wird der Vertrag dreifach: der Text in `AGENTS.md` (SSOT), ein Requirement in
`openspec/specs/agent-skills.md`, ein Guard in `tests/spec/agent-skills/interaction-contract.bats`.
`CLAUDE.md` erhält eine Zeiger-Zeile, weil Claude Code `CLAUDE.md` lädt und `AGENTS.md` nur über
Verweise erreicht — ohne den Zeiger wäre der Vertrag für die Hauptschleife unsichtbar.

## Non-Goals

- Die STOPP-Punkte der `dev-flow-*`-Skills (Plan → Execute → E2E) bleiben unverändert. Sie sind
  Phasenübergaben zwischen Skills, nicht das hier gemeinte Gating nach jeder Aktion.
- `.claude/lib/behaviors/escalation-protocol.md` wird nicht umgeschrieben und bleibt SSOT der
  Eskalation.
- Die Domain-Agent-Definitionen unter `.claude/agents/` erhalten keine Kopie des Vertrags.

_Ticket: T900235_
