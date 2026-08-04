# Proposal: agent-capability-drift-guards

## Why

Zwei Konfigurationen schreiben einem Agenten eine Fähigkeit zu, die er nicht hat — und
beide schweigen darüber. Es gibt keinen Fehler, keine Warnung, nur eine Fähigkeit, die
nicht da ist.

**Fall 1 — `bachelorprojekt-ops` ohne MCP und Skills.** Der Agent deklariert
`tools: [Bash, Read, Glob, Grep]`. Ein `tools:`-Key ist eine Allowlist: alles
Nichtgenannte ist ausgeschlossen. Der Agent hat damit weder MCP-Tools noch Skills,
während die Routing-Tabelle in `CLAUDE.md` ihm `mcp-kubernetes` als MCP-Primär zuweist.
Er kommt an diesen Server nicht heran und fällt zwangsläufig auf `kubectl` via Bash
zurück.

Das ist Restdrift aus T002221 (PR #3279). Dort wurden die Listen von `-db`, `-infra` und
`-security` entfernt, weil sie erfundene Tool-Namen enthielten und zur leeren Menge
auflösten. Die `-ops`-Liste blieb liegen, weil ihre Namen zufällig gültig sind: der dort
angelegte Guard prüft ausschließlich „löst zu mehr als null auf" und lässt sie passieren.

Die naheliegende Gegenthese — die Verengung sei gewollter Read-only-Schutz — trägt nicht.
`Bash` steht in der Liste, also sind `kubectl delete` und `task workspace:restart` ohnehin
erreichbar. Die Liste entzieht dem Agenten die strukturierten Zugänge und lässt den
unstrukturierten übrig; sie schützt nichts.

**Fall 2 — `enabledPlugins` ohne Installationsprüfung.** Die eingecheckte
`.claude/settings.json` führt `superpowers@claude-plugins-official: true`. Das Plugin war
maschinenlokal nicht installiert und wurde deshalb nicht geladen — ohne Fehler, ohne
Warnung, ohne jedes sichtbare Signal. Aktivierung (eingecheckte Datei, Team-Wahrheit) und
Installation (`~/.claude/plugins/installed_plugins.json`, Maschinenzustand) sind getrennte
Zustände, und nichts prüft ihre Schnittmenge. Ein `true` ohne passende Installation ist
ein No-op statt eines Fehlers.

Seit der Migration auf User-Scope-Installation liegt die Aktivierung zusätzlich an zwei
Stellen — eingecheckt und in `~/.claude/settings.json` — die heute byte-identisch sind.
Zwei unabhängig editierbare Dateien mit identischem Inhalt sind kein stabiler Zustand.

## What

Beide Fälle bekommen denselben Zweischritt: den Ist-Zustand korrigieren **und** die Lücke
schließen, durch die er unbemerkt bleiben konnte.

**A — Werkzeug-Allowlist.** Der `tools:`-Key verschwindet aus
`.claude/agents/bachelorprojekt-ops.md`, sein Spiegel aus
`docs/agent-guide/registry/agents.yaml`, und `docs/agent-guide/maps/agents-map.md` wird
regeneriert. Der Guard in `tests/spec/agent-library.bats` wird von drei auf alle sechs
Domain-Agents gezogen: kein Domain-Agent führt eine `tools:`-Allowlist. Die weichere
Regel „Allowlist erlaubt, muss aber `Skill` enthalten" wird bewusst nicht gewählt — eine
handgepflegte Liste veraltet bei der nächsten MCP-Umbenennung wieder still, was die
ursprüngliche Ursache von T002221 war.

**B — Plugin-Aktivierung.** Drei Artefakte, jedes fail-closed in genau der Umgebung, über
die es etwas weiß:

- `scripts/plugin-doctor.sh` kennt `~/.claude` und meldet zwei Befunde: im Repo aktiviert
  aber nicht installiert, sowie im Repo aktiviert aber im User-Scope deaktiviert oder
  fehlend. Die Gegenrichtung — lokal mehr Plugins als das Repo aktiviert — bleibt
  absichtlich still, weil sie keinen Fähigkeitsverlust bedeutet und sonst Dauerrauschen
  erzeugt.
- Ein SessionStart-Hook ruft den Doctor und gibt Befunde als `additionalContext` aus. Er
  warnt und bricht nie ab, damit Maschinen ohne vollständige Installation weiter arbeiten.
- Ein BATS-Test prüft in CI, was ohne `~/.claude` prüfbar ist (Key-Syntax, Duplikate,
  bekannte Marketplaces) und fährt zusätzlich den Doctor gegen synthetische Fixtures.

Bewusst nicht gewählt: ein einzelner BATS-Test, der in CI skippt, wenn `~/.claude` fehlt.
Das ist der fail-open-Pfad, den `CLAUDE.md` am gitleaks-Fall bereits als Fallstrick führt.
Ein Guard, der in einer Umgebung stillschweigend durchwinkt, schützt dort nicht.

_Ticket: T002651_
