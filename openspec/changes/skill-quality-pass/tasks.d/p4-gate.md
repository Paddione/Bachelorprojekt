# p4 — G-AGENTIC09 verschärfen und verankern

**Rolle:** impl · **depends_on:** p1, p3

**target_files:** `scripts/health-goals-check.sh`, `.claude/lib/goals.md`

Dieses Partial läuft **zuletzt**. Es hängt an `p1`, weil das verschärfte Gate den Projekt/Vendor-
Schnitt aus `OVERVIEW.md` liest, und an `p3`, weil ein auf 250 gesetztes Gate vor den Kürzungen
sofort rot stünde.

## Zeilenbudget

`scripts/health-goals-check.sh` hat 471 Zeilen bei einem statischen `.sh`-Limit von 500 und ist
nicht gebaselined — Budget 29. Der neue Gate-Block ist rund acht Zeilen länger als der alte und
passt damit hinein. Sollte die Umsetzung mehr Platz brauchen, wird die Messlogik in eine
Hilfsfunktion am Kopf der Datei extrahiert statt das Budget zu reißen.

`.claude/lib/goals.md` ist eine Markdown-Datei und wird vom S1-Ratchet nicht erfasst.

## Task 4.1 — Gate-Zeile in `scripts/health-goals-check.sh` ersetzen

Der heutige Block auf Zeile 377 lautet sinngemäß:

```bash
row target G-AGENTIC09 "$(
  find .claude/skills -name SKILL.md -exec wc -l {} + | awk '$2!="total"&&$1>500{c++} END{print c+0}'
)" le 0 "SKILL.md >500 Zeilen"
```

Er hat drei Mängel: Er misst alle Skills einschließlich der upstream-gepflegten, sein Schwellwert
liegt weit über der Progressive-Disclosure-Grenze, und als `target` kann er eine Regression nur
protokollieren, nicht stoppen.

Ersetzen durch einen `gate`-Block, der die Vendor-Liste aus `OVERVIEW.md` liest. Der
Extraktionsbefehl ist der in `p1` eingefrorene Kontrakt und wird wortgleich übernommen:

```bash
row gate G-AGENTIC09 "$(
  vendor=$(sed -n '/<!-- vendor-skills:begin -->/,/<!-- vendor-skills:end -->/p' .claude/skills/OVERVIEW.md \
           | grep -oE '^\| `[a-z0-9/-]+`' | tr -d '|` ')
  c=0
  for f in $(git ls-files -- .claude/skills | grep '/SKILL\.md$'); do
    d=$(echo "$f" | sed 's#.claude/skills/##;s#/SKILL.md##')
    echo "$vendor" | grep -qx "$d" && continue
    [ "$(wc -l < "$f")" -gt 250 ] && c=$((c+1))
  done; echo $c
)" le 0 "Projekteigene SKILL.md >250 Zeilen"
```

Zwei Eigenschaften sind bewusst so gewählt: Die Dateiliste kommt aus `git ls-files`, damit lokal
installierte ungetrackte Skills das Gate nicht kippen — dieselbe Präzedenz, der `G-AGENTIC06`
und `G-AGENTIC07` seit T001783 folgen. Und die Zuordnung erfolgt über den Verzeichnisnamen
relativ zu `.claude/skills`, damit der zweistufige Pfad `superpowers/using-git-worktrees`
korrekt als Vendor erkannt wird.

**Fail-safe prüfen:** Wenn der Marker-Block fehlt oder umbenannt wird, ist `vendor` leer und alle
Skills gelten als projekteigen — das Gate wird dann strenger, nicht schwächer. Diese Richtung ist
beabsichtigt und wird im Kommentar über dem Block festgehalten.

**Akzeptanz:** `bash scripts/health-goals-check.sh --only=G-AGENTIC09` meldet `0` und endet mit
Exit 0.

## Task 4.2 — `G-AGENTIC08` auf Referenzdateien ausweiten

`G-AGENTIC08` grept heute mit `--include=SKILL.md` und sieht damit nur Dateien dieses Namens. Die
19 bestehenden Dateien unter `.claude/skills/references/` sind ungeprüft; `p3` verschiebt weitere
Inhalte dorthin und würde die Lücke vergrößern.

Das Include-Muster auf `*.md` erweitern, sodass alle Markdown-Dateien unter `.claude/skills`
erfasst werden. Der Lookbehind gegen Substring-Treffer bleibt unverändert — er wurde mit T001804
gegen einen konkreten Fehlalarm eingebaut.

Vor der Umstellung den Ist-Stand messen, damit eine bestehende Altlast nicht als Regression
dieses Changes erscheint:

```bash
for p in $(grep -rhoP '(?<![A-Za-z0-9_./-])scripts/[A-Za-z0-9_./-]+\.(sh|mjs|py)' \
           .claude/skills --include='*.md' | sort -u); do
  [ -f "$p" ] || echo "TOTER PFAD: $p"
done
```

Findet der Befehl tote Pfade in Dateien, die dieser Change nicht anfasst, werden sie im selben
Zug korrigiert — es sind einzeilige Pfadkorrekturen. Ist der Umfang größer als eine Handvoll,
wird die Erweiterung zurückgestellt und als eigenes Ticket erfasst, statt `p4` zu blockieren.

**Akzeptanz:** `bash scripts/health-goals-check.sh --only=G-AGENTIC08` meldet `0`.

## Task 4.3 — `.claude/lib/goals.md` nachziehen

Der Eintrag `## G-AGENTIC09 — SKILL.md > 500 Zeilen: 2 → 0` beschreibt die alte Messung, führt
den alten `find`-Befehl und trägt im Ticket-Feld den Platzhalter `TBD`, also keinen Eigentümer.

Umschreiben auf: die neue Schwelle 250, den auf projekteigene Skills eingeschränkten Scope, den
Messbefehl aus Task 4.1, die Einstufung als Gate statt Target und `T002303` als Ticket.

Ebenso den Eintrag in der Gate-Übersichtstabelle weiter unten in derselben Datei anpassen, wo
`G-AGENTIC09` heute unter den Targets geführt wird — nach der Umstellung gehört er zu den Gates.

Der Befund selbst wird in der Historie festgehalten, nicht überschrieben: dass `SKILL.md` vom
S1-Ratchet nicht erfasst wird und Skill-Bodies deshalb bis zu diesem Change gegen keinen
Widerstand wuchsen, ist die Begründung für die Verschärfung.

**Akzeptanz:** `grep -A3 'G-AGENTIC09' .claude/lib/goals.md` nennt die Schwelle 250, den
projekteigenen Scope und `T002303`; das Wort `TBD` steht nicht mehr in diesem Eintrag.

## Task 4.4 — Vollständiger Gate-Durchlauf

```bash
bash scripts/health-goals-check.sh --only=G-AGENTIC06,G-AGENTIC07,G-AGENTIC08,G-AGENTIC09,G-AGENTIC10
```

**Akzeptanz:** Alle fünf melden `0` und der Aufruf endet mit Exit 0. Ein rotes `G-AGENTIC09`
bedeutet, dass `p3` nicht vollständig ist — dann wird `p3` nachgezogen, nicht die Schwelle
gelockert.
