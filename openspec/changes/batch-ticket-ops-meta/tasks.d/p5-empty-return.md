# p5 — Empty-Return-Rule: Vorab-Check vor Modellwechsel (T003546)

_Ticket: T003541 · Partial p5 (impl) · Kind: T003546_

## Ziel

Die Empty-Return-Rule (M2/M3) erzwingt bei einem leeren finalen Task-Return einen
Modellwechsel — ohne vorher zu prüfen, ob die Arbeit vielleicht bereits vollständig
gemergt wurde. Bei T003180 war der leere Return ein False-Positive: die Arbeit war
komplett (PR #4188 gemergt, Ticket done/fixed), nur das Abschluss-Reporting wurde
vom max_tokens-Budget des Reasoning konsumiert. Der Modellwechsel wäre eine
verlorene Eskalation gewesen.

## Befund (T003546)

- Komponente: opencode task dispatch (llm-proxy) — die Empty-Return-Regel lebt in
  `.opencode/prompts/orchestrator.md` (M2/M3-Absatz) und
  `scripts/factory/opencode-exec.sh` (Dispatch-Prompt-Text).
- Der M2/M3-Flow hätte bei einem ECHTEN Leer-Return einen Modellwechsel erzwungen;
  hier war es ein False-Positive, weil der PR bereits grün gemergt war.
- Prüfweg (im Ticket benannt): remote Branch weg + PR-Status + Ticket-Status VOR
  Modellwechsel.

## Entscheidung (im Plan festgehalten)

Vor dem Modellwechsel bei leerem Return wird der tatsächliche Arbeitsstand
geprüft: (1) Remote-Branch existiert nicht mehr (`git ls-remote origin
<branch>` leer), (2) PR ist gemergt (`gh pr view --json state,mergedAt` →
MERGED), (3) Ticket ist done/fixed (`ticket.sh get --id`). Sind alle drei wahr,
ist der Leer-Return ein False-Positive: die Arbeit gilt als abgeschlossen, kein
Modellwechsel, kein erneuter Dispatch — nur das Reporting wird nachgeholt.
Nur wenn die Prüfung offene Arbeit zeigt, greift die M2/M3-Eskalation.

## Steps

1. **RED.** BATS-Test in `tests/spec/batch-ticket-ops-meta.bats` (Sammeldatei,
   wird in p6 angelegt — hier die Anforderung festhalten):
   - Der Dispatch-/Orchestrator-Text (opencode-exec.sh Prompt bzw.
     orchestrator.md) enthält die Anweisung, bei leerem Return zuerst
     git/gh/Ticket-Status zu prüfen, bevor ein Modellwechsel entschieden wird.
   - Negativpfad: Ein leerer Return OHNE gemergte Arbeit führt weiterhin zur
     M2/M3-Eskalation (kein Aufweichen der Regel für echte Failures).

2. **GREEN.**
   - `.opencode/prompts/orchestrator.md`: Empty-Return-Absatz um den
     Vorab-Check ergänzen ("prüfe zuerst remote Branch / PR-Status /
     Ticket-Status; nur bei offener Arbeit Modellwechsel").
   - `scripts/factory/opencode-exec.sh`: Dispatch-Prompt-Text (Z. ~84-86)
     synchron halten — gleiche Formulierung wie orchestrator.md, damit
     Harness-Prompt und Dispatch-Prompt nicht auseinanderlaufen.

3. **Verifikation.** Fall aus T003546: gemergte Arbeit + leerer Return →
     kein Modellwechsel, Reporting nachgeholt; ungemergte Arbeit + leerer Return
     → M2/M3 wie bisher.

## Acceptance

- Leerer Task-Return bei bereits gemergter Arbeit löst KEINEN Modellwechsel aus.
- Echte Leer-Returns (Arbeit offen) lösen weiterhin M2/M3 aus.
- Prompts in orchestrator.md und opencode-exec.sh sind konsistent.
