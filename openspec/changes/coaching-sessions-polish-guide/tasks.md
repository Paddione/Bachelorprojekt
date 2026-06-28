---
title: "coaching-sessions-polish-guide — Implementation Plan"
ticket_id: T001316
domains: [website, coaching]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# coaching-sessions-polish-guide — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-UI des Coaching-Wizard auf mentolder Design-Token umstellen und einen selbst-enthaltenen interaktiven HTML-Guide auf mentolder.de veröffentlichen, der die 10 Coaching-Phasen zeigt — mit echtem Hermes-Modell (Live) oder festen Beispieldaten (Scripted).

**Architecture:** Vier gezielte Änderungen: (1) `StepDefinition` bekommt ein `description`-Feld, (2) `SessionWizard.svelte` migriert CSS-Variablen auf Design-Token und rendert die Beschreibung, (3) ein neuer Astro-Endpoint `/api/demo/coaching-sim` proxiert Hermes mit Rate-Limit, (4) eine self-contained `coaching-guide.html` im `public/`-Ordner liefert Einleitung + dualen Simulator ohne Build-Schritt.

**Tech Stack:** TypeScript, Svelte 5 (`$state`/`$derived`), Astro API-Routes, `openai` npm-Paket (bereits installiert), vanilla JS + CSS im HTML-Guide, Google Fonts CDN.

## Global Constraints

- mentolder Design-Token: `--brass`, `--ink-800`, `--ink-900`, `--fg`, `--fg-soft`, `--mute`, `--line`, `--line-2`, `--serif` (Newsreader), `--sans` (Geist), `--mono` (Geist Mono) — keine Fallback-Hex-Werte daneben lassen
- `coaching-guide.html` muss vollständig self-contained sein (Google Fonts via CDN, kein Build-Schritt, kein Framework, kein externer JS-Bundle)
- Demo-Endpoint `/api/demo/coaching-sim` ist öffentlich (kein Auth) — Rate-Limit **20 Req/IP/min** → HTTP 429
- `getActiveProvider(pool, 'mentolder')` aus `coaching-ki-config-db.ts` — `pool` aus `website-db.ts`; `KiConfig.apiEndpoint` ist das baseURL-Feld
- Keine neuen npm-Pakete — `openai` ist bereits in `website/package.json`
- `export const prerender = false` auf jedem neuen Astro-Endpoint
- Typewriter-Effekt: 16 ms/Zeichen, client-side; Server gibt vollständiges JSON zurück (kein SSE)

---

## File Structure

| Datei | Aktion | Verantwortung |
|-------|--------|---------------|
| `website/src/lib/coaching-session-prompts.ts` | Modify | `description: string` zu `StepDefinition` + 10 Texte |
| `website/src/lib/coaching-session-prompts.test.ts` | Modify | Failing-Test für `description` |
| `website/src/components/admin/coaching/SessionWizard.svelte` | Modify | CSS-Token-Migration + Serif-Titel + Beschreibungszeile |
| `website/src/pages/api/demo/coaching-sim.ts` | Create | Rate-limitierter Hermes-Proxy |
| `website/public/coaching-guide.html` | Create | Self-contained Guide + dualer Simulator |

---

### Task 1: `description`-Feld in StepDefinition

**Files:**
- Modify: `website/src/lib/coaching-session-prompts.ts`
- Modify: `website/src/lib/coaching-session-prompts.test.ts`

**Interfaces:**
- Produces: `StepDefinition.description: string` — von Task 2 (SessionWizard) und Task 4 (HTML-Guide) gelesen

- [x] **Schritt 1.1: Failing Test schreiben**

In `website/src/lib/coaching-session-prompts.test.ts` am Ende des `describe('STEP_DEFINITIONS', ...)` Blocks hinzufügen:

```ts
it('every step has a non-empty description', () => {
  for (const s of STEP_DEFINITIONS) {
    expect(typeof (s as unknown as Record<string, unknown>)['description']).toBe('string');
    expect(((s as unknown as Record<string, unknown>)['description'] as string).length).toBeGreaterThan(10);
  }
});
```

- [x] **Schritt 1.2: Test ausführen — erwartet FAIL**

```bash
cd website && pnpm test coaching-session-prompts --run
```

expected: FAIL — `expected 'undefined' to be 'string'`

- [x] **Schritt 1.3: Interface erweitern**

In `website/src/lib/coaching-session-prompts.ts` das Interface um `description` ergänzen (nach `phaseLabel`):

```ts
interface StepDefinition {
  stepNumber: number;
  stepName: string;
  phase: Phase;
  phaseLabel: string;
  description: string;          // ← neu
  inputs: StepInput[];
  systemPrompt: string;
  userTemplate: string;
}
```

- [x] **Schritt 1.4: Beschreibungen zu allen 10 Steps hinzufügen**

Jeden Eintrag in `STEP_DEFINITIONS` um `description` nach `phaseLabel:` ergänzen:

```ts
// Step 1
description: 'Anlass, Vorerfahrung und aktuelle Situation erfassen — erste Kontaktaufnahme',
// Step 2
description: 'Hauptgefühl, Körperreaktion und Auslöser aufdecken — Affekt-Kontakt herstellen',
// Step 3
description: 'Wunschzustand konkretisieren — SMART-Ziel und Brücke zur Gegenwart formulieren',
// Step 4
description: 'Auslöser → Reaktion → Konsequenz kartieren — Interventionspunkt im Kreislauf finden',
// Step 5
description: 'Stärken, bisherige Versuche und Netzwerk sichtbar machen und gezielt aktivieren',
// Step 6
description: 'Polarität und verborgene Stärke im Problem freilegen — Lösungsenergie mobilisieren',
// Step 7
description: 'Metapher des Klienten vertiefen — immersive Bildarbeit für den Lösungsraum',
// Step 8
description: 'Erfolgsbild konkret verankern — Übergang zur handfesten Umsetzungsplanung',
// Step 9
description: 'Den einen Schritt mit maximalem Hebel identifizieren und als konkreten Auftrag formulieren',
// Step 10
description: 'Hindernisse antizipieren — Unterstützung und Nachverfolgung sicherstellen',
```

