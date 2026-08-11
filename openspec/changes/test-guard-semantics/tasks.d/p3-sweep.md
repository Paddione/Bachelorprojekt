# p3 — Audit der 23 Dateien mit dem Positions-Muster

**Dateien:** die unten gelisteten 23 unter `tests/spec/` — disjunkt zu p1, p2 und p4.
**Deckt:** T003104 (Reichweite)

**Kein Blindsweep.** Nutzerentscheidung 2026-08-11: alle 23 pruefen, aber nur die reparieren, die
tatsaechlich eine Positions- oder Reihenfolgeaussage treffen. Bei manchen ist `head -1` schlicht
"nimm irgendeinen Treffer" und harmlos; ein pauschales Umschreiben erzeugte einen grossen Diff mit
hohem Konfliktrisiko gegen parallele PRs, ohne Erkenntnisgewinn.

- [ ] **Liste gegen den aktuellen Stand neu erheben.** Die Menge waechst: T003104 nannte 19, am
      2026-08-11 waren es 23. Vor der Arbeit neu messen, sonst wird an einer veralteten Liste
      gearbeitet:

      ```bash
      git grep -lE 'grep -n[^|]*\| *head -1' origin/main -- tests/spec/ | sort
      ```

      Stand 2026-08-11 (23 Dateien):

      ```
      active-sessions-hub/agent-lock-scope-regelwerk.bats   mishap-categorize-erden.bats
      agent-skills/worktree-mid-rebase-guard.bats           openspec-workflow.bats
      ci-cd.bats                                            openspec-workflow/half-archive-uncommitted.bats
      dev-flow-chore-ticket-ops-mishaps.bats                react-login-edit-homepage.bats
      dev-flow-plan.bats                                    repo-hygiene/signal-gaps.bats
      dev-flow-plan/red-phase-and-handoff-conventions.bats  repo-hygiene/worktree-stash-inspection.bats
      devflow-selection-archive-hardening.bats              sdlc-isolation/e3-poller.bats
      local-llm-proxy/loadout-env-property.bats             sdlc-isolation/sdlc-up-command.bats
      mcp-gateway/bge-host-routing.bats                     software-factory/catalog-eval-telemetry.bats
      software-factory/dashboard.bats                       software-factory/pipeline-and-ticket-cli.bats
      software-factory/ticket-lifecycle.bats                ticket-system.bats
      website-core.bats
      ```

- [ ] **Je Fundstelle entscheiden.** Kriterium: Trifft die Assertion eine Aussage ueber **Position
      oder Reihenfolge** (Zeilennummernvergleich, "steht unter Ueberschrift X", "kommt vor Y")?

      - **Ja** → Suche auf den relevanten Abschnitt eingrenzen (awk-Bereichsmuster oder sed-Range),
        statt die dokumentweite Suche mit `head -1` zu beschneiden.
      - **Nein** (`head -1` nimmt nur irgendeinen von mehreren gleichwertigen Treffern) → unveraendert
        lassen.

      **`dev-flow-chore-ticket-ops-mishaps.bats` traegt das Muster an 5 Stellen** — der in T003104
      beschriebene Fix ("Einschraenkung der Suche auf den Bereich ab `## 4.`") betraf offenbar nur
      eine davon. Diese Datei zuerst nehmen; sie ist der Ursprungsfall und die dichteste Fundstelle.

- [ ] **Entscheidungen protokollieren.** Am Ende des Partials eine Liste anlegen: je Datei
      `repariert` oder `bewusst gelassen — <Grund>`. Ohne dieses Protokoll liest sich ein
      unvollstaendiger Sweep spaeter wie ein vollstaendiger, und die naechste Messung faengt bei
      null an. Das ist derselbe Grund, aus dem T003104 ueberhaupt zweimal gemessen werden musste.

- [ ] **Budget je Datei pruefen.** Alle 23 liegen unter dem 800-Zeilen-Limit fuer `.bats`; die
      Aenderungen sind lokale Umformulierungen einzelner Assertions und verschieben das nicht. Sollte
      eine Datei wider Erwarten nahe an die Schwelle kommen, im Protokoll vermerken statt sie
      stillschweigend zu kuerzen.
