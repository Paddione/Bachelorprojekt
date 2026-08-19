# p2 — Bundle-Grundgerüst und CC-Hook-Bridge

**Rolle:** impl · **Ziel-Dateien:** `tools/dsh/package.json`, `tools/dsh/cordis.patch.yml`,
`tools/dsh/index.js`, `tools/dsh/README.md`

Erste Stufe der Guards: unsere bestehenden Claude-Hooks laufen unter dsh, ohne neu geschrieben zu
werden. Das Paket `@deepseek-ai/dsh-hooks-claude-code` liest eine Hook-Konfiguration und bildet
`PreToolUse` auf `tools/pre-execute` ab.

- [ ] **2.1 Bundle-Manifest.** `tools/dsh/package.json` anlegen mit `"type": "module"`,
      `"main": "index.js"` und dem Manifest-Schlüssel:

```json
"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
```

      Ein Paket ohne diesen Schlüssel installiert zwar, aktiviert aber keinen Layer und wird von
      `dsh plugin` nur mit einer Warnung erwähnt — der Fehler sieht dann wie „Plugin tut nichts"
      aus statt wie „Manifest fehlt".

- [ ] **2.2 Patch-Layer.** `tools/dsh/cordis.patch.yml` schreibt zwei Rows: die Hook-Bridge und
      den Bundle-Entry. Die Bridge bekommt `configPath` auf die Repo-Einstellungen:

```yaml
- insert:
    - id: cc-hooks
      name: dsh-hooks-claude-code
      config:
        configPath: ./.claude/settings.json
        projectDir: .
    - id: bachelorprojekt
      name: dsh-bachelorprojekt
```

- [ ] **2.3 Bundle-Entry mit Autoload.** `tools/dsh/index.js` liest `plugins/` und mountet jedes
      gefundene `*.mjs`; ein leeres oder fehlendes Verzeichnis ist kein Fehler. Grund: Die
      Patch-Datei bliebe sonst gemeinsame Schreibfläche aller Plugin-Vorgänge, und eine Row, die
      auf ein noch nicht geschriebenes Modul zeigt, verhindert den Start. Mit Autoload bootet
      jeder Zwischenstand, und p3/p4 fassen diese Datei nicht an.

- [ ] **2.4 Start belegen.** Mit dem Bundle als Patch-Overlay starten und im Protokoll bestätigen,
      dass die Bridge die Hook-Konfiguration gelesen hat. Der Befehl, der die zusammengesetzte
      Konfiguration zeigt, ist `dsh --profile web --dump-config`; darin muss die `cc-hooks`-Row
      erscheinen.

- [ ] **2.5 README.** `tools/dsh/README.md` hält fest: die getestete Harness-Version, den
      Startbefehl, und die zwei Grenzen der Bridge — nur `type: "command"`-Hooks laufen, und
      `configPath` gilt prozessweit (ein dsh je Worktree, keine Konfiguration je Sitzung).
