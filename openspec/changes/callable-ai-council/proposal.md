# Proposal: callable-ai-council

## Why

Einzelne Agenten liefern bei offenen Architektur- und Produktfragen oft plausible, aber
einseitige Antworten. Das Repository besitzt bereits eine validierte Agenten-/Runtime-Registry
und mehrere Modellrouten, aber keinen aufrufbaren, nachvollziehbaren Beratungsprozess, der
unabhaengige Positionen, Einwaende, Bedingungen und Minderheitsmeinungen bis zu einer belastbaren
Entscheidung fuehrt. Das externe `fusion-harness` zeigt wertvolle Muster, ist jedoch Pi-spezifisch,
behandelt ACKs als Kontext-Synchronisation statt Zustimmung und wuerde eine zweite Modellliste
neben der vorhandenen Registry einfuehren.

## What

- Einen nativen `bash scripts/vda.sh council`-Aufruf einfuehren, dem der Nutzer registrierte
  Runtime-IDs als Council-Mitglieder und optionale Mandate zuweist.
- Runtime-IDs ausschliesslich ueber `docs/agent-guide/registry/agents.yaml` aufloesen; die dort
  gespiegelte Modellzuordnung bleibt durch den bestehenden Drift-Guard an die kanonische
  `.opencode/agent-models.jsonc` gebunden. Council-Konfigurationen speichern keine
  Provider-/Modellstrings.
- Ein mehrstufiges, read-only Protokoll implementieren: unabhaengige Positionen,
  Kreuzpruefung, Chair-Synthese, explizite Schlussballots und hoechstens zwei
  Revisionsrunden.
- Zustimmung von blossem Empfang trennen. Ballots lauten `ACCEPT`,
  `ACCEPT_WITH_CONDITION` oder `OBJECT` und enthalten pruefbare Gruende, Bedingungen und
  Evidenzluecken.
- Konsens nicht erzwingen: materielle Einwaende, nicht erfuellte Bedingungen,
  unzureichende Modellvielfalt oder zu wenige erfolgreiche Mitglieder ergeben
  `HUMAN_REQUIRED` beziehungsweise `INSUFFICIENT_EVIDENCE` statt eines erfundenen Siegers.
- Vollstaendige, maschinenlesbare Laufartefakte mit Provenienz, aufgeloesten Modellen,
  Duplikat-/Alias-Hinweisen, Positionen, Synthesen, Ballots und finalem Entscheidungsstatus
  erzeugen.
- Deterministische Offline-Tests fuer Registry-Aufloesung, Read-only-Dispatch,
  Zustandsmaschine, Quorum/Einwaende und VDA-Routing ergaenzen.

## Out of Scope

- Automatische Code-Aenderungen, Commits, Factory-Dispatch oder Produktivaktionen durch den
  Council.
- Eine zweite Provider-, Modell- oder Credential-Registry.
- Erzwungene Einstimmigkeit oder ein LLM-as-Judge, das Minderheitspositionen verwirft.
- Uebernahme der Pi-TUI oder des Shared-CWD-Writer-Modells aus `fusion-harness`.

_Ticket: T016501_
