# p2 — Loader und Validator erweitern

Rolle: `impl`. `depends_on: p1`.

`target_files`: `scripts/agent-guide/load.mjs` (Ist 43, Budget 457),
`scripts/agent-guide/validate.mjs` (Ist 145, Budget 355).

Hintergrund: `load.mjs` ist der einzige YAML-Parse-Pfad der Registry — alle Emitter hängen daran
(`emit-maps.mjs`, `emit-webapp.mjs`, `emit-docs`). Eine Registry-Datei, die `load.mjs` nicht
kennt, ist für jeden Emitter unsichtbar.

## Aufgaben

- [ ] **P2.1 — `agents` in die Dateiliste aufnehmen.** `load.mjs` Zeile 7 führt die geladenen
      Registry-Dateien:

```bash
grep -n "const FILES" scripts/agent-guide/load.mjs
# aktuell: const FILES = ['taxonomy', 'guardrails', 'tools', 'goals', 'components'];
```

      `'agents'` ergänzen und die `_registry`-Initialisierung (Zeile 10) mitziehen.

      **Achtung — Strukturbruch:** Die fünf bestehenden Dateien liefern jeweils eine **Liste**;
      `_registry` initialisiert sie entsprechend als `[]`. `agents.yaml` liefert ein **Objekt**
      mit `roles`/`runtimes`. Der Loader darf es nicht als Array behandeln, sonst laufen die
      `.find()`-Helfer ins Leere. Entweder als Objekt durchreichen oder beim Laden in zwei
      Listen normalisieren — die Entscheidung im Code kommentieren, damit der nächste Leser den
      Sonderfall nicht für einen Fehler hält.

- [ ] **P2.2 — Zugriffs-Helfer.** Analog zu `toolById` / `guardrailById` je einen Helfer für
      Rollen und Runtimes ergänzen, damit `emit-maps.mjs` in p3 nicht selbst in die Rohstruktur
      greifen muss.

- [ ] **P2.3 — Validierung in `validate.mjs`.** Prüfen und bei Verstoß fehlschlagen:
      - `roles` und `runtimes` existieren und sind nicht leer;
      - jede Rolle hat alle drei Harness-Schlüssel (`claude_code`, `agy`, `opencode`);
      - jeder Harness-Wert ist ein nicht-leerer String, `null` oder exakt `unsupported`;
      - jede Runtime hat `mode` mit Wert `primary` oder `subagent`.

      Die Validierung prüft **Form**, nicht Übereinstimmung mit dem Repo — der Abgleich gegen
      die tatsächlichen Dateien ist das Drift-Gate in p4. Diese Trennung ist beabsichtigt:
      `validate.mjs` läuft auch in Umgebungen ohne vollständigen Checkout.

- [ ] **P2.4 — Bestehende Tests grün halten.**

```bash
node --test scripts/agent-guide/*.test.mjs
node scripts/agent-guide/validate.mjs
```

- [ ] **P2.5 — Drei ungeladene Registry-Dateien notieren.** `themes.yaml`, `flow.yaml` und
      `glossary.yaml` liegen in der Registry, stehen aber nicht in `FILES` und werden daher von
      keinem Emitter gelesen. Vorgefundener Zustand, **nicht** in diesem Change beheben — als
      Beobachtung an T002304 kommentieren, damit die Frage nicht verlorengeht.

## Abnahmekriterien

- `load.mjs` liefert `agents` mit `roles` und `runtimes`; der Objekt-statt-Liste-Sonderfall ist
  im Code kommentiert.
- `validate.mjs` schlägt bei einer Rolle ohne `agy`-Schlüssel und bei einem `mode` außerhalb
  `primary`/`subagent` fehl (beides negativ verifiziert, nicht nur positiv).
- `node --test scripts/agent-guide/*.test.mjs` grün.
- Beide Dateien bleiben unter 500 Zeilen.
