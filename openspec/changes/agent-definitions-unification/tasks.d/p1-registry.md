# p1 — Registry `agents.yaml` anlegen

Rolle: `impl`. Keine Abhängigkeit. Erstes Partial.

`target_files`: `docs/agent-guide/registry/agents.yaml` (neu).

## Aufgaben

- [ ] **P1.1 — agy empirisch verifizieren.** Die Registry braucht einen belastbaren `agy:`-Wert.
      Zwei Fragen, getrennt beantworten:

```bash
# (a) Sieht agy die Dateien? — bereits belegt, hier nur reproduzieren
readlink -f ~/.gemini/config/agents          # erwartet: .../Bachelorprojekt/.claude/agents
ls -1 ~/.gemini/config/agents/               # erwartet: die 6 bachelorprojekt-*.md
# (b) Honoriert agy das model:-Feld?
grep -c 'agents\|model' ~/.gemini/settings.json   # aktuell: nur hooks, also 0 Treffer
```

      Frage (b) lässt sich nicht aus Konfigurationsdateien beantworten. Einen agy-Lauf starten,
      der einen der sechs Agenten adressiert, und protokollieren, ob das `model:`-Feld
      interpretiert, ignoriert oder als Fehler behandelt wird. Ergebnis als Ticketkommentar an
      T002304 hängen.

      **Wenn agy nicht startbar ist:** `unsupported` als dokumentierte Annahme eintragen und im
      Ticket festhalten, dass die Messung aussteht. Das blockiert p2 bis p4 nicht.

- [ ] **P1.2 — `roles:` befüllen.** Sechs Einträge, Werte aus dem Frontmatter der
      `.claude/agents/*.md`:

```bash
for f in .claude/agents/*.md; do
  printf "%s | model=%s | tools=%s\n" "$(basename $f .md)" \
    "$(grep -m1 '^model:' $f | sed 's/model: *//')" \
    "$(grep -m1 '^tools:' $f | sed 's/tools: *//')"
done
```

      Pro Rolle: `claude_code` (der Frontmatter-Wert), `agy` (Ergebnis aus P1.1), `opencode`
      (`null` — opencode liest `.agents/agents/` nicht). Zusätzlich das `tools:`-Feld übernehmen,
      wo vorhanden; nur `bachelorprojekt-ops` hat eins.

- [ ] **P1.3 — `runtimes:` befüllen.** Vier Einträge aus `.opencode/agent-models.jsonc`:

```bash
sed -n '/"agent"[[:space:]]*:/,$p' .opencode/agent-models.jsonc \
  | grep -E '^\s{4}"[a-z0-9_-]+"\s*:'
```

      Je Eintrag: `mode` (`primary`/`subagent`), das Modell, und ob schreibfähig. Die
      Besonderheit von `gemma-4-12b` mitnehmen: genau **ein** Server-Slot (`-np 1`), serialisiert
      über den llm-proxy, daher niemals parallel dispatchen (T002298).

- [ ] **P1.4 — Zulässige `agy`-Werte dokumentieren.** Ein Kommentarblock am Kopf der Datei hält
      fest, warum es drei Wertarten gibt: Modellname, `null` (existiert dort nicht),
      `unsupported` (Datei wird geladen, `model:`-Feld nicht honoriert). Ohne diese Erklärung
      liest die nächste Person `unsupported` als Fehler statt als Befund.

- [ ] **P1.5 — YAML-Sanity.**

```bash
node -e "import('yaml').then(y=>{const d=y.parse(require('fs').readFileSync('docs/agent-guide/registry/agents.yaml','utf8'));console.log('roles:',Object.keys(d.roles).length,'runtimes:',Object.keys(d.runtimes).length)})"
# erwartet: roles: 6  runtimes: 4
```

## Abnahmekriterien

- `agents.yaml` parst als YAML mit genau den Top-Level-Schlüsseln `roles` und `runtimes`.
- `roles` hat sechs Einträge, jeder mit allen drei Harness-Schlüsseln.
- `runtimes` hat vier Einträge mit `mode` und Modell.
- Der `agy`-Wert ist entweder gemessen oder als ausstehende Messung im Ticket vermerkt — nicht
  stillschweigend geraten.
