---
page: sdlc
ticket: T900660
status: complete
actions:
  - tickets-list
  - triage-show
  - readiness-show
  - deps-show
  - plan-open
  - exec-status
  - verify-gates
  - close-check
  - process-docs
---

## Voraussetzungen

- Neovim mit der Dashboard-Foundation (T900655) sowie dem SDLC-Kapitelmodul (T900660 p1) und der registrierten SDLC-Seite (T900660 p2).
- `scripts/ticket.sh`, `git` und `task` sind im Repository verfuegbar (die Aktionen rufen sie als Unterprozesse mit Argumentlisten auf, nie ueber eine Shell).
- Der aktuelle Buffer liegt innerhalb eines Git-Repository: Alle Aktionen loesen ihr Arbeitsverzeichnis zur Ausfuehrungszeit ueber `config.gitroot.root()` auf (nil-Guard: ohne Repository erscheint eine Warnung, keine Aktion startet).
- Die Ticket-Aktionen brauchen eine Ticketnummer im aktuellen Branch-Namen (`T` + mindestens sechs Ziffern, z. B. `feature/nvim-sdlc-T900660`); ohne Treffer erscheint eine Warnung.
- Die dokumentierten Prozesse liegen als Skills im Repository:
    - `.agents/skills/ticket-triage/SKILL.md`
    - `.agents/skills/ticket-dispatch/SKILL.md`
    - `.agents/skills/dev-flow-plan/SKILL.md`
    - `.agents/skills/dev-flow-execute/SKILL.md`
- Kein Netzwerk zur Laufzeit noetig; kein neues Plugin (nur eingebaute Buffer-APIs plus die CLIs oben).

## Geordnete Schritte

1. **tickets-list**: Oeffnen Sie die Seite (Dashboard: `<leader>h`, Kapitel "SDLC"). Der Fokus auf der Zeile hat keine Nebenwirkung (focus-versus-execute: erst die Enter-Taste bzw. die gezeigte Taste fuehrt die Aktion aus). Druecken Sie `t`. Die Aktion zeigt die 20 neuesten Tickets (`ticket.sh list --limit 20`) in einem Scratch-Buffer (`buftype=nofile`, schreibgeschuetzt). Es ist keine Ticketnummer im Branch noetig.

2. **triage-show**: Druecken Sie `g` (erst fokussieren, dann Taste druecken). Die Aktion liest das Ticket aus dem Branch-Namen, zeigt dessen Triage-Felder (Typ, Schwere, Prioritaet, Status) im Scratch-Buffer und nennt darunter das manuelle Folgekommando als kopierbare Zeile (`scripts/ticket.sh triage --id <T> --type <t> --severity <s> --priority <p>`). Der Triage-Entscheid selbst bleibt manuell und wird nie ausgefuehrt.

3. **readiness-show**: Druecken Sie `r`. Die Aktion zeigt Readiness- und Plan-Metadaten des Branch-Tickets (Status, `plan_ref`, Aufwand, Bereiche, Abhaengigkeiten, Rang, Nutzen) im Scratch-Buffer. Reine Anzeige; Plan-Metadaten aendern Sie ausserhalb des Dashboards.

4. **deps-show**: Druecken Sie `d`. Die Aktion zeigt die Abhaengigkeitslinks des Branch-Tickets (`ticket.sh get-ticket-links --id <T>`: blockiert, blockiert-von, verwandt, Kind-von) im Scratch-Buffer.

5. **plan-open**: Druecken Sie `p`. Die Aktion parst `plan_ref` aus dem Ticketdatensatz und oeffnet die referenzierte Plandatei per `:edit` (Pfad mit `fnameescape` maskiert), wenn sie unter dem Git-Root existiert. Fehlt der Verweis oder die Datei, erscheint eine Warnung mit dem erwarteten Pfad.

6. **exec-status**: Druecken Sie `x`. Die Aktion zeigt die Verknuepfung der Arbeitseinheit im Scratch-Buffer: `git status --short --branch`, `git worktree list`, die `touched_files` des Tickets und dessen Links (`plan_ref`, Ticket-Links). Alles lesend; es wird nichts geaendert.

7. **verify-gates**: Druecken Sie `v`. Die Aktion zeigt den statischen Gate-Block im Scratch-Buffer (`task test:changed`, `task freshness:regenerate`, `task freshness:check`, `bash scripts/plan-lint.sh .agents/plans/<slug>/tasks.md`). Die Befehle werden angezeigt, nie ausgefuehrt — fuehren Sie sie im Terminal aus.

8. **close-check**: Druecken Sie `c`. Die Aktion zeigt den Live-Status des Branch-Tickets plus die statische Merge-ist-Abschluss-Checkliste (gruene CI, Squash-Merge nach `main`, Ticket schliesst per Auto-Merge als `done/shipped`, Prod-Deploy entkoppelt). Reine Anzeige; der Abschluss geschieht per Merge.

9. **process-docs**: Druecken Sie `s`. Die Aktion prueft die vier Skill-Dateien aus den Voraussetzungen auf Existenz, oeffnet den ersten Treffer per `:edit` und haengt die restlichen per `:badd` an. Fehlende Dateien werden gemeldet, nicht angelegt.