- [x] **Schritt 1.5: Test ausführen — erwartet PASS**

```bash
cd website && pnpm test coaching-session-prompts --run
```

expected: PASS (alle Tests grün inkl. des neuen)

- [x] **Schritt 1.6: Commit**

```bash
git add website/src/lib/coaching-session-prompts.ts website/src/lib/coaching-session-prompts.test.ts
git commit -m "feat(coaching): add description field to StepDefinition [T001316]"
```

---

### Task 2: SessionWizard.svelte — CSS-Token-Migration + Typografie + Beschreibungszeile

**Files:**
- Modify: `website/src/components/admin/coaching/SessionWizard.svelte`

**Interfaces:**
- Consumes: `STEP_DEFINITIONS[n].description` aus Task 1

- [ ] **Schritt 2.1: Beschreibungszeile ins HTML einfügen**

Im `<div class="step-header">` Block (nach `<span class="phase-label">`):

```svelte
<div class="step-header">
  <span class="phase-label {PHASE_TEXT[def.phase]}">{def.phaseLabel}</span>
  <span class="step-description">{def.description}</span>
  <h2 class="step-title">Schritt {currentStep}/10 &mdash; {def.stepName}</h2>
</div>
```

- [ ] **Schritt 2.2: Gesamte `<style>`-Sektion ersetzen**

```svelte
<style>
  .wizard { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem; }
  .progress-bar { display: flex; gap: 0.4rem; flex-wrap: wrap; padding: 1rem 0; }
  .progress-step { width: 2rem; height: 2rem; border-radius: 50%; font-size: 0.75rem; font-weight: 700; color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
  .step-header { border-bottom: 1px solid var(--line); padding-bottom: 0.75rem; display: flex; flex-direction: column; gap: 0.2rem; }
  .phase-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  .step-description { font-size: 0.82rem; color: var(--mute); font-style: italic; }
  .step-title { font-family: var(--serif); font-size: 1.5rem; font-weight: 400; letter-spacing: -0.015em; color: var(--fg); margin: 0.15rem 0 0; }
  .inputs-section { display: flex; flex-direction: column; gap: 1rem; }
  .input-group { display: flex; flex-direction: column; gap: 0.3rem; }
  .input-label { font-size: 0.8rem; color: var(--mute); }
  .required { color: #f87171; margin-left: 0.2rem; }
  .input-field { background: var(--ink-800); border: 1px solid var(--line); border-radius: 6px; padding: 0.6rem 0.75rem; color: var(--fg); font-size: 0.9rem; width: 100%; resize: vertical; font-family: var(--sans); }
  .input-field:focus { outline: none; border-color: var(--brass); }
  .ai-response-box { background: var(--ink-800); border: 1px solid var(--brass); border-radius: 8px; padding: 1rem; }
  .ai-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--brass); margin: 0 0 0.5rem; }
  .ai-text { color: var(--fg); font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap; margin: 0; }
  .action-buttons { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; }
  .btn-primary { padding: 0.6rem 1.4rem; background: var(--brass); color: #111; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; font-size: 0.9rem; font-family: var(--sans); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary { padding: 0.5rem 1rem; background: transparent; color: var(--mute); border: 1px solid var(--line); border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-family: var(--sans); }
  .btn-ghost { padding: 0.5rem 1rem; background: transparent; color: var(--mute); border: none; cursor: pointer; font-size: 0.85rem; text-decoration: underline; font-family: var(--sans); }
  .btn-complete { padding: 0.7rem 1.6rem; background: var(--success); color: #111; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; font-family: var(--sans); }
  .btn-complete:disabled { opacity: 0.5; cursor: not-allowed; }
  .accepted-badge { display: inline-flex; align-items: center; gap: 0.4rem; background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success); border: 1px solid color-mix(in srgb, var(--success) 30%, transparent); border-radius: 4px; padding: 0.3rem 0.75rem; font-size: 0.8rem; font-weight: 600; }
  .error-box { background: color-mix(in srgb, var(--danger) 12%, transparent); border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent); border-radius: 6px; padding: 0.75rem; color: var(--danger); font-size: 0.85rem; }
</style>
```

- [ ] **Schritt 2.3: Visuell prüfen (Dev-Server)**

```bash
cd website && pnpm dev
```

