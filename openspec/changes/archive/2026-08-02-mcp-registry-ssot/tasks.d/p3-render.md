# p3 — Erstes Rendern und Divergenz-Auflösung

Rolle: `impl`. `depends_on: p2`.

`target_files`: `.mcp.json`, `.opencode/opencode.jsonc`.

Dies ist der Schritt, in dem sich zeigt, ob die Registry aus p1 die Realität trifft. Ein
nicht-leerer Diff ist hier **kein Fehler, sondern das Ergebnis** — er benennt exakt die Drift,
deretwegen dieser Change existiert.

## Aufgaben

- [ ] **P3.1 — Ausgangsstand sichern.** Vor dem ersten `render` die Ist-Dateien festhalten, um
      den Diff nachher erklären zu können:

```bash
cp .mcp.json /tmp/mcp-before.json
cp .opencode/opencode.jsonc /tmp/opencode-before.jsonc
```

- [ ] **P3.2 — Erstes `render`.**

```bash
bash scripts/mcp-sync.sh render
git diff --stat .mcp.json .opencode/opencode.jsonc
```

- [ ] **P3.3 — Jeden Diff-Hunk einzeln erklären.** Für jede Abweichung entscheiden, ob sie
      erwünscht ist:
      - **Formatierung** (Einrückung, Schlüsselreihenfolge) → akzeptieren, das ist der Preis der
        Generierung.
      - **Inhaltlich** (ein Server fehlt, ein Kommando weicht ab) → das ist die aufgedeckte
        Drift. Entscheiden, welche Seite recht hat, und **die Registry** korrigieren, nicht die
        Ausgabe. Die Registry ist ab jetzt die Quelle; eine Ausgabe von Hand nachzubessern würde
        den Change im selben Moment entwerten, in dem er entsteht.
      - Jede inhaltliche Auflösung als Ticketkommentar an T002300 dokumentieren.

```bash
git diff .mcp.json
git diff .opencode/opencode.jsonc
```

- [ ] **P3.4 — Kommentar-Erhalt verifizieren.** Die Begründungen an den deaktivierten Servern
      müssen die Generierung überlebt haben:

```bash
diff <(grep -o '//.*' /tmp/opencode-before.jsonc | sort) \
     <(grep -o '//.*' .opencode/opencode.jsonc | sort)
# erwartet: kein Unterschied
```

- [ ] **P3.5 — Nicht-`mcp`-Teile unangetastet.** `opencode.jsonc` enthält neben `mcp` auch
      `model`, `permission` (inklusive der Skill-Deny-Liste), `lsp` und `provider`. Der Renderer
      darf davon nichts anfassen:

```bash
sed -n '/"mcp"[[:space:]]*:/q;p' /tmp/opencode-before.jsonc > /tmp/head-before.txt
sed -n '/"mcp"[[:space:]]*:/q;p' .opencode/opencode.jsonc     > /tmp/head-after.txt
diff /tmp/head-before.txt /tmp/head-after.txt   # erwartet: kein Unterschied
```

- [ ] **P3.6 — Idempotenz auf echten Daten.** Nach dem Auflösen aller Divergenzen darf ein
      zweiter Lauf keinen Diff mehr erzeugen:

```bash
git add .mcp.json .opencode/opencode.jsonc
bash scripts/mcp-sync.sh render
git diff --exit-code .mcp.json .opencode/opencode.jsonc
```

- [ ] **P3.7 — Die MCP-Server müssen danach noch funktionieren.** Ein syntaktisch gültiger
      Renderer, der einen Endpunkt falsch übersetzt, fällt erst in der nächsten Session auf:

```bash
for p in 18080 13001 13003; do
  printf "  :%s -> " "$p"
  timeout 3 bash -c "echo > /dev/tcp/127.0.0.1/$p" 2>/dev/null && echo "offen" || echo "ZU"
done
timeout 30 claude mcp list 2>&1 | grep -E 'mcp-kubernetes|mcp-postgres|factory-mcp|ticket-mcp'
```

      Läuft der Port-forward gerade nicht, ist ein geschlossener Port kein Renderer-Fehler —
      dann zuerst `task agents:mcp-gateway:start` bzw. die systemd-Unit prüfen.

- [ ] **P3.8 — agy-Ziel lokal rendern und gegenprüfen.** Die Datei wird nicht committet, ihr
      Inhalt muss aber stimmen:

```bash
jq -r '.mcpServers | keys[]' ~/.gemini/config/mcp_config.json | sort
```

## Abnahmekriterien

- Jeder inhaltliche Diff-Hunk ist erklärt und aufgelöst; die Auflösung steht in der Registry,
  nicht in der gerenderten Datei.
- Alle Kommentare in `.opencode/opencode.jsonc` sind erhalten.
- Alles vor dem `mcp`-Block in `opencode.jsonc` ist byteidentisch zum Ausgangsstand.
- Ein zweiter `render`-Lauf erzeugt keinen Diff.
- Die drei HTTP-Endpunkte antworten weiterhin bzw. ihre Nichterreichbarkeit ist als
  Port-forward-Zustand erklärt, nicht als Renderer-Fehler.