Fokus-versus-Ausfuehrung: Das Navigieren auf der Seite (Cursor bewegen) fuehrt **keine** Aktion aus; erst Enter bzw. der Buchstabe der jeweiligen Zeile startet die Aktion. Alle neun Aktionen sind lesend — mutierende Folgeschritte erscheinen nur als kopierbare Kommandos.

## Erwartetes Ergebnis

- Die Seite "SDLC" zeigt genau neun Aktionen in dieser Reihenfolge: `tickets-list`, `triage-show`, `readiness-show`, `deps-show`, `plan-open`, `exec-status`, `verify-gates`, `close-check`, `process-docs`.
- Jede Anzeigeaktion oeffnet einen Scratch-Buffer (`filetype=sdlc`, `buftype=nofile`, schreibgeschuetzt) mit dem gelesenen Stand; `plan-open` und `process-docs` oeffnen stattdessen existierende Dateien.
- Die Ticketnummer kommt immer aus dem aktuellen Branch-Namen, der Git-Root immer aus dem aktuellen Buffer (Ausfuehrungszeit-Aufloesung).
- Produktionswirksame Schritte (Triage-Entscheid, Statuswechsel, Deploy) bleiben manuell: Sie erscheinen nur als kopierbare Kommandos und werden nie vom Dashboard ausgefuehrt.
- Headless-Start des Moduls (`require('config.sdlc')`) endet mit Exit-Code 0 und definiert genau die neun Aktionsfunktionen.
- Es werden keine `BufWritePre`-Autocommands angelegt — keine Formatierung beim Speichern.

## Troubleshooting

- **Aktion startet nicht / Warnung "no project"**: Der Buffer liegt ausserhalb eines Git-Repository (oder ist ein Scratch-Buffer ohne Dateinamen). In einen Datei-Buffer innerhalb eines Repository wechseln; `git rev-parse --show-toplevel` im Buffer pruefen.
- **Warnung "no ticket id in branch name"**: Der aktuelle Branch enthaelt keine Ticketnummer (`T` + sechs Ziffern). Auf einen Ticket-Branch wechseln oder `tickets-list` nutzen (braucht keine Nummer).
- **"ticket get failed" / "ticket list failed"**: `scripts/ticket.sh` fehlt unter dem Git-Root (fremdes Repository) oder der Aufruf schlug fehl. Im Bachelorprojekt-Repository arbeiten; den Befehl im Terminal wiederholen und `:messages` lesen.
- **Warnung "hat kein plan_ref" / "Plan-Datei fehlt"**: Das Ticket hat keinen verknuepften Plan oder die Datei existiert nicht (mehr). Erwarteten Pfad aus der Warnung pruefen; ggf. Planung anstossen.
- **"fehlende Prozessdoku"**: Eine oder mehrere der vier Skill-Dateien existieren nicht unter dem Git-Root. Die Meldung nennt die fehlenden Pfade; im Haupt-Repository sind alle vier vorhanden.
- **Leere Ticketliste**: `(leere Liste oder unerwartete Ausgabe)` bedeutet keine Treffer oder ein unerwartetes Ausgabeformat. `scripts/ticket.sh list --limit 20` im Terminal vergleichen.

## Recovery

- Die Aktionen schreiben keine Dateien und setzen keine dauerhaften Zustaende: Es gibt nichts Persistentes zurueckzurollen. Scratch-Buffer sind fluechtig (`:bdelete` schliesst sie).
- Seite entfernen = p1-Modul plus p2-Registrierung entfernen: `dotfiles/nvim/lua/config/sdlc.lua` loeschen und den `['sdlc']`-Block in `dotfiles/nvim/lua/config/dashboard.lua` entfernen (der Auto-Stub uebernimmt wieder).
- Konfiguration komplett zuruecksetzen: `mv ~/.config/nvim ~/.config/nvim.tmp && mv ~/.config/nvim.old-<datum> ~/.config/nvim` (falls ein alter Stand existiert) und Neovim neu starten.

## Quellen

- Stand 2026-09-28. Abgleich der wiederverwendeten Prozessformulierungen gegen die Skill-Quellen (`grep -rn -i` ueber die vier Skill-Verzeichnisse): ticket-triage 0 Treffer, ticket-dispatch 0 Treffer, dev-flow-plan 3 Treffer, dev-flow-execute 3 Treffer. Die Fundstellen in den dev-flow-Skills betreffen das Proposal-System; das Kapitel verwendet unabhaengig davon ausschliesslich Ticket/SDLC-Begriffe (Triage, Readiness, Abhaengigkeiten, Planung, Umsetzung, Verifikation, Abschluss) und weist kein Proposal-Kommando und keinen Proposal-Pfad an.
- Verifizierter Befehlssatz (live am Worktree-Stand geprueft): `ticket.sh get|list|get-ticket-links --id <T>`, `git status|worktree list|log|branch --show-current|rev-parse`, `task test:changed|freshness:regenerate|freshness:check|test:inventory`, `bash scripts/plan-lint.sh`.
