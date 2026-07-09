## ADDED Requirements

### Requirement: Agent-Anleitung — Harness-Badge und Harness-Filter für Tool-Karten

The system SHALL project the registry's per-tool `harness` attribute
(`claude`/`opencode`/`both`) through `emit-webapp.mjs` into
`agent-guide.generated.json`, defaulting to `both` when the field is absent, and SHALL
make it available on tool entries only (not on goal entries) in the Agent-Anleitung
search index. The system SHALL display a harness badge on a tool card only when its
harness is `claude` or `opencode` (not `both`), and SHALL provide a harness filter in
the Agent-Anleitung find bar, analogous to the existing danger-tier filter: an empty
filter set shows all cards; a non-empty filter set hides tool cards whose harness does
not match and never hides goal cards or `both`-harness tool cards.

#### Scenario: Harness landet in der generierten Webapp-Datei
- **GIVEN** ein Tool in der Registry hat `harness: opencode` gesetzt
- **WHEN** `emit-webapp.mjs` die Registry projiziert
- **THEN** enthält das entsprechende Tool-Objekt in `agent-guide.generated.json` das Feld `harness: "opencode"`

#### Scenario: Fehlendes Harness-Feld fällt auf "both" zurück
- **GIVEN** ein Tool in der Registry hat kein `harness`-Feld gesetzt
- **WHEN** `emit-webapp.mjs` die Registry projiziert
- **THEN** enthält das Tool-Objekt in `agent-guide.generated.json` `harness: "both"`

#### Scenario: Ziel-Einträge tragen kein Harness-Attribut
- **GIVEN** `buildEntries()` baut den Suchindex aus Goals und Tools
- **WHEN** ein Goal-Eintrag erzeugt wird
- **THEN** hat der Goal-Eintrag kein `harness`-Feld gesetzt (`undefined`)
- **AND** ein Tool-Eintrag mit `harness: "claude"` in der Registry hat `harness: "claude"` im Suchindex-Eintrag

#### Scenario: Harness-Badge nur bei "claude" oder "opencode" sichtbar *(E2E)*
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** eine Tool-Karte mit `harness: "opencode"` gerendert wird
- **THEN** zeigt die Karte ein sichtbares Harness-Badge mit dem Text `"opencode"`
- **AND** eine Tool-Karte mit `harness: "both"` zeigt kein Harness-Badge

#### Scenario: Harness-Filter blendet unpassende Tool-Karten aus, lässt Ziel-Karten unberührt *(E2E)*
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** der Nutzer den Harness-Filter auf `"opencode"` setzt
- **THEN** sind Tool-Karten mit `harness: "claude"` nicht mehr sichtbar
- **AND** Tool-Karten mit `harness: "opencode"` oder `harness: "both"` bleiben sichtbar
- **AND** alle Ziel-Karten bleiben sichtbar

---

### Requirement: Agent-Anleitung — Harness-bewusste Beschriftung der Init-Prompt-Sektion

The system SHALL label the copy-init-prompt section of a tool card according to the
tool's harness: `"In Claude Code einfügen"` when harness is `claude`, `"In opencode
einfügen"` when harness is `opencode`, and the harness-neutral `"Prompt einfügen"` when
harness is `both` or unset. The system SHALL NOT show the hardcoded `"In Claude Code
einfügen"` label for tools whose harness is `opencode`.

#### Scenario: opencode-Skill zeigt opencode-Label statt "In Claude Code einfügen" *(E2E)*
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** die Tool-Karte für `opencode-flow-plan` (harness `opencode`) expandiert wird
- **THEN** zeigt die Init-Prompt-Sektion den Beschriftungstext `"In opencode einfügen"`
- **AND** zeigt NICHT den Text `"In Claude Code einfügen"`

#### Scenario: Claude-Skill behält bestehende Beschriftung *(E2E)*
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** die Tool-Karte für `dev-flow-plan` (harness `claude`) expandiert wird
- **THEN** zeigt die Init-Prompt-Sektion weiterhin den Beschriftungstext `"In Claude Code einfügen"`

#### Scenario: Harness-übergreifendes Tool zeigt harness-neutrales Label *(E2E)*
- **GIVEN** die Agent-Anleitung ist geöffnet
- **WHEN** die Tool-Karte für `agent-website` (harness `both`) expandiert wird
- **THEN** zeigt die Init-Prompt-Sektion den harness-neutralen Beschriftungstext `"Prompt einfügen"`
