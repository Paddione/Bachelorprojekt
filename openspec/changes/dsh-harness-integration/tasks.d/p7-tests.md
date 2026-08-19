# p7 — Guards

**Rolle:** tests · **Ziel-Dateien:** `tests/spec/dsh-harness-integration/bundle.bats`,
`tests/spec/dsh-harness-integration/hook-bridge.bats`,
`tests/spec/dsh-harness-integration/executor.bats`,
`tests/spec/harness-workflow-split/harness-enum.bats`,
`components/website/src/data/test-inventory.json` · **hängt ab von:** p1–p6

Zuletzt geschrieben, RED zuerst ausgeführt. Die Fälle prüfen Kommando-Ausgabe und Ergebnisse,
nicht den Quelltext der Implementierung.

- [ ] **7.1 Failing-Test-Step (RED).** Die vier BATS-Dateien gegen den Scaffold-Branch laufen
      lassen. Sie MÜSSEN fehlschlagen, bevor die Implementierungs-Partials sie grün machen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dsh-harness-integration/ tests/spec/harness-workflow-split/
# expected: FAIL (rot — Bundle, Executor-Zweig und Enum-Erweiterung existieren noch nicht)
```

- [ ] **7.2 Enum-Fälle.** `harness-enum.bats` prüft über die Ausgabe des Validators: ein Eintrag
      mit `harness: dsh` validiert, einer mit `harness: all` validiert, ein ungültiger Wert wird
      mit einer Meldung abgelehnt, die `harness` nennt. Zusätzlich der Nicht-Regressions-Fall:
      **kein** bestehender `both`-Eintrag wurde auf `all` umgeschrieben.

- [ ] **7.3 Bundle-Fälle.** `bundle.bats` prüft, dass `tools/dsh/package.json` einen
      `dsh.bundle.patch` auf eine existierende Datei trägt, dass der Entry mit leerem
      `plugins/`-Verzeichnis fehlerfrei lädt, und dass **kein** Pfad unter `deepseek-harness/`
      versioniert ist — das Vendoring-Verbot ist sonst nur eine Absichtserklärung.

- [ ] **7.4 Hook-Bridge-Fall.** `hook-bridge.bats` prüft, dass jeder `PreToolUse`-Hook in
      `.claude/settings.json` `type: "command"` trägt. Ein Hook anderer Bauart würde von der
      Bridge mit einer Warnung übersprungen und liefe unter dsh still nicht mit — der Test misst
      die Hook-Typen, nicht ihre Anzahl.

- [ ] **7.5 Executor-Fälle.** `executor.bats` prüft den Zweig in `dispatcher-bridge.sh` über sein
      Verhalten: `FACTORY_EXECUTOR=dsh` erzeugt keine Unknown-Warnung, `FACTORY_EXECUTOR=nonsense`
      erzeugt sie weiterhin und wählt claude. Für `dsh-exec.sh`: ein leeres Branch-Argument endet
      mit Exit 7 ohne Prozessstart, ein fehlender oder ungebauter Klon mit Exit 2.

- [ ] **7.6 Externe Abhängigkeit in der Rotphase absichern.** Jeder Fall, der den gebauten
      Harness voraussetzt, trägt einen Verfügbarkeits-Guard, damit er in CI sauber überspringt
      statt dauerhaft rot zu stehen:

```bash
[ -d "$REPO/deepseek-harness/node_modules" ] || skip "deepseek-harness checkout not built"
```

      Vorher prüfen, ob CI die Abhängigkeit überhaupt einrichtet:
      `grep -rn 'deepseek-harness' .github/workflows/` — keine Treffer heißt, sie fehlt dort, und
      ohne Guard misst der Test die Ausstattung des Runners statt den Zustand des Codes.

- [ ] **7.7 Inventar.** `task test:inventory` laufen lassen und
      `components/website/src/data/test-inventory.json` mit committen; CI vergleicht die Datei und
      schlägt bei Abweichung fehl.

- [ ] **7.8 Abschluss (GREEN).** Dieselbe BATS-Zeile aus 7.1 läuft grün. Danach die drei
      Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
