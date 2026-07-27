# Proposal: reaper-child-selection

## Why

Der in T002321 (PR #3397) gelieferte Reaper im `postgres`-Container des
`claude-code-mcp-monolith` wählt seine Kandidaten per Substring-Grep über die vollständige
`cmdline`. Damit trifft er drei Prozesse, von denen keiner ein Child ist: den
supergateway-Parent (PID 1, der den Suchstring in seinem `--stdio`-Argument führt), die
eigene Reaper-Subshell (sie erbt die cmdline des Parents, also das ganze Startskript) und
jeden Debug-Aufruf mit demselben String. Live belegt durch `count=2` ohne einen einzigen
MCP-Request.

Nach Ablauf der 300-s-Schwelle hätte der Reaper sich selbst beendet — das Reaping wäre
stillschweigend eingestellt, der Leak aus T002321 bestünde weiter, getarnt durch grüne
Tests — und `kill -TERM 1` an supergateway gesendet, bei vorhandenem SIGTERM-Handler also
eine Restart-Schleife alle 5 Minuten statt alle 10 Stunden erzeugt. Der Stand wurde nach
~4 Minuten per `kubectl rollout undo` zurückgerollt, bevor die Schwelle griff; er liegt
weiterhin in `main`.

Die bestehenden Tests konnten das nicht fangen: sie prüfen, **dass** die Zeichenketten
`reap` bzw. `child` im Startkommando vorkommen. Ein falsch selektierender Reaper ist für
sie von einem korrekten nicht unterscheidbar — die Testlücke ist damit Teil der Ursache,
nicht bloß ein Nebenbefund.

## What

- Die Kandidatenauswahl wird auf echte Children eingeschränkt: Match auf `argv[1]`
  (Suffix `/mcp-server-postgres`) statt Substring über die ganze `cmdline`, plus
  `ppid == 1` als Plausibilisierung und harter Ausschluss von PID 1 und der eigenen PID.
  Parent und Subshell fallen damit strukturell heraus statt als aufgezählte Sonderfälle.
- Die Auswahl wird als eigene Funktion `list_reap_candidates` geschrieben, die nur PIDs
  ausgibt und nie tötet, und liest `${PROC_ROOT:-/proc}` statt hart `/proc`. Erst diese
  Trennung von Selektion und Wirkung macht die Auswahl prüfbar.
- Eine zweite Kill-Stufe über eine Mengengrenze schließt das Burst-Loch, das die
  Live-Messung offengelegt hat: Children entstehen schubweise, eine reine Altersschwelle
  greift daher zu spät.
- Die Tests prüfen künftig die Auswahl statt ihrer Anwesenheit — Fixture-Test gegen ein
  gebautes `/proc` mit Negativ-Probe auf PID 1 und Subshell, darüber ein Smoke-Test in
  `node:20-alpine` gegen echtes procfs.

Nicht in diesem Change: die Reparatur von `kubectl apply -k k3d/default` (T002349), die
`DATABASE_URL`-Brand-Auflösung (T002278) und der Monolith-Abbau (T002311/T002312).

_Ticket: T002350_
