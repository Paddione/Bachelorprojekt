export const meta = {
  name: 'agentic-trends-radar',
  description: 'Aggregiert aktuelle Trends im agentischen Software-Engineering und bewertet sie gegen unseren SDLC (Adopt/Trial/Hold)',
  whenToUse: 'Regelmäßig (z. B. monatlich) oder auf Zuruf, um zu entscheiden, welche neuen agentischen SWE-Praktiken wir übernehmen sollten',
  phases: [
    { title: 'Sweep', detail: '5 Rechercheure mit je eigenem Suchwinkel (Vendor, Forschung, Community, OSS, Praxis)' },
    { title: 'Konsolidieren', detail: 'Dedup + Ranking auf max. 10 distinkte Trends' },
    { title: 'Bewerten', detail: 'Pro Trend: Fit gegen unseren SDLC, Verdict adopt/trial/hold/skip' },
    { title: 'Synthese', detail: 'Radar-Report mit konkreten Übernahme-Vorschlägen' },
  ],
}

// args: { date: 'YYYY-MM-DD' (Pflicht, da Date.now() im Workflow nicht verfügbar), windowMonths?: number }
const DATE = (args && args.date) || 'unbekannt'
const WINDOW = (args && args.windowMonths) || 4

// Kompakte Selbstbeschreibung unseres SDLC — Referenzrahmen für die Bewertung.
const OUR_SDLC = `
Unser SDLC (Kubernetes-Workspace-Plattform, Solo-Hauptentwickler + Agenten-Flotte):
- Spec-getrieben: OpenSpec-Change-Workflow (propose → apply → archive, Delta-Specs mergen in SSOT-Specs unter openspec/specs/), fail-closed CI-Validierung.
- Orchestrator-Skills: dev-flow-plan (Brainstorming → Spec → Plan, committed auf Branch), dev-flow-execute (Implementierung, Verify, PR, Auto-Merge), dev-flow-chore (inline). Darunter generische "superpowers"-Skills: TDD, systematic-debugging, writing-plans, verification-before-completion.
- Software Factory: Ticket-Pipeline (PostgreSQL-Ticketsystem, Phase-Events, Autopilot), die Tickets automatisiert mit lokalen LLM-Subagenten (qwen3.5-Varianten via opencode/LM Studio) abarbeitet; Quality-Gates als verify-Phase-Events; Merge = Ticket-Abschluss; DORA-Metriken inkl. Change-Failure-Rate-Gate (fix()-Commits brauchen Bug-Ticket).
- Agenten: 6 Domänen-Subagenten (website/ops/infra/test/db/security) mit Routing-Tabelle; MCP-Server für k8s, Postgres, Tickets, Factory; codebase-memory-MCP (Code-Knowledge-Graph mit Call-Tracing); generierte Agent-Routing-Karten (goals/tools/danger maps).
- Hygiene: Worktree-Pflicht für mutierende Arbeit, agent-lock-Session-Koordination, Mishap-Tracker (Fehlersammlung als Aggregat-Tickets), Task-Oracle (LLM-Routing natürlicher Sprache auf Taskfile-Kommandos), Release-Notes-Generierung per LLM.
- CI/CD: GitHub Actions, BATS + Playwright, Squash-Merge, push-basiertes Deploy auf k3s-Fleet (kein GitOps-Reconciler), nightly E2E.
- Besonderheit: Multi-Harness (Claude Code + opencode mit lokalen Modellen), lokale GPU-Inferenz, DSGVO/on-prem.
`.trim()

const TRENDS_SCHEMA = {
  type: 'object',
  required: ['trends'],
  properties: {
    trends: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'summary', 'sources', 'momentum'],
        properties: {
          name: { type: 'string', description: 'Kurzer prägnanter Trend-Name' },
          summary: { type: 'string', description: '2-4 Sätze: Was ist es, warum jetzt relevant' },
          sources: { type: 'array', items: { type: 'string' }, description: 'URLs der Belege' },
          momentum: { type: 'string', enum: ['emerging', 'accelerating', 'mainstream'], description: 'Reifegrad/Dynamik' },
        },
      },
    },
  },
}

