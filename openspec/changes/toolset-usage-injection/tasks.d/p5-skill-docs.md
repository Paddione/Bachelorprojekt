---
title: "p5 skill-docs — toolset-curate als Kurations-Workflow, Injektion dokumentieren"
ticket_id: T002592
domains: [infra]
status: active
---

# p5 skill-docs — Skill und Dokumentation

**Besitzt ausschließlich:** `.claude/skills/toolset-curate/SKILL.md`, `CLAUDE.md`, `AGENTS.md`

**Kontrakt:** CONTRACT.md §2 (Rollen), §3 (Aufruf und Exit-Codes).

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `.claude/skills/toolset-curate/SKILL.md` | 12 | — (`.claude/` außerhalb der Scan-Universe) |
| `CLAUDE.md` | 215 | — (Repo-Wurzel, nicht unter `scan.code_roots`) |
| `AGENTS.md` | 160 | — (dito) |

Keine dieser Dateien liegt in der S1-Scan-Universe: `scan.code_roots` in
`docs/code-quality/gates.yaml` listet weder `.claude` noch die Repo-Wurzel, und
`grep -c '".claude/' docs/code-quality/repo-index.json` liefert 0. Es gibt kein Zeilenbudget.

## Aufgaben

- [ ] **`toolset-curate` zum Kurations-Workflow ausbauen.** Der Skill besteht heute aus drei
      Aufzählungspunkten und wurde nie benutzt. Er bekommt den vollständigen Ablauf:

      1. `node scripts/toolset/collect.mjs --unreviewed` — die offene Menge.
      2. Je Eintrag den Entscheidungskontext zeigen: welche Capability er berührt, welche Instanz
         dort heute `canonical` ist, und — wo `docs/agent-guide/registry/toolset.lock.yaml` einen
         Eintrag hat — die gemessene Tool-Zahl. Der SSOT-Spec verlangt genau diese drei Angaben
         („SHALL present each unreviewed instance together with the capability it overlaps and,
         where a lockfile entry exists, its measured tool count").
      3. Entscheidung erfragen: `canonical`, `allowed` oder `suppressed`.
      4. **Begründung ist Pflicht** — ohne `reason` darf kein non-canonical State geschrieben
         werden; das ist zugleich Spec-Anforderung und wird von `check.mjs` erzwungen.
      5. Bei `canonical` zusätzlich `use_when` und `roles` erfassen (Pflichtfelder nach
         CONTRACT §1) sowie optional `avoid_when`, `fallback`, `tier`, `deep_ref`.
      6. `capabilities.yaml` schreiben, dann `node scripts/toolset/sync.mjs`, dann
         `node scripts/toolset/check.mjs`.

- [ ] **Nicht-null-Exit von `check.mjs` als Kurationsfehler behandeln.** Der Skill hält
      ausdrücklich fest, dass ein roter `check.mjs`-Lauf die Kuration abbricht statt sie als
      erledigt zu melden. Ohne diesen Satz ist der wahrscheinliche Fehlerfall, dass eine
      `canonical`-Instanz ohne `use_when` geschrieben wird, der Gate anschlägt und die Ausgabe
      als Rauschen durchgewinkt wird — der Zustand wäre dann in der Registry, aber nicht
      injizierbar.

- [ ] **Abschnitt „Injektion in einen Agenten" im Skill.** Der Skill erklärt, wozu die kuratierten
      Daten dienen: den Aufruf von `scripts/toolset-context.sh <rolle>`, das Umschließen mit
      `<toolset>`-Tags, und dass eine unbekannte Rolle fail-closed abbricht. Ohne diesen Bezug
      bleibt die Kuration eine Registry-Pflege ohne sichtbaren Zweck — genau der Grund, aus dem
      der bisherige Stub nie benutzt wurde.

- [ ] **`CLAUDE.md`: Injektionsblock ergänzen.** Direkt hinter dem bestehenden Block „Before
      dispatching any agent, inject active plan context" ein Gegenstück für Werkzeuge:

```bash
context=$(bash scripts/plan-context.sh bachelorprojekt-infra --with-openspec)
[ -n "$context" ] && prompt="<active-plans>\n${context}\n</active-plans>\n\n${prompt}"

tools=$(bash scripts/toolset-context.sh bachelorprojekt-infra)
[ -n "$tools" ] && prompt="<toolset>\n${tools}\n</toolset>\n\n${prompt}"
```

      Mit dem ausdrücklichen Hinweis, dass `toolset-context.sh` bei unbekannter Rolle **abbricht**
      und sich darin von `plan-context.sh` unterscheidet — die bestehende Warnung zu
      `plan-context.sh` steht bereits als Blockquote an dieser Stelle und wird um den
      Unterschied ergänzt, nicht dupliziert.

- [ ] **`AGENTS.md`: dieselbe Ergänzung, harness-neutral.** `AGENTS.md` ist laut `CLAUDE.md` die
      Single Source of Truth der Routing-Tabelle; der Injektionspfad gehört dort in derselben
      Form hinein, damit opencode und agy ihn ebenfalls kennen. Das Skript ist reines Bash plus
      `node -e` und in allen drei Harnesses aufrufbar.

- [ ] **Registry als SSOT benennen.** In `CLAUDE.md` beim MCP-Registry-Blockquote („MCP-Registry
      ist SSOT (T002300)") einen Satz ergänzen, der die Zuständigkeiten trennt: `mcp.yaml`
      bleibt SSOT für *Erreichbarkeit* (Transport, Endpunkt), `capabilities.yaml` ist SSOT für
      *Auswahl und Nutzung*. Diese Trennung steht bereits im Spec und ist die häufigste
      Verwechslungsquelle zwischen den beiden Registries.

- [ ] **Selbstprüfung.** `bash scripts/vda.sh oracle 'toolset registry pruefen'` muss auf
      `toolset:check` zeigen, und die in `CLAUDE.md` neu eingefügten Befehle werden einmal
      wörtlich ausgeführt, um Tippfehler auszuschließen.
