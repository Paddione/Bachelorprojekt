# Areas → Spec-Slug Lookup

Aus `feature-intake` Schritt 1.5 extrahiert (Chore T001007). Wird vom Skill geladen, um
für ein planning-Ticket die relevanten OpenSpec-Specs zu finden.

| `areas`-Wert | Spec-Slug(s) |
|---|---|
| `brett` | `brett` |
| `website` | `website-core` |
| `chat` | `chat-inbox` |
| `infra` | `workspace-deploy` |
| `auth` | `auth-sso` |
| `ai/factory` | `software-factory` |
| `nextcloud` | `nextcloud-integration` |
| `database` | `database` |
| `billing` | `billing-pipeline` |
| `livekit` | `livekit-integration` |
| `llm` | `llm-pipeline` |
| `monitoring` | `monitoring-alerts` |
| `fleet` | `fleet-operations` |
| `ci` | `ci-cd` |
| `newsletter` | `newsletter-system` |
| `admin` | `admin-cockpit` |
| `datev` | `datev-export` |
| `mediaviewer` | `mediaviewer` |
| `grilling` | `grilling-flow` |
| `questionnaire` | `questionnaire-system` |
| `vaultwarden` | `vaultwarden-integration` |
| `collabora` | `collabora-integration` |
| `backup` | `backup-pipeline` |
| `mcp` | `mcp-gateway` |
| `portal` | `portal` |
| `sidekick` | `sidekick-assistant` |
| `planning-office` | `planning-office` |
| `sessions` | `sessions-server` |
| `secret-rotation` | `secret-rotation` |
| `ticket-system` | `ticket-system` |
| `llm-local` | `llm-local-dev` |
| `openspec` | `openspec-workflow` |

## Verwendung

Im Skill statt der inline-Tabelle:

```bash
SPEC_SLUGS=$(awk -F'|' -v area="<area-value>" \
  '$1 ~ "[[:space:]]*"area"[[:space:]]*" {gsub(/^ +| +$/,"",$2); print $2}' \
  .claude/skills/feature-intake/references/spec-slug-lookup.md | head -c -1)
```

Bei mehreren `areas`: nur die ersten 1-2 Slugs laden (Kontextbudget schonen).