const MERGED_SCHEMA = {
  type: 'object',
  required: ['trends'],
  properties: {
    trends: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        required: ['name', 'summary', 'sources', 'momentum', 'relevance_hint'],
        properties: {
          name: { type: 'string' },
          summary: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
          momentum: { type: 'string' },
          relevance_hint: { type: 'string', description: '1 Satz: warum potenziell relevant für unseren SDLC' },
        },
      },
    },
    dropped: { type: 'array', items: { type: 'string' }, description: 'Verworfene/gemergte Trend-Namen mit Kurzgrund' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdict', 'rationale', 'borrow_what', 'effort', 'risks'],
  properties: {
    verdict: { type: 'string', enum: ['adopt', 'trial', 'hold', 'skip'] },
    rationale: { type: 'string', description: '2-4 Sätze Begründung, explizit gegen unseren SDLC gespiegelt' },
    borrow_what: { type: 'string', description: 'Konkret: welches Element würden wir übernehmen und wo würde es andocken (welcher Skill/Workflow/Komponente)' },
    already_covered: { type: 'string', description: 'Was davon haben wir schon (ggf. unter anderem Namen)' },
    effort: { type: 'string', enum: ['S', 'M', 'L'], description: 'Grober Einführungsaufwand' },
    risks: { type: 'string', description: 'Hauptrisiken/Nebenwirkungen der Übernahme' },
  },
}

const ANGLES = [
  {
    key: 'vendor',
    prompt: `Recherchiere per Websuche die neuesten Entwicklungen (letzte ${WINDOW} Monate, heute ist ${DATE}) bei agentischen Coding-Tools der großen Anbieter: Anthropic/Claude Code (Skills, Subagenten, Hooks, Sandboxing, Cloud-Agenten), OpenAI Codex, Cursor, GitHub Copilot (Workspace/Agents), Google (Jules/Antigravity/Gemini CLI), Cognition/Devin, Amp/Sourcegraph. Fokus: neue FÄHIGKEITEN und WORKFLOW-MUSTER, die Teams in ihren SDLC einbauen (nicht Marketing). Nutze ToolSearch um WebSearch/WebFetch zu laden. Liefere max. 6 distinkte Trends mit Quellen-URLs.`,
  },
  {
    key: 'research',
    prompt: `Recherchiere per Websuche aktuelle Forschung (letzte ${WINDOW} Monate, heute ist ${DATE}) zu agentischem Software-Engineering: arXiv/HuggingFace-Papers zu Multi-Agent-Coding, SWE-bench-Fortschritten, automatischer Verifikation/Repair, Spec-basierter Generierung, Agent-Memory, Kontext-Management, LLM-as-Judge für Code-Review. Fokus: Ergebnisse, die PRAKTISCH in einen Team-SDLC übertragbar sind. Nutze ToolSearch um WebSearch/WebFetch zu laden. Liefere max. 6 distinkte Trends mit Quellen-URLs.`,
  },
  {
    key: 'community',
    prompt: `Recherchiere per Websuche den aktuellen Praktiker-Diskurs (letzte ${WINDOW} Monate, heute ist ${DATE}) zu agentischen Entwicklungs-Workflows: Hacker News, Reddit (r/ClaudeAI, r/LocalLLaMA, r/ExperiencedDevs), einschlägige Blogs/Newsletter (Simon Willison, Pragmatic Engineer u. ä.). Fokus: Welche WORKFLOW-MUSTER setzen sich bei erfahrenen Teams durch, welche gelten als gescheitert/überhypt (Anti-Patterns explizit mitnehmen). Nutze ToolSearch um WebSearch/WebFetch zu laden. Liefere max. 6 distinkte Trends mit Quellen-URLs.`,
  },
  {
    key: 'oss',
    prompt: `Recherchiere per Websuche das Open-Source-Ökosystem für agentisches Software-Engineering (letzte ${WINDOW} Monate, heute ist ${DATE}): trending GitHub-Repos, MCP-Server-Ökosystem, Agent-Harnesses/Orchestrierungs-Frameworks, Spec-driven-Dev-Tools (z. B. spec-kit, OpenSpec u. ä.), Code-Review-Bots, Agent-Memory-/Kontext-Systeme, Sandboxing. Fokus: Werkzeuge mit echter Adoption, die man in einen bestehenden SDLC integrieren kann. Nutze ToolSearch um WebSearch/WebFetch zu laden. Liefere max. 6 distinkte Trends mit Quellen-URLs.`,
  },
  {
    key: 'practices',
    prompt: `Recherchiere per Websuche, wie Engineering-Teams ihren SDLC konkret für Agenten umgebaut haben (letzte ${WINDOW} Monate, heute ist ${DATE}): Engineering-Blogs (Anthropic, Shopify, Vercel, Sentry, Faire, Block/Goose etc.), Konferenz-Talks, "agent-native repository"-Praktiken (AGENTS.md, CI-Gates für Agenten-PRs, Review-Strategien für KI-Code, parallele Agenten-Flotten, Eval-getriebene Entwicklung). Fokus: übertragbare PROZESS-Änderungen, nicht Tool-Werbung. Nutze ToolSearch um WebSearch/WebFetch zu laden. Liefere max. 6 distinkte Trends mit Quellen-URLs.`,
  },
]

