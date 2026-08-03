## Context

Das Ticket T002454 fasst drei separate Betriebsprobleme (Mishaps) im agentischen Tooling zusammen:
1. **Verwaiste Locks in agent-lock.sh**: Falls ein Agent-Prozess abstürzt oder unsauber beendet wird, bleibt das Lock-File bestehen. Bisher gab es keine CLI-Option wie `--force` für `claim`, um solche verwaisten Locks zu übernehmen, wenn der Halter-Prozess tot ist.
2. **Kritischer Kontext (intel.json) fehlt**: Die Datei `intel.json` wird in `dev-flow-execute` als PFLICHT bezeichnet, existiert jedoch bei fast allen OpenSpec-Änderungen nicht.
3. **repo-hygiene Post-Merge fail-open**: Bei einem Ausfall der GitHub API lieferte `gh pr view` einen leeren String für `mergedAt`. Dies führte dazu, dass `git log --since=""` alle Commits ignorierte und der Guard fälschlicherweise 0 Commits meldete, wodurch der Worktree fälschlicherweise zum Löschen freigegeben wurde.

## Goals / Non-Goals

**Goals:**
- Ermöglichen einer sicheren Lock-Übernahme verwaister Locks per `agent-lock.sh claim ticket <id> --force` mit PID-Prüfung.
- Anpassung der Dokumentation in `dev-flow-execute/SKILL.md`, um `intel.json` als optionalen Kontext zu führen.
- Absichern des Post-Merge-Guards in `repo-hygiene` (bzw. den entsprechenden Hilfsskripten/Dokumenten), so dass bei leeren API-Antworten ein Fail-Closed eintritt.

**Non-Goals:**
- Grundlegende Neuentwicklung des Lock-Mechanismus.
- Erzwungene Generierung von `intel.json` für alle älteren oder einfachen Changes.

## Decisions

### 1. `agent-lock.sh` claim `--force`
- **Ansatz:** Erweiterung des `claim`-Kommandos um das Flag `--force`.
- **Logik:** Wenn `--force` angegeben ist und das Lock-File existiert, liest das Skript `owner_pid`. Falls `kill -0 "$owner_pid"` (oder `ps -p "$owner_pid"`) zeigt, dass der Prozess nicht mehr existiert, wird der Lock überschrieben. Falls er existiert, bricht das Skript mit Fehler ab.
- **Protokollierung:** Der Force-Claim wird in `.reap.log` oder den Standard-Logdateien von `agent-lock.sh` vermerkt.

### 2. `dev-flow-execute/SKILL.md` Dokumentation anpassen
- **Ansatz:** Kennzeichnung von `intel.json` als optionaler Kontext. Der Implementer soll bei Fehlen der Datei die normale Codebase-Exploration per LSP/MCP-Tools nutzen.

### 3. Post-Merge Guard Absicherung
- **Ansatz:** Überprüfung aller von `gh` bezogenen Datumsfelder/Zeitmarken auf Nicht-Leere (`[ -n "$mergedAt" ]`). Wenn sie leer sind, bricht das Skript mit Exit 1 ab.
- **Offline-Anker:** Empfehlung und Dokumentation des Offline-Ankers (`git log --grep="\[$TICKET_EXT_ID\]"`) in den entsprechenden Guides/Skripten.

## Risks / Trade-offs

- **[Risk] PID-Recycling**: Ein Prozess könnte beendet worden sein, und seine PID wurde von einem anderen, unbeteiligten Prozess übernommen.
  - **Mitigation**: Sehr unwahrscheinlich innerhalb der typischen Session-Laufzeiten und auf Entwickler-Maschinen. Zudem wird `--force` nur manuell von einem Operator/Agenten übergeben, der den Zustand kennt.
