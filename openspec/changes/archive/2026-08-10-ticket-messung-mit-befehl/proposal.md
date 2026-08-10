# Proposal: ticket-messung-mit-befehl

## Why

T002700 stellte einen Vorgang **nicht** zurück, weil er zu klein gewesen wäre, sondern weil eine
Messung ihn zu teuer erscheinen ließ: „rund 23 lebende Dateien". Bei der späteren Umsetzung ergab
die Nachmessung 149 lebende Vorkommen in 63 Dateien — Faktor ~2,6. Eine Entscheidung, etwas *nicht*
zu tun, ruhte damit auf einer Zahl, die niemand nachrechnen konnte.

### Symptom vs. Ursache (T002448-M5)

**Beobachtetes Symptom (Fakt, am Artefakt geprüft):** Die Beschreibung von T002700 (via
`ticket-mcp get_ticket T002700`) enthält den Block
`MESSUNG (2026-08-08, Fixed-String, ohne node_modules/.git/.opencode)` samt Trefferliste pro Datei.
Genannt sind damit Datum, Match-Modus und Ausschlussverzeichnisse — **nicht genannt ist das
Suchmuster** und damit auch nicht der ausführbare Befehl.

**Verifizierte Ursache (nicht die Formulierung des Tickets):** Das Ticket behauptet, es habe „weder
Suchmethode noch Ausschlussfilter" genannt. Das stimmt so nicht — beides steht dort. Fehlend und
allein ausschlaggebend ist das **Suchmuster**. Belegt durch Rekonstruktion gegen den Stand
unmittelbar vor dem Move (`6a6d4c302`, Elternteil des Move-Commits `a0b175cfb`):

```bash
PRE=6a6d4c302c1afcb4a12a6c0b7c2401505f5fd602
# (A) Suche nach den 15 konkreten Dateinamen, Archiv/Plans ausgenommen
git grep -F -l -e 'Taskfile.llm.yml' -e 'Taskfile.openclaw.yml' … "$PRE" \
  -- . ':!openspec/changes/archive' ':!docs/superpowers/plans' ':!Taskfile.yml' | wc -l   # → 66
# (B) generisches Fixed-String-Muster 'Taskfile.'
git grep -F -l 'Taskfile.' "$PRE" -- . ':!openspec/changes/archive' ':!docs/superpowers/plans' | wc -l   # → 216
```

Dieselben dokumentierten Randbedingungen (Fixed-String, dieselben Ausschlüsse) liefern je nach
Muster 66 oder 216 Dateien. **Keine** der beiden Rekonstruktionen kommt auf die im Ticket genannten
19 bzw. „rund 23" Dateien. Die Zahl ist also nicht bloß falsch, sie ist aus dem Ticket heraus
**nicht rekonstruierbar** — genau das ist die Ursache, und sie liegt im Fehlen des Befehls, nicht in
einem Denkfehler beim Zählen.

**Folgenlos im Ergebnis, relevant im Verfahren:** Alle Nachzügler waren Kommentare, und weil das
`Taskfile.`-Präfix erhalten blieb, blieben Namensnennungen gültig. Der Schaden liegt nicht im
Resultat von T002700, sondern darin, dass ein Ticket, das ausdrücklich „damit die Analyse nicht
wiederholt werden muss" geschrieben wurde, die Wiederholung unmöglich machte.

## What

Eine **redaktionelle Konvention** in `CLAUDE.md`: Wer eine Messung als Entscheidungsgrundlage in ein
Ticket schreibt, notiert den ausführbaren Befehl mit, der sie erzeugt hat. Ohne ihn ist die Zahl
kein Beleg, sondern eine Behauptung, und der Zweck des Festhaltens ist verfehlt.

### Warum kein Laufzeit-Guard

Die naheliegende Automatisierung — „prüfe beim Ticket-Anlegen, ob die Zahl reproduzierbar ist" —
ist nicht entscheidbar:

1. **Die Prüffrage ist nicht maschinell beantwortbar.** „Ist diese Zahl reproduzierbar?" verlangt,
   den Befehl gegen den Repo-Stand *zum Messzeitpunkt* auszuführen. Genau diesen Stand hat ein
   Guard beim späteren Lesen nicht mehr; T002700 belegt es: der Move ist inzwischen erfolgt, die
   ursprüngliche Messung lässt sich nur noch über einen explizit benannten Commit nachstellen.
2. **Ein Schlüsselwort-Guard hätte den realen Fall durchgelassen.** Eine Heuristik der Form
   „Beschreibung enthält `MESSUNG` ⇒ muss einen Code-Fence enthalten" scheitert an T002700 in beide
   Richtungen: der Text trug bereits Methoden-Metadaten und hätte eine naive Prüfung bestanden,
   und umgekehrt genügt es, das Wort wegzulassen, um sie zu umgehen. Ein fail-closed Guard über
   Freitext-Beschreibungen blockiert legitime Tickets, ohne den gemeldeten Fall zu fangen.
3. **CLAUDE.md kennt diese Kategorie ausdrücklich.** Der Deliverable-Check (M10, T002506) steht dort
   mit dem Zusatz „Redaktioneller Hinweis, kein automatisierter Guard". Diese Konvention gehört in
   dieselbe Klasse.

Automatisierbar ist genau eine Aussage: **dass die Regel im Repo steht**. Dafür entsteht ein
Dokumentations-Konventions-Guard unter `tests/spec/agent-skills/`, der die Existenz und die
inhaltlichen Kernbestandteile des Abschnitts in `CLAUDE.md` prüft — Drift-Schutz für den Text, kein
Nachweis seiner Befolgung. `grep` auf den Quelltext ist hier das laut CLAUDE.md
(„Test-Resultats-Konvention", Ausnahmeklausel für Dokumentationskonventionen) richtige Mittel; der
Prüfmodus wird im Datei-Header vermerkt.

### Verankerungsort und Kollisionsabgrenzung

Die Konvention geht als **neuer Abschnitt an das Ende von `CLAUDE.md`**, direkt hinter
`### Bug-Triage-Konvention (CFR-Gate G-DORA03)` (aktuell letzte Zeile 246). Begründung: CLAUDE.md
wird in jede Session geladen, `docs/superpowers/references/gotchas-footguns.md` nur auf Anforderung
— eine Regel, die im Moment des Ticket-Schreibens greifen muss, braucht den geladenen Ort. Zudem
steht sie dort neben ihren beiden Geschwistern derselben Klasse (Bug-Triage-Konvention, M10).

Kein Skill wird angefasst: Zurückstellungs-Entscheidungen haben im Repo keine dokumentierte
Prozedur (`grep -rn -iE 'zurückstell|deferral' .claude/skills/` findet nur die unverwandte
Fortsetzungs-Semantik in `dev-flow-execute`). Eine Prozedur zu erfinden, um eine Regel daran zu
hängen, wäre größerer Eingriff als der Befund rechtfertigt.

**Abgrenzung zu T002813:** Jenes Ticket erweitert die M10-Regel (Deliverable-Check) auf den
Archive-Pfad und berührt damit `CLAUDE.md` Zeile 98 im Abschnitt
`### Domain conventions: Merge = Abschluss (T001092)` (Zeilen 94–100). Dieser Change fasst
ausschließlich den Bereich **hinter Zeile 246** an. Die beiden Änderungen sind disjunkt.

_Ticket: T002717_