phase('Sweep')
log(`Starte 5 Sweep-Agenten (Zeitfenster: letzte ${WINDOW} Monate bis ${DATE})`)
const sweeps = await parallel(ANGLES.map(a => () =>
  agent(a.prompt, { label: `sweep:${a.key}`, phase: 'Sweep', schema: TRENDS_SCHEMA })
))
const raw = sweeps.filter(Boolean).flatMap((r, i) =>
  r.trends.map(t => ({ ...t, angle: ANGLES[i] ? ANGLES[i].key : 'unknown' }))
)
log(`${raw.length} Roh-Trends aus ${sweeps.filter(Boolean).length}/5 Sweeps`)
if (raw.length === 0) return { error: 'Kein Sweep lieferte Ergebnisse — vermutlich kein Web-Zugriff in den Subagenten.' }

phase('Konsolidieren')
const merged = await agent(
  `Hier sind ${raw.length} Roh-Trends zu agentischem Software-Engineering aus 5 Suchwinkeln (vendor/research/community/oss/practices), teils überlappend:\n\n${JSON.stringify(raw, null, 2)}\n\nUnser Kontext:\n${OUR_SDLC}\n\nAufgabe: Dedupliziere und merge zu maximal 10 DISTINKTEN Trends, gerankt nach potenzieller Relevanz für unseren SDLC. Behalte pro Trend die besten Quellen-URLs (gemergt aus Duplikaten). Verwirf reine Produkt-News ohne Prozess-Implikation und Dinge, die wir offensichtlich schon vollständig haben — liste Verworfenes mit Kurzgrund unter "dropped". Anti-Patterns/gescheiterte Muster sind als eigener Trend zulässig (wertvoll als Negativ-Signal).`,
  { label: 'dedup+rank', phase: 'Konsolidieren', schema: MERGED_SCHEMA }
)
if (!merged || !merged.trends || merged.trends.length === 0) return { error: 'Konsolidierung lieferte keine Trends.', raw }
log(`${merged.trends.length} konsolidierte Trends, ${(merged.dropped || []).length} verworfen`)

phase('Bewerten')
const assessed = await parallel(merged.trends.map(t => () =>
  agent(
    `Bewerte den folgenden Trend im agentischen Software-Engineering NÜCHTERN gegen unseren konkreten SDLC. Sei skeptisch: "hold" oder "skip" sind völlig legitime Verdicts — wir wollen keine Mode-Adoption, sondern nur Dinge mit klarem Mehrwert gegenüber dem, was wir schon haben. Prüfe explizit, ob wir das Muster unter anderem Namen bereits implementiert haben.\n\nTrend: ${t.name}\nZusammenfassung: ${t.summary}\nMomentum: ${t.momentum}\nQuellen: ${(t.sources || []).join(', ')}\n\nUnser SDLC:\n${OUR_SDLC}\n\nVerdict-Skala: adopt = jetzt übernehmen, klarer Nutzen, geringer Aufwand · trial = in einem begrenzten Experiment/Ticket erproben · hold = beobachten, noch nicht reif oder Nutzen unklar · skip = passt nicht zu uns / haben wir schon / Anti-Pattern. Bei borrow_what: benenne den konkreten Andockpunkt (welcher Skill, welche Pipeline-Phase, welche Komponente).`,
    { label: `assess:${t.name.slice(0, 40)}`, phase: 'Bewerten', schema: VERDICT_SCHEMA }
  ).then(v => ({ trend: t, assessment: v }))
))
const results = assessed.filter(x => x && x.assessment)
log(`${results.length}/${merged.trends.length} Trends bewertet`)

phase('Synthese')
const report = await agent(
  `Erstelle aus diesen bewerteten Trends einen deutschsprachigen "Agentic SWE Trend-Radar"-Report (Markdown, Stand ${DATE}) für den Hauptentwickler unserer Plattform. Struktur: 1) TL;DR (3-5 Sätze), 2) Radar-Tabelle (Trend | Momentum | Verdict | Aufwand), 3) je Abschnitt pro Verdict-Kategorie (adopt zuerst) mit Begründung, konkretem Übernahme-Vorschlag inkl. Andockpunkt und Risiken, 4) "Bereits abgedeckt"-Liste (was wir schon haben — Bestätigung unseres Kurses), 5) empfohlene nächste Schritte als konkrete Ticket-Kandidaten (Titel + 1-Satz-Scope). Quellen-URLs als Links erhalten. Technische Begriffe englisch lassen. Sei konkret und entscheidungsorientiert, kein Berater-Blabla.\n\nUnser SDLC:\n${OUR_SDLC}\n\nBewertete Trends:\n${JSON.stringify(results, null, 2)}\n\nVerworfen bei Konsolidierung:\n${JSON.stringify(merged.dropped || [], null, 2)}\n\nGib NUR das Markdown-Dokument zurück.`,
  { label: 'radar-report', phase: 'Synthese' }
)

return { report, results, dropped: merged.dropped || [] }
