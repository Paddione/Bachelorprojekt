# p3 — Harness-Konfiguration und Health-Goals nachziehen

Rolle: `impl`. `depends_on: p1`. Läuft unabhängig von p2.

`target_files`: `.opencode/opencode.jsonc`, `.claude/lib/goals.md`.

Hintergrund: Die Skill-Deny-Liste in `opencode.jsonc` ist ein **viertes** Wissensduplikat
darüber, welcher Skill wo gilt — neben `.claude/skills/`, `OVERVIEW.md` und den
`Framework mapping`-Tabellen in jedem Skill. Einträge, die nach p1 ins Leere zeigen, sind
stiller Ballast: opencode denyt einen Namen, den es ohnehin nicht mehr findet.

## Aufgaben

- [ ] **P3.1 — Deny-Liste in `.opencode/opencode.jsonc` bereinigen.** Zu entfernende Einträge
      unter `permission.skill`, weil ihr Ziel nach p1 nicht mehr existiert:
      `test-driven-development`, `verification-before-completion`, `requesting-code-review`,
      `superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:executing-plans`,
      `gguf-quantization`, `llama-cpp`, `speculative-decoding`, `unsloth`, `whisper`,
      `react-bits`.

      **Bleibt stehen:** `dev-flow-plan`, `dev-flow-execute`, `dev-flow-chore`, `dev-flow-e2e`
      (Claude-Code-Skills mit nativen opencode-Äquivalenten — die Skills existieren weiter und
      sollen in opencode weiterhin geblockt sein), sowie die Domain-Spezialisten und
      `ui-ux-pro-max`, `lavish`, `references`, `codebase-memory`, `skill-creator`,
      `agent-orchestration`, `project-overview`, `find-skills`.

      Achtung — die drei `superpowers:*`-Einträge werden entfernt, weil der **Stub** fällt.
      Damit greift der Deny nicht mehr auf den gleichnamigen **Plugin**-Skill. Das ist die
      beabsichtigte Wirkung: opencode hat keine superpowers-Plugin-Installation, der Eintrag
      war ausschließlich für den projektlokalen Stub gedacht.

```bash
grep -n 'test-driven-development\|verification-before-completion\|requesting-code-review\|superpowers:\|gguf-quantization\|llama-cpp\|speculative-decoding\|unsloth\|whisper\|react-bits' \
  .opencode/opencode.jsonc
node -e 'require("fs").readFileSync(".opencode/opencode.jsonc","utf8")' && echo "Datei lesbar"
```

- [ ] **P3.2 — JSONC-Syntax verifizieren.** `opencode.jsonc` erlaubt Kommentare, ist aber
      empfindlich gegenüber verwaisten Kommas nach dem Entfernen von Zeilen. Nach der Änderung
      die Kommentare strippen und als JSON parsen:

```bash
sed -e 's://.*$::' -e '/^\s*$/d' .opencode/opencode.jsonc | jq -e . >/dev/null \
  && echo "JSONC OK" || echo "FEHLER: verwaistes Komma oder Klammerfehler"
```

- [ ] **P3.3 — `.claude/lib/goals.md`: Baseline-Notiz ergänzen.** Die Datei führt am Ende
      datierte Baseline-Updates. G-AGENTIC06 und G-AGENTIC07 ändern beide ihren Messwert durch
      diesen Change; ohne Notiz ist beim nächsten Messzyklus nicht nachvollziehbar, warum. Neuer
      Eintrag im Stil der bestehenden Zeilen, mit Ticket-Referenz T002302, der festhält: 11
      getrackte Skills entfernt, Zähler in `OVERVIEW.md` von 39 auf 28 gezogen, drei
      ML-Skill-Registrierungen entfallen.

- [ ] **P3.4 — Historische Erwähnungen nicht umschreiben.** `goals.md` nennt `unsloth`,
      `gguf-quantization` und `speculative-decoding` in **historischen** Baseline-Updates
      (2026-07-14, 2026-07-17). Diese Zeilen dokumentieren, was damals galt, und bleiben
      unverändert — ein Protokoll rückwirkend zu ändern macht es wertlos. Nur die aktuelle
      Gate-Tabelle und der neue Eintrag aus P3.3 werden angefasst.

- [ ] **P3.5 — Goal-Messung lokal gegenprüfen.** Die generierte Datei
      `website/src/lib/goals-data.generated.json` wird von `scripts/gen-goals-data.mjs` aus
      `goals.md` erzeugt und läuft in p4 über `task freshness:regenerate` mit. Hier nur die
      Messung selbst prüfen:

```bash
bash scripts/health-goals-check.sh 2>/dev/null | grep -E 'G-AGENTIC0[67]'
# erwartet: beide auf 0
```

## Abnahmekriterien

- `.opencode/opencode.jsonc` parst nach Kommentar-Strip als gültiges JSON.
- Kein Deny-Eintrag verweist auf ein nach p1 nicht mehr existierendes Skill-Verzeichnis.
- Die vier `dev-flow-*`-Deny-Einträge sind unverändert vorhanden.
- `goals.md` hat einen neuen datierten Baseline-Eintrag mit Ticket-Referenz; die historischen
  Einträge sind unverändert.
- G-AGENTIC06 und G-AGENTIC07 messen 0.