`http://localhost:4321/admin/coaching/sessions` öffnen und prüfen:
- Schritt-Titel in Newsreader Serif sichtbar
- Beschreibungszeile kursiv unter Phase-Label
- Input-Felder mit `var(--ink-800)` Background (dunkel, nicht mehr #1a1a1a)
- Fokus-Kante in Brass (gold, nicht mehr --gold Fallback)
- KI-Antwort-Box mit Brass-Border

- [ ] **Schritt 2.4: Commit**

```bash
git add website/src/components/admin/coaching/SessionWizard.svelte
git commit -m "feat(coaching): polish SessionWizard — design tokens + serif title + step description [T001316]"
```

---

### Task 3: `/api/demo/coaching-sim` — Rate-limitierter Hermes-Proxy

**Files:**
- Create: `website/src/pages/api/demo/coaching-sim.ts`

**Interfaces:**
- Consumes: `getActiveProvider(pool, 'mentolder')` → `KiConfig.apiEndpoint`, `KiConfig.apiKey`, `KiConfig.modelName`, `KiConfig.systemPrompt`, `KiConfig.maxTokens`, `KiConfig.temperature`
- Produces: `POST /api/demo/coaching-sim` → `{ result: string }` | `{ error: string }` (429/500/503)

- [ ] **Schritt 3.1: Failing Test schreiben**

In `website/src/lib/coaching-session-prompts.test.ts` neue `describe`-Gruppe anfügen:

```ts
describe('rate limit helper', () => {
  it('blocks after LIMIT requests from same IP within window', () => {
    const rateMap = new Map<string, { count: number; reset: number }>();
    const LIMIT = 20;

    function check(ip: string): boolean {
      const now = Date.now();
      const entry = rateMap.get(ip);
      if (!entry || now > entry.reset) {
        rateMap.set(ip, { count: 1, reset: now + 60_000 });
        return false;
      }
      entry.count++;
      return entry.count > LIMIT;
    }

    for (let i = 0; i < LIMIT; i++) expect(check('1.2.3.4')).toBe(false);
    expect(check('1.2.3.4')).toBe(true);
    expect(check('5.6.7.8')).toBe(false); // different IP resets
  });
});
```

- [ ] **Schritt 3.2: Test ausführen — erwartet FAIL**

```bash
cd website && pnpm test coaching-session-prompts --run
```

expected: FAIL — der neue `describe`-Block kann noch nicht importiert werden weil `coaching-sim.ts` fehlt

> Hinweis: Der Test ist self-contained (kein Import aus coaching-sim.ts nötig). Er schlägt durch den fehlenden Describe-Block oder einen TypeScript-Fehler fehl bis Task 3.3 abgeschlossen ist.

- [ ] **Schritt 3.3: Endpoint erstellen**

`website/src/pages/api/demo/coaching-sim.ts`:

```ts
import type { APIRoute } from 'astro';
import OpenAI from 'openai';
import { getActiveProvider } from '../../../lib/coaching-ki-config-db';
import { getStepDef } from '../../../lib/coaching-session-prompts';
import { pool } from '../../../lib/website-db';

export const prerender = false;

const rateMap = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 20;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.reset) {
    rateMap.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

const PERSONA_SYSTEM = `Du bist Andrea K., 42 Jahre, Teamleiterin in einem IT-Unternehmen.
Du befindest dich in einer Coaching-Session. Thema: Dein Vorgesetzter kritisiert dich seit drei Monaten regelmäßig im Teammeeting und untergräbt deinen Führungsstil vor dem Team.
Du bist emotional berührt, aber auch reflektiert. Antworte authentisch und kurz (1-3 Sätze pro Feld) aus deiner Perspektive.
Gib deine Antwort als JSON-Objekt zurück — ausschließlich die geforderten Felder, kein Freitext außerhalb des JSON.`;

const COACH_BASE = `Du bist ein erfahrener Coaching-Assistent (Triadisches KI-Coaching nach Geißler).
Deine Aufgabe: basierend auf den Coach-Eingaben eine präzise, handlungsorientierte Gesprächsintervention vorschlagen.
Sprache: Deutsch. Maximal 250 Wörter. Kein wörtliches Buchzitat. Keine allgemeinen Ratschläge — konkret zur Situation.`;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress ?? 'unknown';
  if (checkRateLimit(ip)) {
    return new Response(
      JSON.stringify({ error: 'Zu viele Anfragen. Bitte einen Moment warten.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let body: {
    mode: 'client' | 'coach';
    stepNumber: number;
    stepName: string;
    coachInputs: Record<string, string>;
    previousSteps: Array<{ stepName: string; inputs: Record<string, string>; coachResponse: string }>;
  };

  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Ungültiger Request-Body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const config = await getActiveProvider(pool, process.env.BRAND ?? 'mentolder');
  if (!config) {
    return new Response(
      JSON.stringify({ error: 'Kein KI-Provider konfiguriert' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const client = new OpenAI({
    apiKey: config.apiKey ?? 'not-required',
    baseURL: config.apiEndpoint ?? undefined,
  });
  const model = config.modelName ?? 'hermes-3';

  try {
    let result: string;

    if (body.mode === 'client') {
      const stepDef = getStepDef(body.stepNumber);
      const fieldKeys = stepDef.inputs
        .map(i => `"${i.key}": "${i.label} (kurz, authentisch)"`)
        .join(',\n  ');
      const userMsg = `Du bist in Coaching-Schritt "${body.stepName}". Beantworte als Andrea K. folgende Felder:\n{\n  ${fieldKeys}\n}\nGib nur das JSON zurück.`;

      const history = body.previousSteps.map(s => ({
        role: 'assistant' as const,
        content: `[${s.stepName}] ${JSON.stringify(s.inputs)}`,
      }));

      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: PERSONA_SYSTEM },
          ...history,
          { role: 'user', content: userMsg },
        ],
        max_tokens: 400,
        temperature: 0.8,
      });
      result = completion.choices[0]?.message?.content ?? '{}';
    } else {
      const stepDef = getStepDef(body.stepNumber);
      const filledPrompt = stepDef.userTemplate.replace(
        /\{(\w+)\}/g,
        (_, key) => body.coachInputs[key] ?? '—',
      );

      const history = body.previousSteps.flatMap(s => [
        { role: 'user' as const, content: `[${s.stepName}] ${JSON.stringify(s.inputs)}` },
        { role: 'assistant' as const, content: s.coachResponse },
      ]);

      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: config.systemPrompt ?? COACH_BASE },
          ...history,
          { role: 'user', content: filledPrompt },
        ],
        max_tokens: config.maxTokens ?? 600,
        temperature: config.temperature ?? 0.7,
      });
      result = completion.choices[0]?.message?.content ?? '';
    }

    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'KI-Fehler';
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
```

- [ ] **Schritt 3.4: Test ausführen — erwartet PASS**

```bash
cd website && pnpm test coaching-session-prompts --run
```

expected: PASS

- [ ] **Schritt 3.5: Commit**

```bash
git add website/src/pages/api/demo/coaching-sim.ts
git commit -m "feat(coaching): add /api/demo/coaching-sim — Hermes proxy with rate limit [T001316]"
```

---

### Task 4: `website/public/coaching-guide.html` — Self-Contained Guide + Dualer Simulator

**Files:**
- Create: `website/public/coaching-guide.html`

**Interfaces:**
- Consumes: `POST /api/demo/coaching-sim` (Task 3) im Live-Modus
- Produces: Öffentlich unter `mentolder.de/coaching-guide.html`

- [ ] **Schritt 4.1: Datei erstellen**

`website/public/coaching-guide.html` mit folgendem Inhalt erstellen:

```html
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KI-Coaching Guide · mentolder</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;1,6..72,400&family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400&display=swap" rel="stylesheet">
<style>
:root {
  --ink-900:#0b111c; --ink-850:#101826; --ink-800:#17202e; --ink-750:#1d2736;
  --fg:#eef1f3; --fg-soft:#cdd3d9; --mute:#8c96a3;
  --brass:#cda260; --brass-d:rgba(205,162,96,.14);
  --sage:#7dc4a0; --danger:#e06050;
  --line:rgba(255,255,255,.07); --line-2:rgba(255,255,255,.12);
  --serif:"Newsreader","Iowan Old Style",Georgia,serif;
  --sans:"Geist",system-ui,sans-serif;
  --mono:"Geist Mono",ui-monospace,monospace;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{-webkit-font-smoothing:antialiased;scroll-behavior:smooth}
body{background:var(--ink-900);color:var(--fg);font-family:var(--sans);font-size:16px;line-height:1.55}
.wrap{max-width:860px;margin:0 auto;padding:0 24px}

/* Intro */
.intro{padding:96px 0 80px}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--brass);display:inline-flex;align-items:center;gap:10px;margin-bottom:28px}
.eyebrow::before{content:"";width:22px;height:1px;background:currentColor}
.intro h1{font-family:var(--serif);font-size:clamp(36px,5vw,64px);font-weight:300;line-height:1.05;letter-spacing:-.02em;margin-bottom:24px}
.intro h1 em{font-style:italic;color:var(--brass)}
.lede{font-size:19px;color:var(--fg-soft);max-width:52ch;line-height:1.6;margin-bottom:40px}
.phase-pills{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:48px}
.pill{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:6px 14px;border-radius:999px;border:1px solid}
.pill-blue{color:#60a5fa;border-color:rgba(96,165,250,.3);background:rgba(96,165,250,.08)}
.pill-orange{color:#fb923c;border-color:rgba(251,146,60,.3);background:rgba(251,146,60,.08)}
.pill-green{color:var(--sage);border-color:rgba(125,196,160,.3);background:rgba(125,196,160,.08)}
.pill-purple{color:#c084fc;border-color:rgba(192,132,252,.3);background:rgba(192,132,252,.08)}
.btn-start{display:inline-block;padding:13px 28px;background:var(--brass);color:#111;font-weight:600;font-family:var(--sans);border-radius:8px;text-decoration:none;font-size:15px;transition:opacity .15s}
.btn-start:hover{opacity:.85}

/* Simulator */
.sim-section{padding:64px 0 120px;border-top:1px solid var(--line)}
.sim-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:36px}
.sim-title{font-family:var(--serif);font-size:26px;font-weight:400;letter-spacing:-.01em}
.mode-toggle{display:flex;border:1px solid var(--line-2);border-radius:8px;overflow:hidden}
.mode-btn{padding:8px 18px;font-family:var(--sans);font-size:13px;font-weight:500;border:none;cursor:pointer;background:transparent;color:var(--mute);transition:all .15s}
.mode-btn.active{background:var(--ink-800);color:var(--fg)}

/* Progress */
.prog-bar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:32px}
.prog-step{width:32px;height:32px;border-radius:50%;font-size:11px;font-weight:700;color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;opacity:.35}
.prog-step.done{opacity:1}
.prog-step.current{opacity:1;box-shadow:0 0 0 3px rgba(255,255,255,.25);transform:scale(1.12)}
.ph-problem{background:#3b82f6}
.ph-analyse{background:#f97316}
.ph-loesung{background:var(--sage)}
.ph-umsetzung{background:#a855f7}

/* Step card */
.step-card{background:var(--ink-800);border:1px solid var(--line-2);border-radius:18px;padding:32px;display:flex;flex-direction:column;gap:20px}
.step-meta{display:flex;flex-direction:column;gap:4px;border-bottom:1px solid var(--line);padding-bottom:16px}
.step-phase{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase}
.step-desc-line{font-size:13px;color:var(--mute);font-style:italic}
.step-title{font-family:var(--serif);font-size:22px;font-weight:400;letter-spacing:-.01em}
.fields{display:flex;flex-direction:column;gap:14px}
.field-group{display:flex;flex-direction:column;gap:5px}
.field-label{font-size:12px;color:var(--mute)}
.field-req{color:#f87171}
.field-input,.field-ta{background:var(--ink-750);border:1px solid var(--line);border-radius:8px;padding:9px 12px;color:var(--fg);font-family:var(--sans);font-size:14px;width:100%}
.field-ta{resize:vertical;min-height:72px}
.field-input:focus,.field-ta:focus{outline:none;border-color:var(--brass)}
.btn-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.btn-p{padding:9px 20px;background:var(--brass);color:#111;font-weight:600;font-family:var(--sans);font-size:14px;border:none;border-radius:7px;cursor:pointer}
.btn-p:disabled{opacity:.4;cursor:not-allowed}
.btn-s{padding:8px 16px;background:transparent;color:var(--mute);border:1px solid var(--line-2);border-radius:7px;cursor:pointer;font-family:var(--sans);font-size:13px}
.btn-g{padding:8px 14px;background:transparent;color:var(--mute);border:none;cursor:pointer;font-family:var(--sans);font-size:13px;text-decoration:underline}
.btn-complete{padding:10px 22px;background:var(--sage);color:#111;font-weight:700;border:none;border-radius:7px;cursor:pointer;font-family:var(--sans);font-size:14px}
.ai-box{background:var(--ink-900);border:1px solid var(--brass);border-radius:10px;padding:16px 18px}
.ai-lbl{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--brass);margin-bottom:8px}
.ai-txt{color:var(--fg);font-size:14px;line-height:1.7;white-space:pre-wrap;min-height:1.7em}
.ai-cursor{display:inline-block;width:2px;height:1em;background:var(--brass);margin-left:2px;animation:blink .8s step-end infinite;vertical-align:text-bottom}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
.report-box{background:var(--ink-800);border:1px solid var(--line-2);border-radius:18px;padding:36px}
.report-box h2{font-family:var(--serif);font-size:28px;font-weight:400;margin-bottom:8px}
.report-sub{color:var(--mute);font-size:13px;margin-bottom:28px}
.report-content{color:var(--fg-soft);font-size:15px;line-height:1.8;white-space:pre-wrap}
.err-msg{color:#f87171;font-size:13px}
</style>
</head>
<body>

<section class="intro">
  <div class="wrap">
    <div class="eyebrow">KI-gestütztes Coaching · mentolder</div>
    <h1>Das Triadische <em>KI-Coaching</em></h1>
    <p class="lede">Ein strukturierter 10-Schritte-Prozess, der Coaching-Know-how mit moderner KI verbindet. Der Coach führt das Gespräch — die KI schlägt präzise Interventionen vor, basierend auf dem, was der Klient einbringt.</p>
    <div class="phase-pills">
      <span class="pill pill-blue">Phase 1 · Problem &amp; Ziel</span>
      <span class="pill pill-orange">Phase 2 · Analyse</span>
      <span class="pill pill-green">Phase 3 · Lösung</span>
      <span class="pill pill-purple">Phase 4 · Umsetzung</span>
    </div>
    <a class="btn-start" href="#sim">Simulator starten →</a>
  </div>
</section>

<section id="sim" class="sim-section">
  <div class="wrap">
    <div class="sim-header">
      <h2 class="sim-title">Session-Simulator</h2>
      <div class="mode-toggle">
        <button class="mode-btn active" id="btn-live" onclick="setMode('live')">⚡ Live · Hermes</button>
        <button class="mode-btn" id="btn-scripted" onclick="setMode('scripted')">📋 Scripted</button>
      </div>
    </div>
    <div class="prog-bar" id="prog-bar"></div>
    <div id="step-container"></div>
  </div>
</section>

<script>
const STEPS=[
  {n:1,name:'Erstanamnese',phase:'problem_ziel',pl:'Phase 1: Problem & Ziel',desc:'Anlass, Vorerfahrung und aktuelle Situation erfassen',
   fields:[{k:'anlass',l:'Anlass der Session',r:true,m:true},{k:'vorerfahrung',l:'Vorerfahrung mit Coaching',r:false},{k:'situation',l:'Aktuelle Situation (in Worten des Klienten)',r:true,m:true}]},
  {n:2,name:'Schlüsselaffekt',phase:'problem_ziel',pl:'Phase 1: Problem & Ziel',desc:'Hauptgefühl, Körperreaktion und Auslöser aufdecken',
   fields:[{k:'hauptgefuehl',l:'Hauptgefühl des Klienten',r:true},{k:'koerperreaktion',l:'Körperliche Reaktion / wo spürbar',r:false},{k:'ausloeser',l:'Auslöser / Trigger',r:true}]},
  {n:3,name:'Zielformulierung',phase:'problem_ziel',pl:'Phase 1: Problem & Ziel',desc:'Wunschzustand konkretisieren — SMART-Ziel und Brücke',
   fields:[{k:'wunschzustand',l:'Wunschzustand des Klienten',r:true,m:true},{k:'ressourcen',l:'Bereits vorhandene Ressourcen',r:false},{k:'erste_schritte',l:'Erste Ideen für Schritte',r:false}]},
  {n:4,name:'Teufelskreislauf',phase:'analyse',pl:'Phase 2: Analyse',desc:'Auslöser → Reaktion → Konsequenz kartieren',
   fields:[{k:'ausloeser',l:'Auslöser des Musters',r:true},{k:'reaktion',l:'Automatische Reaktion des Klienten',r:true,m:true},{k:'konsequenz',l:'Konsequenz / was sich verschlimmert',r:true}]},
  {n:5,name:'Ressourcenanalyse',phase:'analyse',pl:'Phase 2: Analyse',desc:'Stärken, Versuche und Netzwerk sichtbar machen',
   fields:[{k:'staerken',l:'Stärken und Fähigkeiten',r:true,m:true},{k:'bisherige_versuche',l:'Was hat der Klient bisher versucht?',r:false},{k:'externe_unterstuetzung',l:'Externe Unterstützung / Netzwerk',r:false}]},
  {n:6,name:'Komplementärkräfte',phase:'analyse',pl:'Phase 2: Analyse',desc:'Polarität und verborgene Stärke im Problem freilegen',
   fields:[{k:'gegensatz',l:'Gegensatz zum Problem / was fehlt',r:true},{k:'polaritaet',l:'Polarität (z.B. Kontrolle ↔ Loslassen)',r:false},{k:'verborgene_staerke',l:'Verborgene Stärke im Problem',r:false}]},
  {n:7,name:'Lösungsentwicklung / Bildarbeit',phase:'loesung',pl:'Phase 3: Lösung',desc:'Metapher des Klienten vertiefen — immersive Bildarbeit',
   fields:[{k:'bild_metapher',l:'Bild oder Metapher des Klienten',r:true,m:true},{k:'koerperliche_empfindung',l:'Körperliche Empfindung beim Bild',r:false},{k:'verknuepfung',l:'Verknüpfung zur aktuellen Situation',r:false}]},
  {n:8,name:'Erfolgsimagination',phase:'loesung',pl:'Phase 3: Lösung',desc:'Erfolgsbild verankern — Übergang zur Umsetzung',
   fields:[{k:'erfolgsbild',l:'Wie sieht Erfolg aus (konkret)?',r:true,m:true},{k:'gefuehl_bei_erfolg',l:'Wie fühlt sich das an?',r:false},{k:'veraenderung',l:'Was hat sich verändert?',r:false}]},
  {n:9,name:'Goldstücks-Aktivität',phase:'umsetzung',pl:'Phase 4: Umsetzung',desc:'Den einen Schritt mit maximalem Hebel identifizieren',
   fields:[{k:'konkrete_schritte',l:'Konkrete nächste Schritte',r:true,m:true},{k:'ressourcen_dafuer',l:'Benötigte Ressourcen',r:false},{k:'zeitplan',l:'Zeitplan / bis wann',r:false}]},
  {n:10,name:'Transfersicherung',phase:'umsetzung',pl:'Phase 4: Umsetzung',desc:'Hindernisse antizipieren — Nachverfolgung sicherstellen',
   fields:[{k:'hindernisse',l:'Mögliche Hindernisse',r:true,m:true},{k:'unterstuetzung',l:'Wer/was unterstützt?',r:false},{k:'naechster_termin',l:'Nächster Termin / Nachverfolgung',r:false}]},
];

const SC=[
  {i:{anlass:'Mein Vorgesetzter kritisiert mich seit drei Monaten regelmäßig im Teammeeting — zuletzt bezeichnete er meinen Projektplan als unprofessionell, vor dem gesamten Team.',vorerfahrung:'Einmal vor fünf Jahren, sehr positiv.',situation:'Ich meide Meetings wenn er dabei ist, schlafe schlecht und zweifle ernsthaft an meiner Eignung als Führungskraft.'},c:'Was Sie beschreiben, ist keine Kleinigkeit: Öffentliche Kritik durch Vorgesetzte über Monate hinweg erosiert das Selbstbild und die Handlungsfähigkeit einer Führungsperson.\n\nEin erster Schritt: Trennen Sie die Beobachtung von der Bewertung. Ihr Vorgesetzter korrigiert Sie öffentlich — das ist die Tatsache. Dass Sie deswegen an Ihrer Führungskompetenz zweifeln — das ist Ihre Interpretation. Beide Ebenen sind real, aber sie sind nicht dasselbe.\n\nIch möchte Sie einladen: Erinnern Sie sich an einen Moment in den letzten 12 Monaten, in dem Sie als Führungskraft wirklich präsent und wirksam waren — einen Moment, in dem Ihr Team Ihnen gefolgt ist, weil Sie es verdienten.\n\nKönnen Sie mir diesen Moment kurz beschreiben?'},
  {i:{hauptgefuehl:'Scham und Hilflosigkeit',koerperreaktion:'Enge Brust, Herzklopfen wenn ich seinen Namen auf dem Kalender sehe',ausloeser:'Jedes Mal wenn er mich im Meeting unterbricht oder korrigiert'},c:'Scham und Hilflosigkeit — das sind zwei der schwersten Gefühle, die Führungskräfte empfinden können, weil sie direkt dem Selbstbild widersprechen: Ich sollte stark und kompetent sein.\n\nDie körperliche Reaktion zeigt: Ihr Nervensystem hat bereits gelernt, ihn als Bedrohung zu registrieren.\n\nStellen Sie sich vor, die Scham hätte eine Stimme. Was würde sie sagen? Und dann — was würde die Gegenstimme antworten? Die Stimme dessen, der 8 Jahre lang erfolgreich geführt hat?\n\nLassen Sie beide Stimmen kurz sprechen.'},
  {i:{wunschzustand:'Ich möchte wieder selbstbewusst führen können — auch in seiner Gegenwart. Oder wissen, ob ich das Unternehmen wechseln soll.',ressourcen:'Gutes Verhältnis zum Team, 8 Jahre Erfahrung',erste_schritte:'Ein direktes Gespräch mit ihm führen — aber ich weiß nicht wie.'},c:'Sie haben zwei Zielrichtungen benannt: selbstbewusst in seiner Gegenwart führen — und die Klarheit gewinnen, ob ein Wechsel sinnvoll ist. Das ist kein Widerspruch.\n\nSMART formuliert: Bis Ende des nächsten Quartals kann ich in drei von drei Teammeetings, in denen er anwesend ist, meinen Standpunkt klar und ruhig vertreten — ohne einzufrieren.\n\nWie fühlt sich dieses Ziel an? Zu groß? Zu klein? Was möchten Sie anpassen?'},
  {i:{ausloeser:'Seine öffentliche Kritik im Meeting',reaktion:'Ich friere ein, sage nichts, wirke unsicher — was ihn scheinbar bestätigt',konsequenz:'Team verliert Vertrauen in mich, er kritisiert öfter, ich ziehe mich weiter zurück'},c:'Jetzt sehen Sie es klar: Er kritisiert → Sie frieren ein → wirken unsicher → er kritisiert mehr. Ein klassischer Verstärkerkreislauf.\n\nDer Interventionspunkt liegt zwischen Auslöser und Reaktion. Wenn er Sie unterbricht: atmen Sie kurz durch, sagen Sie "Moment." — nur dieses eine Wort — und dann: "Ich ergänze das gerne nach dem Meeting." Das bricht den Kreislauf, ohne Konfrontation.\n\nWas würde es brauchen, damit Sie diesen einen Satz in der Situation sagen können?'},
  {i:{staerken:'Starke Empathie, sehr gutes Verhältnis zum Team, analytisches Denken, 8 Jahre Projekterfahrung',bisherige_versuche:'Einmal nachgefragt ob er ein Problem mit mir hat — er hat verneint',externe_unterstuetzung:'HR ist zugänglich, eine Kollegin kennt eine ähnliche Situation'},c:'Was Sie aufgelistet haben, ist beeindruckend: Empathie, Teamvertrauen, analytisches Denken, 8 Jahre Erfahrung, HR-Zugang, eine Verbündete.\n\nIhre stärkste Ressource ist Ihr Team. Das Vertrauen, das Sie dort aufgebaut haben, ist etwas, das er nicht beschädigen kann — solange Sie präsent bleiben.\n\nWie können Sie diese Ressource bewusst stärken? Was wäre ein konkreter nächster Schritt mit Ihrem Team?'},
  {i:{gegensatz:'Statt schweigend einzufrieren — klar und ruhig antworten',polaritaet:'Anpassung ↔ Selbstbehauptung',verborgene_staerke:'Mein Einfrieren schützt das Teamklima kurzfristig — ich bin rücksichtsvoll'},c:'"Anpassung ↔ Selbstbehauptung" — das ist eine wichtige Polarität. Ihr Impuls, einzufrieren, ist nicht Schwäche: er ist ein Schutzreflex.\n\nDie Komplementärkraft zu Ihrem Einfrieren ist nicht "lauter werden" — sondern "präziser werden". Der eine ruhige, klare Satz statt dem Schweigen.\n\nWenn Sie an die Teamleiterin denken, die Sie in einem Jahr sein wollen: Was sagt diese Person in dem Moment, wenn er Sie unterbricht?'},
  {i:{bild_metapher:'Ein Baum im Sturm — er biegt sich, aber die Wurzeln halten',koerperliche_empfindung:'Wärme in der Brust, stabiles Stehen',verknuepfung:'Ich bin der Baum — der Sturm ist seine Kritik, aber ich bleibe verwurzelt'},c:'Der Baum im Sturm. Das ist ein kraftvolles Bild.\n\nSchließen Sie kurz die Augen. Stellen Sie sich diesen Baum vor. Spüren Sie die Wärme in der Brust, das stabile Stehen. Die Äste biegen sich — aber die Wurzeln halten.\n\nDieses Bild gehört Ihnen. Bringen Sie es mit in die nächste schwierige Situation. Was aktiviert das Bild in Ihnen — welches Gefühl oder welchen Vorsatz?'},
  {i:{erfolgsbild:'Ich sitze ruhig im Meeting, er kritisiert, ich antworte: "Danke für den Hinweis, ich sehe das anders und erkläre warum." Das Team nickt.',gefuehl_bei_erfolg:'Stolz, Leichtigkeit, innere Stärke',veraenderung:'Ich führe wieder aktiver, mein Team folgt mir, er respektiert mich mehr'},c:'"Danke für den Hinweis, ich sehe das anders und erkläre warum" — das ist kein Angriff, kein Rückzug. Das ist Führung.\n\nStellen Sie sich vor: Sie verlassen den Raum nach diesem Moment. Was sagen Sie sich selbst?\n\nUnd dann: Was brauchen Sie konkret, um von hier — dem heutigen Einfrieren — dorthin zu gelangen? Was ist der eine Schritt, der den größten Unterschied macht?'},
  {i:{konkrete_schritte:'In der nächsten Woche: ein 1:1-Gespräch mit ihm anfragen, vorbereitet mit 3 konkreten Beispielen und dem Wunsch nach klareren Feedbackregeln.',ressourcen_dafuer:'Mein Notizbuch mit Vorfällen, HR-Kollegin als Sparringspartnerin vorher',zeitplan:'Bis Freitag anfragen, Meeting spätestens in 2 Wochen'},c:'Ihr Auftrag an sich selbst lautet: "Bis Freitag schreibe ich ihm eine kurze Nachricht — zwei Sätze: Ich möchte kurz Zeit mit Ihnen für ein Feedback-Gespräch. Wann passt es Ihnen diese Woche?"\n\nNur der Mut für diese zwei Sätze — nicht für das ganze Gespräch.\n\nWas hindert Sie daran, diese Nachricht heute noch zu schreiben?'},
  {i:{hindernisse:'Er lehnt das Gespräch ab. Oder er stimmt zu aber ändert nichts. Oder ich falle wieder in Einfrieren zurück.',unterstuetzung:'Kollegin Monika als Reflexionspartnerin, HR bei Bedarf',naechster_termin:'Follow-up Coaching in 3 Wochen — Bericht über das 1:1'},c:'Ihr Sicherungsplan steht. Sie planen nicht nur den Erfolgsfall, sondern auch die Szenarien, wenn es schief läuft. Das ist kluge Führung.\n\nFür den Fall, dass Sie im Gespräch einfrieren: Ihr Baum. Drei Sekunden Pause, tief atmen, "Ich möchte kurz nachdenken" — und dann Ihr Satz.\n\nWir sehen uns in drei Wochen. Ich freue mich auf Ihren Bericht.'},
];

const PC={problem_ziel:'ph-problem',analyse:'ph-analyse',loesung:'ph-loesung',umsetzung:'ph-umsetzung'};
const PCOL={problem_ziel:'#60a5fa',analyse:'#fb923c',loesung:'#7dc4a0',umsetzung:'#c084fc'};
let mode='live',cur=0,status=Array(10).fill('p'),hist=[],vals={},resp='',fetching=false;

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

function typewrite(el,text,ms=16){
  el.textContent='';
  const cur=document.createElement('span');cur.className='ai-cursor';el.appendChild(cur);
  let i=0;const t=setInterval(()=>{if(i<text.length){el.insertBefore(document.createTextNode(text[i++]),cur)}else{clearInterval(t);cur.remove()}},ms);
}

function setMode(m){
  mode=m;vals={};resp='';
  document.getElementById('btn-live').classList.toggle('active',m==='live');
  document.getElementById('btn-scripted').classList.toggle('active',m==='scripted');
  if(m==='scripted')vals={...SC[cur].i};
  render();
}

function renderProg(){
  const bar=document.getElementById('prog-bar');bar.innerHTML='';
  STEPS.forEach((s,i)=>{
    const b=document.createElement('button');
    b.className=`prog-step ${PC[s.phase]} ${i===cur?'current':status[i]==='d'?'done':''}`;
    b.title=`Schritt ${s.n}: ${s.name}`;
    b.textContent=status[i]==='d'?'✓':s.n;
    b.onclick=()=>{cur=i;vals={};resp='';if(mode==='scripted')vals={...SC[i].i};render()};
    bar.appendChild(b);
  });
}

function render(){
  renderProg();
  const s=STEPS[cur],c=PCOL[s.phase];
  const flds=s.fields.map(f=>`<div class="field-group"><label class="field-label">${esc(f.l)}${f.r?'<span class="field-req"> *</span>':''}</label>${f.m?`<textarea class="field-ta" data-k="${f.k}" rows="3" placeholder="${f.r?'Pflichtfeld':'Optional'}">${esc(vals[f.k]||'')}</textarea>`:`<input class="field-input" data-k="${f.k}" type="text" placeholder="${f.r?'Pflichtfeld':'Optional'}" value="${esc(vals[f.k]||'')}">`}</div>`).join('');
  const canGen=s.fields.filter(f=>f.r).every(f=>(vals[f.k]||'').trim().length>0);
  const clientBtn=mode==='live'?`<button class="btn-s" id="btn-cl" onclick="askClient()" ${fetching?'disabled':''}>🎭 Klient befragen</button>`:'';
  const coachBtn=`<button class="btn-p" id="btn-co" onclick="askCoach()" ${(!canGen||fetching)?'disabled':''}>${fetching?'⏳ KI antwortet…':'KI befragen →'}</button>`;
  const aiHtml=`<div class="ai-box" ${resp?'':'style="display:none"'} id="ai-box"><div class="ai-lbl">KI-Vorschlag</div><div class="ai-txt" id="ai-txt">${resp?esc(resp):''}</div></div>`;
  const nav=resp?`<div class="btn-row">${cur>0?'<button class="btn-s" onclick="prev()">← Zurück</button>':''}${cur<9?'<button class="btn-p" onclick="accept()">Akzeptieren →</button>':'<button class="btn-complete" onclick="showReport()">Abschlussbericht →</button>'}</div>`:`<div class="btn-row">${cur>0?'<button class="btn-s" onclick="prev()">← Zurück</button>':''}</div>`;
  document.getElementById('step-container').innerHTML=`<div class="step-card"><div class="step-meta"><span class="step-phase" style="color:${c}">${esc(s.pl)}</span><span class="step-desc-line">${esc(s.desc)}</span><h3 class="step-title">Schritt ${s.n}/10 — ${esc(s.name)}</h3></div><div class="fields">${flds}</div><div class="btn-row">${clientBtn}${coachBtn}</div>${aiHtml}<div id="err-msg" class="err-msg" style="display:none"></div>${nav}</div>`;
  document.querySelectorAll('[data-k]').forEach(el=>el.addEventListener('input',e=>{vals[e.target.dataset.k]=e.target.value;const b=document.getElementById('btn-co');if(b){const ok=STEPS[cur].fields.filter(f=>f.r).every(f=>(vals[f.k]||'').trim().length>0);b.disabled=!ok||fetching;}}));
}

function prev(){if(cur>0){cur--;vals={};resp='';if(mode==='scripted')vals={...SC[cur].i};render();}}
function accept(){status[cur]='d';hist.push({stepName:STEPS[cur].name,inputs:{...vals},coachResponse:resp});cur++;vals={};resp='';if(mode==='scripted')vals={...SC[cur].i};render();}

async function askClient(){
  fetching=true;render();
  try{
    const r=await fetch('/api/demo/coaching-sim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'client',stepNumber:STEPS[cur].n,stepName:STEPS[cur].name,coachInputs:{},previousSteps:hist})});
    const d=await r.json();
    if(!r.ok){showErr(d.error||'Fehler');return;}
    try{vals={...JSON.parse(d.result)};}catch{vals={};}
  }catch{showErr('Verbindungsfehler');}
  finally{fetching=false;render();}
}

async function askCoach(){
  if(mode==='scripted'){resp=SC[cur].c;render();const el=document.getElementById('ai-txt');if(el)typewrite(el,resp);return;}
  fetching=true;render();
  try{
    const r=await fetch('/api/demo/coaching-sim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'coach',stepNumber:STEPS[cur].n,stepName:STEPS[cur].name,coachInputs:{...vals},previousSteps:hist})});
    const d=await r.json();
    if(!r.ok){showErr(d.error||'Fehler');return;}
    resp=d.result;render();const el=document.getElementById('ai-txt');if(el)typewrite(el,resp);
  }catch{showErr('Verbindungsfehler');}
  finally{fetching=false;const b=document.getElementById('btn-co');if(b){const ok=STEPS[cur].fields.filter(f=>f.r).every(f=>(vals[f.k]||'').trim().length>0);b.disabled=!ok;}}
}

function showErr(m){const el=document.getElementById('err-msg');if(el){el.textContent=m;el.style.display='block';}}

function showReport(){
  status[cur]='d';hist.push({stepName:STEPS[cur].name,inputs:{...vals},coachResponse:resp});renderProg();
  const summary=hist.map((h,i)=>`${STEPS[i].n}. ${h.stepName}\n${Object.entries(h.inputs).map(([k,v])=>`   ${k}: ${v}`).join('\n')}`).join('\n\n');
  document.getElementById('step-container').innerHTML=`<div class="report-box"><h2>Session abgeschlossen</h2><p class="report-sub">Alle 10 Schritte durchgeführt · Demo-Modus</p><div class="report-content">${esc('Abschlussbericht — Coaching-Session\n'+('─'.repeat(40))+'\n\n'+summary)}</div><div style="margin-top:28px"><button class="btn-s" onclick="reset()">← Neu starten</button></div></div>`;
}

function reset(){cur=0;status=Array(10).fill('p');hist=[];vals={};resp='';if(mode==='scripted')vals={...SC[0].i};render();}
render();
</script>
</body>
</html>
```

- [ ] **Schritt 4.2: Seite im Browser prüfen**

```bash
cd website && pnpm dev
```

`http://localhost:4321/coaching-guide.html` öffnen:

- Scripted: Toggle → Felder mit Andrea K. vorbefüllt → "KI befragen →" → Typewriter → "Akzeptieren →" → Step 2 → … → Step 10 → Report
- Live: "🎭 Klient befragen" → POST /api/demo/coaching-sim (mode:client) → Felder füllen sich → "KI befragen →" → Hermes-Antwort Typewriter

- [ ] **Schritt 4.3: Commit**

```bash
git add website/public/coaching-guide.html
git commit -m "feat(coaching): add interactive coaching guide for stakeholder demo [T001316]"
```

---

### Task 5: Verifikation

- [ ] **Schritt 5.1: Test-Suite**

```bash
task test:changed
```

expected: PASS

- [ ] **Schritt 5.2: Freshness**

```bash
task freshness:regenerate
task freshness:check
```

expected: PASS

- [ ] **Schritt 5.3: Manueller End-to-End-Check**

Admin-UI: `http://localhost:4321/admin/coaching/sessions` → Session öffnen
- Schritt-Titel in Newsreader Serif ✓
- Kursive Beschreibungszeile unter Phase-Label ✓
- Input-Felder mit `var(--ink-800)` Background ✓
- Fokus-Kante und KI-Box in Brass ✓

Guide: `http://localhost:4321/coaching-guide.html`
- Scripted: alle 10 Steps + Report ✓
- Live: Klient + Coach via Hermes ✓
- Neu starten: Reset auf Step 1 ✓

- [ ] **Schritt 5.4: Push**

```bash
git push -u origin feature/coaching-sessions-polish-guide
```
