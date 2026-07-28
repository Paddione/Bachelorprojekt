# Proposal: mishap-t002354

_Ticket: T002354_

## Why

Das Bundle enthielt zwei Einträge aus dem Factory-Betrieb. Die Recon hat für Mishap 2
ergeben, dass die Kern-Ursache (Livelock durch fehlenden Retry-Zähler) bereits durch
T002361 und T002389 behoben wurde — die dort implementierten Guards müssen auf
Wirksamkeit geprüft werden. Zwei Begleitlücken sind unabhängig davon offen.

**Eintrag 1 — Delta-Spec kollidiert beim Archivieren.** Bestätigt. Die Plan-Phase
hat die SSOT direkt editiert UND ein Delta geschrieben; das Merge-Skript findet das
Requirement dann doppelt. Fix: keine Code-Änderung nötig — die Plan-Konvention muss
nur klarstellen, dass die SSOT tabu ist. Nebenbefund: `devflow-post-merge-deploy.sh`
meldet "Bitte manuell deployen" für reine Spec-/Tooling-Änderungen ohne Deploy-Pfad,
obwohl gar kein Deploy nötig ist.

**Eintrag 2 — Dry-Run-First-Guard + Watchdog Livelock.** T002361 (Attempt-Zähler +
unfactory) und T002389 (INFRA/MODEL-Distinktion) sind gemergt. Die Recon an
`scripts/factory/watchdog.sh` bestätigt: der Counter zählt aufeinanderfolgende stale
Runden, nach MAX_ATTEMPTS=3 geht das Ticket auf `blocked + needs_human +
factory_excluded=true`. Die Kernschleife ist damit terminiert. Zwei Lücken bleiben:
(1) **Preflight fehlt** — `wakeup.sh` prüft nur Docker/K8s-Sandbox, nicht die
LLM-Proxy-Erreichbarkeit (`ANTHROPIC_BASE_URL`). Ein toter Proxy startet trotzdem
headless Sessions, die sofort sterben, bevor sie Phase-Events schreiben können — das
verbraucht INFRA-Attempts und belastet den Proxy beim Neustart zusätzlich.
(2) **Watchdog-Kommentare sind nicht dedupliziert** — sieben identische Kommentare
an T002282 waren das sichtbarste Signal des Livelocks. Der Watchdog schreibt auch
nach T002361 noch einen Kommentar pro Runde. Ein deduplizierender oder zählender
Kommentar würde den nächsten Livelock früher erkennen lassen.

## What

1. **Plan-Konvention dokumentieren.** Die AGENTS.md und ggf. opencode-flow-plan SKILL.md
   stellen klar: Die Plan-Phase editiert NIEMALS die SSOT (`openspec/specs/*.md`).
   Nur Delta-Dateien in `openspec/changes/<slug>/specs/` werden geschrieben.
2. **devflow-post-merge-deploy.sh verbessern.** Für Changes ohne Deploy-Trigger
   (reine Specs/Tests/Scripts) die Ausgabe unterscheiden: "Kein Deploy nötig" statt
   "Bitte manuell deployen".
3. **Preflight-Guard für LLM-Proxy.** `wakeup.sh` prüft vor dem ersten Dispatch, ob
   `ANTHROPIC_BASE_URL` gesetzt und erreichbar ist. Ist der Proxy down, wird der Tick
   abgebrochen (mit Meldung), statt Sessions ins Leere zu starten.
4. **Watchdog-Kommentare deduplizieren.** Der Watchdog merkt sich den letzten
   Kommentar-Body pro Ticket (z.B. in `factory_control` key
   `watchdog_last_comment:<ticket>`) und überspringt den Kommentar, wenn der Text
   identisch ist. Ein "N-tes Mal" Zusatz informiert trotzdem.
