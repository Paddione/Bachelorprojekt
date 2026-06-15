# VideoVault-Migration Phase 2d — Mediaviewer-Companion-Panel im Workspace-Portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das in Phase 2a deployte, statische Mediaviewer-Widget (`mediaviewer.{domain}/embed.html`) als Companion-Panel in einen neuen Tab des bestehenden **PortalSidekick-Drawers** der Workspace-Shell (`website/`) einbetten — per `<iframe>` + postMessage-Bridge, gespeist aus einem versionierten Hilfsvideo-Manifest, für beide Brands.

**Architecture:** Die Widget-Seite der postMessage-Bridge existiert bereits aus 2a (`mediaviewer-widget/src/embed/bridge.ts`). Phase 2d baut die **Host-Seite**: eine pure, testbare Bridge-Hilfe (`website/src/lib/mediaviewer-bridge.ts`, spiegelt das Protokoll), ein versioniertes Hilfsvideo-Manifest (`website/src/data/help-videos.json` + Zod-validierter Loader), und eine schlanke Svelte-Komponente (`MediaviewerPanel.svelte`), die den `<iframe>` rendert, beim Laden `setVideos` postet und ausgehende Events (`select`/`progress`/`ended`/`error`) origin-validiert empfängt. Eingebunden wird sie als neuer `'mediaviewer'`-View im `PortalSidekick`-Drawer (FAB-getriggert, responsive 380–640 px). Die Widget-Domain erreicht das Frontend über `process.env.MEDIAVIEWER_HOST` (aus `k3d/configmap-domains.yaml`), injiziert in `PortalLayout.astro`. **Kein neuer Anwendungsserver, kein neues Widget-Deployment** — 2d ist reine Host-UI-Integration plus eine Korrektur der Widget-Allowlist.

**Tech Stack:** Astro 6 (SSR, `@astrojs/node`) + Svelte 5 (Runes) + Vitest 4 (`projects: node | components`, `@testing-library/svelte` + jsdom) + Zod 4. Deploy: Bachelorprojekt-Fleet (Taskfile, beide Brands). Widget-Rebuild über bestehende CI (`build-mediaviewer-widget.yml`).

**Spec:** `docs/superpowers/specs/2026-06-15-videovault-split-design.md` (§ Einbettungsziel: „Companion-Panel im Bachelorprojekt-Workspace") + `docs/superpowers/specs/2026-06-15-mediaviewer-widget-design-brief.md` (§ 1 Brand, § 3 „Workspace-Host neutral").

**Vorgänger:** Phase 2a (Widget vendored + deployt + Embed-Bridge), 2b (VideoVault-Service), 2c (server-side Split) — alle auf `main` gemergt. Phase 2d ist der **Abschluss** von Sub-Projekt 2.

**Bestätigte Entscheidungen (User-Review 2026-06-15):**
1. **Einbettungsort:** Neuer Tab im bestehenden `PortalSidekick`-Drawer (minimal-invasiv, responsive bereits gelöst).
2. **Video-Quelle:** Statisches, versioniertes Manifest `help-videos.json` im `website/`-Frontend; URLs zeigen auf den VideoVault-Service. Kein neuer Backend-Code (YAGNI, „Companion-Steckdose, nicht Companion").

---

## Kritische Befunde aus der Code-Erkundung (vor dem Bauen beachten)

1. **Portal-Origin ≠ Widget-Allowlist (MUSS gefixt werden, Task 6).** Die Apex-Domain leitet per `prod/ingress.yaml` permanent auf `web.${PROD_DOMAIN}` um → das Portal läuft unter `https://web.mentolder.de` bzw. `https://web.korczewski.de`. Das Widget wurde aber mit `VITE_ALLOWED_PARENT_ORIGINS="https://mentolder.de,https://korczewski.de"` (Apex) gebaut (`.github/workflows/build-mediaviewer-widget.yml:49`). Die Widget-Bridge verwirft `setVideos` aus einem nicht gelisteten Origin (`bridge.ts`: `if (!deps.allowedOrigins.includes(event.origin)) return;`). **Ohne Fix bleibt das Panel leer.** Vor Task 6 das tatsächliche Portal-Origin per `kubectl`/Ingress verifizieren.

2. **VideoSource-Feldnamen (vendored Package, nicht Spec-Wortlaut).** `packages/videovault-player/src/types.ts`:
   ```ts
   interface VideoSource { id: string; url: string; poster?: string; title: string; duration: number; tags?: string[]; }
   ```
   → `poster` (nicht `posterUrl`), `duration` (nicht `durationSec`). `setVideos` reicht das Array **unverändert** an `MediaviewerWidget.setPlaylist` durch — das Manifest MUSS exakt diese Felder verwenden.

3. **iframe-SSO-Flow ist fragil (Risiko, Task 7 Verify).** Das Widget liegt hinter `oauth2-proxy-mediaviewer` (eigenes Subdomain-Cookie). Lädt der `<iframe>` `embed.html`, kann oauth2-proxy einen Keycloak-Redirect **innerhalb des iframe** auslösen — Keycloak/oauth2-proxy setzen ggf. `X-Frame-Options`/`frame-ancestors`, was den Flow im iframe blockiert. Mitigation siehe Task 7 Step 4 + Offene Punkte.

4. **Bridge-Protokoll (Quelle der Wahrheit, `mediaviewer-widget/src/embed/bridge.ts`):**
   - Inbound (Host→Widget): `{type:'setVideos',videos}` · `{type:'playVideo',id}` · `{type:'play'}` · `{type:'pause'}` · `{type:'seek',sec}`
   - Outbound (Widget→Host): `{type:'select',id}` · `{type:'progress',sec}` · `{type:'ended',id}` · `{type:'error',id,message}`
   - Widget validiert `event.origin` gegen Allowlist; Widget postet outbound an `window.parent.postMessage(msg,'*')` (Wildcard-Target). Der **Host muss daher selbst** `event.origin === https://${MEDIAVIEWER_HOST}` prüfen.

---

## File Structure

**Neu (in `~/Bachelorprojekt/website/`):**
- `src/data/help-videos.json` — versioniertes Hilfsvideo-Manifest (Array im `VideoSource`-Format des vendored Packages).
- `src/lib/help-videos.ts` — Zod-Schema + `loadHelpVideos()`; eine Verantwortung: Manifest typsicher parsen/validieren.
- `src/lib/help-videos.test.ts` — Schema-/Loader-Tests (node-Projekt).
- `src/lib/mediaviewer-bridge.ts` — pure Host-Seite der Bridge: `buildSetVideosMessage`, `parseOutbound` (Protokoll-Guard, origin-agnostisch), Typen `HostInbound`/`HostOutbound`.
- `src/lib/mediaviewer-bridge.test.ts` — Bridge-Helfer-Tests (node-Projekt).
- `src/components/MediaviewerPanel.svelte` — iframe + Bridge-Verdrahtung (postet `setVideos` on load, empfängt origin-validierte Outbound-Events).
- `src/components/MediaviewerPanel.test.ts` — Komponententest (components-Projekt, jsdom + `@testing-library/svelte`).

**Modifiziert (in `~/Bachelorprojekt/website/`):**
- `src/components/PortalSidekick.svelte` — `View` um `'mediaviewer'` erweitern, `titleMap`-Eintrag, Dispatcher-Zweig, Prop `mediaviewerHost`, Import.
- `src/components/assistant/SidekickHome.svelte` — `View`-Typ + neuer Navigations-Eintrag „Mediaviewer".
- `src/layouts/PortalLayout.astro` — `mediaviewerHost={...}` an `<PortalSidekick>` durchreichen.

**Modifiziert (in `~/Bachelorprojekt/`, Infra):**
- `k3d/website.yaml` — `MEDIAVIEWER_HOST`-Env aus `configmap-domains` in den website-Container.
- `.github/workflows/build-mediaviewer-widget.yml` — `VITE_ALLOWED_PARENT_ORIGINS` auf das tatsächliche Portal-Origin (`https://web.{domain}` + dev) korrigieren.

---

## Verifizierte Referenz-Signaturen (wörtlich — beim Schreiben nutzen, nicht raten)

| Symbol / Ort | Datei | Fakt |
|---|---|---|
| `VideoSource` | `packages/videovault-player/src/types.ts:3` | `{ id; url; poster?; title; duration; tags? }` |
| Inbound/Outbound-Typen | `mediaviewer-widget/src/embed/bridge.ts:3` | siehe Befund 4 |
| PortalSidekick mount | `website/src/layouts/PortalLayout.astro:297` | `<PortalSidekick client:load helpSection={section} helpContext="portal" />` |
| `View`-Typ (Sidekick) | `website/src/components/PortalSidekick.svelte:13` | `'home'|'support'|'questionnaire'|'help'|'tickets'|'inbox'|'agent-guide'` |
| `View`-Typ (Home) | `website/src/components/assistant/SidekickHome.svelte:4` | identische Union (dupliziert) |
| Dispatcher-Block | `website/src/components/PortalSidekick.svelte` | `{#if view === 'home'} … {:else if view === 'tickets'} … {/if}` im `.drawer-body` |
| Vitest components-Projekt | `website/vitest.config.ts` | include `src/components/**/*.{test,spec}.ts`, jsdom, svelte-plugin, setup `./src/lib/__tests__/setup.ts` |
| Komponententest-Muster | `website/src/components/admin/SuggestionBar.test.ts` | `render(Comp, props)` aus `@testing-library/svelte`; Callback-Props (`onroll`) |
| Domain-Registry | `k3d/configmap-domains.yaml:35` | `MEDIAVIEWER_HOST: "mediaviewer.localhost"` |
| Widget allowed origins | `.github/workflows/build-mediaviewer-widget.yml:49` | `--build-arg VITE_ALLOWED_PARENT_ORIGINS="https://mentolder.de,https://korczewski.de"` |
| Test-Runner | `website/package.json` | `npm run test:unit` (`vitest run`) |

**Arbeitsverzeichnis Tasks 1–5: `~/Bachelorprojekt/website/`. Tasks 6–7: `~/Bachelorprojekt/`. Branch: neuer `feature/videovault-2d-embed` (von `main`).**

```bash
cd ~/Bachelorprojekt && git checkout main && git pull && git checkout -b feature/videovault-2d-embed
```

---

## Task 1: Hilfsvideo-Manifest + typsicherer Loader (TDD)

**Files:**
- Create: `~/Bachelorprojekt/website/src/data/help-videos.json`
- Create: `~/Bachelorprojekt/website/src/lib/help-videos.ts`
- Test: `~/Bachelorprojekt/website/src/lib/help-videos.test.ts`

- [ ] **Step 1: Failing test schreiben**

`src/lib/help-videos.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { HelpVideoSchema, loadHelpVideos } from './help-videos';

describe('HelpVideoSchema', () => {
  it('accepts a minimal valid video (vendored VideoSource shape)', () => {
    const ok = HelpVideoSchema.safeParse({ id: 'v1', url: 'https://x/v.mp4', title: 'T', duration: 12 });
    expect(ok.success).toBe(true);
  });

  it('rejects posterUrl/durationSec (wrong field names from the spec draft)', () => {
    const bad = HelpVideoSchema.safeParse({ id: 'v1', url: 'https://x/v.mp4', title: 'T', posterUrl: 'p', durationSec: 12 });
    // duration is required → fails even though extra keys are stripped
    expect(bad.success).toBe(false);
  });

  it('requires a non-empty id, url and title', () => {
    expect(HelpVideoSchema.safeParse({ id: '', url: 'https://x', title: 'T', duration: 1 }).success).toBe(false);
  });
});

describe('loadHelpVideos', () => {
  it('parses the shipped manifest into a typed array', () => {
    const videos = loadHelpVideos();
    expect(Array.isArray(videos)).toBe(true);
    expect(videos.length).toBeGreaterThan(0);
    for (const v of videos) {
      expect(typeof v.id).toBe('string');
      expect(typeof v.url).toBe('string');
      expect(typeof v.duration).toBe('number');
    }
  });
});
```

- [ ] **Step 2: Test laufen lassen (muss scheitern)**

Run: `cd ~/Bachelorprojekt/website && npm run test:unit -- src/lib/help-videos.test.ts`
Expected: FAIL — `Cannot find module './help-videos'`.

- [ ] **Step 3: Manifest schreiben**

`src/data/help-videos.json` (Platzhalter-Inhalte sind erlaubt — es ist Daten, kein Code; URLs zeigen auf den VideoVault-Service, der die Medien serviert):
```json
[
  {
    "id": "onboarding-portal",
    "url": "https://videovault.localhost/media/help/onboarding-portal.mp4",
    "title": "Erste Schritte im Portal",
    "duration": 96,
    "tags": ["onboarding", "portal"]
  },
  {
    "id": "tickets-anlegen",
    "url": "https://videovault.localhost/media/help/tickets-anlegen.mp4",
    "title": "Anfragen & Tickets anlegen",
    "duration": 73,
    "tags": ["tickets"]
  }
]
```
(Die `videovault.localhost`-URLs werden in Task 5/7 nicht umgeschrieben — Phase 2d liefert die Verdrahtung; das Pflegen echter Medien-URLs je Brand ist ein Folge-Task, siehe Offene Punkte. Wichtig ist hier die korrekte **Form**.)

- [ ] **Step 4: Loader + Schema schreiben**

`src/lib/help-videos.ts`:
```ts
import { z } from 'zod';
import manifest from '../data/help-videos.json';

// Spiegelt das VideoSource-Interface des vendored @videovault-player (poster/duration,
// NICHT posterUrl/durationSec). Extra-Keys werden gestripped; Pflichtfelder erzwungen.
export const HelpVideoSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  duration: z.number().nonnegative(),
  poster: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type HelpVideo = z.infer<typeof HelpVideoSchema>;

const HelpVideoListSchema = z.array(HelpVideoSchema);

/** Parst das versionierte Manifest. Wirft bei Schema-Verletzung (Build-/Test-Zeit-Fehler, kein stiller Fallback). */
export function loadHelpVideos(): HelpVideo[] {
  return HelpVideoListSchema.parse(manifest);
}
```

(Voraussetzung: `tsconfig`/Astro erlaubt JSON-Imports — Astro aktiviert `resolveJsonModule` standardmäßig. Falls der TS-Check meckert: in Step 5 sichtbar.)

- [ ] **Step 5: Test + Typecheck**

Run: `cd ~/Bachelorprojekt/website && npm run test:unit -- src/lib/help-videos.test.ts && npx astro check --minimumSeverity error 2>/dev/null || npx tsc --noEmit -p tsconfig.json`
Expected: 5 Tests grün; kein Typfehler beim JSON-Import.

- [ ] **Step 6: Commit**

```bash
cd ~/Bachelorprojekt
git add website/src/data/help-videos.json website/src/lib/help-videos.ts website/src/lib/help-videos.test.ts
git commit -m "feat(website): add validated help-video manifest for mediaviewer panel"
```

---

## Task 2: Host-seitige Bridge-Hilfe (TDD)

Spiegelt das Widget-Protokoll auf der Host-Seite. Pure Funktionen → im node-Projekt testbar (keine jsdom-/postMessage-Mechanik nötig). Origin-/Source-Validierung des `MessageEvent` bleibt bewusst in der Komponente (Task 3); dieser Helfer prüft nur Protokoll-Form.

**Files:**
- Create: `~/Bachelorprojekt/website/src/lib/mediaviewer-bridge.ts`
- Test: `~/Bachelorprojekt/website/src/lib/mediaviewer-bridge.test.ts`

- [ ] **Step 1: Failing test schreiben**

`src/lib/mediaviewer-bridge.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildSetVideosMessage, parseOutbound } from './mediaviewer-bridge';
import type { HelpVideo } from './help-videos';

const videos: HelpVideo[] = [{ id: 'v1', url: 'https://x/v.mp4', title: 'T', duration: 10 }];

describe('buildSetVideosMessage', () => {
  it('wraps videos in the inbound setVideos envelope', () => {
    expect(buildSetVideosMessage(videos)).toEqual({ type: 'setVideos', videos });
  });
});

describe('parseOutbound', () => {
  it('accepts a well-formed select message', () => {
    expect(parseOutbound({ type: 'select', id: 'v1' })).toEqual({ type: 'select', id: 'v1' });
  });
  it('accepts progress with a numeric sec', () => {
    expect(parseOutbound({ type: 'progress', sec: 4.2 })).toEqual({ type: 'progress', sec: 4.2 });
  });
  it('accepts an error message', () => {
    expect(parseOutbound({ type: 'error', id: 'v1', message: 'boom' })).toEqual({ type: 'error', id: 'v1', message: 'boom' });
  });
  it('returns null for unknown types', () => {
    expect(parseOutbound({ type: 'setVideos', videos: [] })).toBeNull(); // inbound type, not outbound
    expect(parseOutbound({ foo: 'bar' })).toBeNull();
    expect(parseOutbound(null)).toBeNull();
    expect(parseOutbound('select')).toBeNull();
  });
  it('returns null when required fields are missing/mistyped', () => {
    expect(parseOutbound({ type: 'select' })).toBeNull();
    expect(parseOutbound({ type: 'progress', sec: 'x' })).toBeNull();
    expect(parseOutbound({ type: 'error', id: 'v1' })).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen (muss scheitern)**

Run: `cd ~/Bachelorprojekt/website && npm run test:unit -- src/lib/mediaviewer-bridge.test.ts`
Expected: FAIL — `Cannot find module './mediaviewer-bridge'`.

- [ ] **Step 3: Bridge-Hilfe schreiben**

`src/lib/mediaviewer-bridge.ts`:
```ts
import type { HelpVideo } from './help-videos';

// Host-Seite des Protokolls aus mediaviewer-widget/src/embed/bridge.ts.
export type HostInbound =
  | { type: 'setVideos'; videos: HelpVideo[] }
  | { type: 'playVideo'; id: string }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; sec: number };

export type HostOutbound =
  | { type: 'select'; id: string }
  | { type: 'progress'; sec: number }
  | { type: 'ended'; id: string }
  | { type: 'error'; id: string; message: string };

export function buildSetVideosMessage(videos: HelpVideo[]): HostInbound {
  return { type: 'setVideos', videos };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Validiert die Protokoll-Form einer eingehenden Widget-Nachricht. Origin/Source prüft der Aufrufer. */
export function parseOutbound(data: unknown): HostOutbound | null {
  if (!isRecord(data) || typeof data.type !== 'string') return null;
  switch (data.type) {
    case 'select':
      return typeof data.id === 'string' ? { type: 'select', id: data.id } : null;
    case 'ended':
      return typeof data.id === 'string' ? { type: 'ended', id: data.id } : null;
    case 'progress':
      return typeof data.sec === 'number' ? { type: 'progress', sec: data.sec } : null;
    case 'error':
      return typeof data.id === 'string' && typeof data.message === 'string'
        ? { type: 'error', id: data.id, message: data.message }
        : null;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `cd ~/Bachelorprojekt/website && npm run test:unit -- src/lib/mediaviewer-bridge.test.ts`
Expected: PASS — 7 Tests grün.

- [ ] **Step 5: Commit**

```bash
cd ~/Bachelorprojekt
git add website/src/lib/mediaviewer-bridge.ts website/src/lib/mediaviewer-bridge.test.ts
git commit -m "feat(website): add host-side mediaviewer postMessage bridge helper"
```

---

## Task 3: `MediaviewerPanel.svelte` (TDD, components-Projekt)

Schlanke Komponente: rendert `<iframe src="https://{host}/embed.html">`, postet `setVideos` an den iframe sobald er geladen ist, lauscht auf origin-validierte Outbound-Events und reicht sie als Callback-Props nach oben.

**Files:**
- Create: `~/Bachelorprojekt/website/src/components/MediaviewerPanel.svelte`
- Test: `~/Bachelorprojekt/website/src/components/MediaviewerPanel.test.ts`

- [ ] **Step 1: Failing test schreiben**

`src/components/MediaviewerPanel.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import MediaviewerPanel from './MediaviewerPanel.svelte';
import type { HelpVideo } from '../lib/help-videos';

const videos: HelpVideo[] = [{ id: 'v1', url: 'https://x/v.mp4', title: 'T', duration: 10 }];

describe('MediaviewerPanel', () => {
  it('renders an iframe pointing at the embed entry of the configured host', () => {
    const { getByTitle } = render(MediaviewerPanel, { mediaviewerHost: 'mediaviewer.localhost', videos });
    const iframe = getByTitle('Mediaviewer') as HTMLIFrameElement;
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.getAttribute('src')).toBe('https://mediaviewer.localhost/embed.html');
  });

  it('posts setVideos to the iframe once it has loaded', async () => {
    const { getByTitle } = render(MediaviewerPanel, { mediaviewerHost: 'mediaviewer.localhost', videos });
    const iframe = getByTitle('Mediaviewer') as HTMLIFrameElement;
    // jsdom gives the iframe a contentWindow; spy on its postMessage.
    const post = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post }, configurable: true });
    await fireEvent.load(iframe);
    expect(post).toHaveBeenCalledWith(
      { type: 'setVideos', videos },
      'https://mediaviewer.localhost',
    );
  });

  it('invokes onSelect when the widget posts a valid select message from the widget origin', async () => {
    const onSelect = vi.fn();
    render(MediaviewerPanel, { mediaviewerHost: 'mediaviewer.localhost', videos, onSelect });
    // jsdom MessageEvent: origin must match; source is null here (guard tolerates null — see component).
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'select', id: 'v1' },
      origin: 'https://mediaviewer.localhost',
    }));
    expect(onSelect).toHaveBeenCalledWith('v1');
  });

  it('ignores messages from a foreign origin', async () => {
    const onSelect = vi.fn();
    render(MediaviewerPanel, { mediaviewerHost: 'mediaviewer.localhost', videos, onSelect });
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'select', id: 'v1' },
      origin: 'https://evil.example',
    }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test laufen lassen (muss scheitern)**

Run: `cd ~/Bachelorprojekt/website && npm run test:unit -- src/components/MediaviewerPanel.test.ts`
Expected: FAIL — Komponente existiert nicht.

- [ ] **Step 3: Komponente schreiben**

`src/components/MediaviewerPanel.svelte`:
```svelte
<script lang="ts">
  import { buildSetVideosMessage, parseOutbound, type HostOutbound } from '../lib/mediaviewer-bridge';
  import type { HelpVideo } from '../lib/help-videos';

  let {
    mediaviewerHost,
    videos = [],
    onSelect,
    onProgress,
    onEnded,
    onError,
  }: {
    mediaviewerHost: string;
    videos?: HelpVideo[];
    onSelect?: (id: string) => void;
    onProgress?: (sec: number) => void;
    onEnded?: (id: string) => void;
    onError?: (id: string, message: string) => void;
  } = $props();

  const widgetOrigin = $derived(`https://${mediaviewerHost}`);
  const embedSrc = $derived(`${widgetOrigin}/embed.html`);

  let iframeEl = $state<HTMLIFrameElement | null>(null);

  function pushVideos() {
    iframeEl?.contentWindow?.postMessage(buildSetVideosMessage(videos), widgetOrigin);
  }

  function dispatch(msg: HostOutbound) {
    switch (msg.type) {
      case 'select': onSelect?.(msg.id); return;
      case 'progress': onProgress?.(msg.sec); return;
      case 'ended': onEnded?.(msg.id); return;
      case 'error': onError?.(msg.id, msg.message); return;
    }
  }

  $effect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== widgetOrigin) return;                 // Host-seitige Origin-Prüfung (Widget postet an '*')
      // Source-Guard: nur ablehnen, wenn beide Seiten bekannt sind UND nicht übereinstimmen.
      // (jsdom liefert e.source === null; Produktion liefert das iframe-Window.)
      if (iframeEl?.contentWindow && e.source && e.source !== iframeEl.contentWindow) return;
      const msg = parseOutbound(e.data);
      if (msg) dispatch(msg);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  });

  // Bei Video-Listen-Änderung erneut pushen (falls der iframe schon geladen ist).
  $effect(() => {
    void videos;
    pushVideos();
  });
</script>

<div class="mv-panel">
  <iframe
    bind:this={iframeEl}
    src={embedSrc}
    title="Mediaviewer"
    allow="autoplay; fullscreen; picture-in-picture"
    onload={pushVideos}
  ></iframe>
</div>

<style>
  .mv-panel {
    flex: 1;
    display: flex;
    min-height: 0;
    background: #0b111c;
  }
  iframe {
    flex: 1;
    width: 100%;
    height: 100%;
    border: 0;
  }
</style>
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `cd ~/Bachelorprojekt/website && npm run test:unit -- src/components/MediaviewerPanel.test.ts`
Expected: PASS — 4 Tests grün.
(Falls der `onload`-Push-Test flaky ist, weil `bind:this` erst nach dem ersten `$effect`-Lauf gesetzt wird: der Test setzt `contentWindow` explizit und feuert `load` manuell — der `pushVideos`-Aufruf im `onload`-Handler nutzt das dann gesetzte `iframeEl`.)

- [ ] **Step 5: Commit**

```bash
cd ~/Bachelorprojekt
git add website/src/components/MediaviewerPanel.svelte website/src/components/MediaviewerPanel.test.ts
git commit -m "feat(website): add MediaviewerPanel (iframe + host bridge wiring)"
```

---

## Task 4: In PortalSidekick + SidekickHome verdrahten (TDD)

Neuer `'mediaviewer'`-View im Drawer, erreichbar über einen Navigations-Eintrag im Home-View.

**Files:**
- Modify: `~/Bachelorprojekt/website/src/components/PortalSidekick.svelte`
- Modify: `~/Bachelorprojekt/website/src/components/assistant/SidekickHome.svelte`
- Test: `~/Bachelorprojekt/website/src/components/PortalSidekick.test.ts` (neu)

- [ ] **Step 1: Failing test schreiben**

`src/components/PortalSidekick.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import PortalSidekick from './PortalSidekick.svelte';

describe('PortalSidekick — mediaviewer view', () => {
  it('opens the drawer and shows the Mediaviewer iframe after navigating', async () => {
    const { getByLabelText, getByText, getByTitle } = render(PortalSidekick, {
      helpContext: 'portal',
      mediaviewerHost: 'mediaviewer.localhost',
    });
    // FAB öffnet den Drawer (Home-View).
    await fireEvent.click(getByLabelText('Sidekick öffnen'));
    // Navigations-Eintrag „Mediaviewer" anklicken.
    await fireEvent.click(getByText('Mediaviewer'));
    // Panel-iframe ist sichtbar.
    const iframe = getByTitle('Mediaviewer') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('https://mediaviewer.localhost/embed.html');
  });
});
```

- [ ] **Step 2: Test laufen lassen (muss scheitern)**

Run: `cd ~/Bachelorprojekt/website && npm run test:unit -- src/components/PortalSidekick.test.ts`
Expected: FAIL — kein „Mediaviewer"-Eintrag / kein Panel.

- [ ] **Step 3: `PortalSidekick.svelte` erweitern**

3a. Import ergänzen (bei den übrigen Sidekick-View-Imports, nach `AgentGuideView`):
```ts
  import MediaviewerPanel from './MediaviewerPanel.svelte';
```

3b. `View`-Union (Zeile 13) erweitern:
```ts
  type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox' | 'agent-guide' | 'mediaviewer';
```

3c. Prop ergänzen (im `$props()`-Destructuring, nach `helpContext`):
```ts
  let {
    helpSection = '',
    helpContext = 'portal' as HelpContext,
    mediaviewerHost = 'mediaviewer.localhost',
  }: {
    helpSection?: string;
    helpContext?: HelpContext;
    mediaviewerHost?: string;
  } = $props();
```

3d. `titleMap` (Zeile ~? im `titleMap`-Objekt) um den Eintrag erweitern:
```ts
  const titleMap: Record<View, string> = {
    home: 'Sidekick',
    support: 'Feedback & Support',
    questionnaire: 'Fragebögen',
    help: 'Hilfe',
    tickets: 'Anfragen',
    inbox: 'Postfach',
    'agent-guide': 'Agent-Anleitung',
    mediaviewer: 'Mediaviewer',
  };
```

3e. Dispatcher-Zweig im `.drawer-body` ergänzen (nach dem `{:else if view === 'inbox'}`-Block, vor `{/if}`):
```svelte
    {:else if view === 'mediaviewer'}
      <MediaviewerPanel {mediaviewerHost} />
```

- [ ] **Step 4: `SidekickHome.svelte` erweitern**

4a. `View`-Typ (Zeile 4) identisch erweitern:
```ts
  type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox' | 'agent-guide' | 'mediaviewer';
```

4b. Im `items`-`$derived`-Array einen Eintrag ergänzen (vor dem `help`-Eintrag, damit er auch ohne `helpSection` sichtbar ist):
```ts
    { id: 'mediaviewer',   no: isAdmin ? '08' : '06', title: 'Mediaviewer', sub: 'Hilfe- & Onboarding-Videos', show: true },
```
(Die `no`-Nummern sind reine Anzeige; bei Kollision die nachfolgenden nicht zwingend neu nummerieren — kosmetisch.)

- [ ] **Step 5: Test laufen lassen (muss bestehen) + volle Komponenten-Suite**

Run: `cd ~/Bachelorprojekt/website && npm run test:unit -- src/components/PortalSidekick.test.ts && npm run test:unit -- src/components`
Expected: neuer Test grün; **keine Regression** in den bestehenden Komponententests (`SuggestionBar`, `Cockpit`, `TicketDrawer`, …).
(Hinweis: `PortalSidekick` feuert beim Mount mehrere `fetch`-Calls — die sind in `try/catch` fail-soft, in jsdom schlagen sie still fehl und beeinflussen den Test nicht. Falls `fetch` in jsdom `undefined` ist und ein unhandled rejection entsteht: in der Test-Datei `globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'))` im `beforeEach` setzen.)

- [ ] **Step 6: Typecheck**

Run: `cd ~/Bachelorprojekt/website && npx astro check --minimumSeverity error`
Expected: keine neuen Typfehler (beide `View`-Unions konsistent, Prop typisiert).

- [ ] **Step 7: Commit**

```bash
cd ~/Bachelorprojekt
git add website/src/components/PortalSidekick.svelte website/src/components/assistant/SidekickHome.svelte website/src/components/PortalSidekick.test.ts
git commit -m "feat(website): add mediaviewer tab to PortalSidekick drawer"
```

---

## Task 5: Widget-Host ins Frontend injizieren (Astro + k8s)

`PortalSidekick` ist `client:load` — der `mediaviewerHost`-Prop-Wert wird zur SSR-Zeit aus `process.env.MEDIAVIEWER_HOST` in die Hydration serialisiert. Daher muss die website-Deployment-Env diese Variable führen.

**Files:**
- Modify: `~/Bachelorprojekt/website/src/layouts/PortalLayout.astro`
- Modify: `~/Bachelorprojekt/k3d/website.yaml`

- [ ] **Step 1: `PortalLayout.astro` — Prop durchreichen**

In `src/layouts/PortalLayout.astro` im Frontmatter (oben, bei den übrigen `const … = process.env…`-Zeilen, z. B. neben `ASSISTANT_ENABLED`) ergänzen:
```ts
const MEDIAVIEWER_HOST = process.env.MEDIAVIEWER_HOST ?? 'mediaviewer.localhost';
```
Und die Mount-Zeile (`:297`) erweitern:
```astro
    <PortalSidekick client:load helpSection={section} helpContext="portal" mediaviewerHost={MEDIAVIEWER_HOST} />
```

- [ ] **Step 2: `k3d/website.yaml` — Env aus configmap-domains**

Im website-Container unter `env:` (bei den übrigen `configMapKeyRef`-Einträgen) ergänzen:
```yaml
            - name: MEDIAVIEWER_HOST
              valueFrom:
                configMapKeyRef:
                  name: domains            # tatsächlichen ConfigMap-Namen aus configmap-domains.yaml verifizieren
                  key: MEDIAVIEWER_HOST
```
**Vor dem Schreiben verifizieren:** den ConfigMap-`metadata.name` ablesen —
```bash
grep -n -A2 'kind: ConfigMap' ~/Bachelorprojekt/k3d/configmap-domains.yaml | head
```
und exakt diesen Namen für `configMapKeyRef.name` verwenden (nicht „domains" raten).

- [ ] **Step 3: Kustomize-Build validieren**

Run:
```bash
cd ~/Bachelorprojekt && kustomize build k3d/ --load-restrictor=LoadRestrictionsNone \
  | kubectl apply --dry-run=client -f - >/dev/null && echo "dry-run OK"
```
Expected: `dry-run OK`; `MEDIAVIEWER_HOST` erscheint im gerenderten website-Deployment (`… | grep -c 'MEDIAVIEWER_HOST'` ≥ 2: ConfigMap-Definition + Deployment-Ref).

- [ ] **Step 4: Commit**

```bash
cd ~/Bachelorprojekt
git add website/src/layouts/PortalLayout.astro k3d/website.yaml
git commit -m "feat(website): inject MEDIAVIEWER_HOST into portal sidekick"
```

---

## Task 6: Widget-Allowlist auf das echte Portal-Origin korrigieren

**Begründung:** siehe Kritischer Befund 1. Ohne diesen Fix verwirft die Widget-Bridge `setVideos` aus dem Portal und das Panel bleibt leer.

**Files:**
- Modify: `~/Bachelorprojekt/.github/workflows/build-mediaviewer-widget.yml`

- [ ] **Step 1: Tatsächliches Portal-Origin verifizieren**

Run:
```bash
cd ~/Bachelorprojekt
grep -n -A3 'PROD_DOMAIN' prod/ingress.yaml | head -20      # Apex → web.PROD_DOMAIN Redirect bestätigen
grep -n 'host:' k3d/ingress.yaml | head                      # dev-Host des Portals ablesen
```
Expected: bestätigt, dass das Portal unter `web.${PROD_DOMAIN}` (prod) bzw. dem dev-Host (z. B. `localhost`/`web.localhost`) läuft. **Das ist der Origin, der in die Allowlist muss** — nicht der Apex.

- [ ] **Step 2: `VITE_ALLOWED_PARENT_ORIGINS` korrigieren**

In `.github/workflows/build-mediaviewer-widget.yml:49` den Build-Arg auf die verifizierten Portal-Origins setzen, z. B.:
```yaml
            --build-arg VITE_ALLOWED_PARENT_ORIGINS="https://web.mentolder.de,https://web.korczewski.de,http://localhost:4321" \
```
(Die exakten Werte aus Step 1 übernehmen. `http://localhost:4321` nur, falls dev-Embedding gegen den lokalen Astro-Dev-Server getestet werden soll; sonst den dev-k3d-Portal-Origin eintragen. Mehrere Origins sind per CSV erlaubt — die Bridge splittet an `,`.)

- [ ] **Step 3: YAML-Lint**

Run:
```bash
cd ~/Bachelorprojekt && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build-mediaviewer-widget.yml')); print('yaml OK')"
```
Expected: `yaml OK`.

- [ ] **Step 4: Commit**

```bash
cd ~/Bachelorprojekt
git add .github/workflows/build-mediaviewer-widget.yml
git commit -m "fix(mediaviewer): allow real portal origin (web.<domain>) for embed bridge"
```
(Der Push auf `main` triggert den Widget-Rebuild mit der korrigierten Allowlist — siehe Task 7.)

---

## Task 7: Manifest-Gate, Deploy beide Brands, Verify, Learnings, PR

**Files:** Modify: `~/projects/docs/superpowers/specs/2026-06-15-videovault-migration-learnings.md` (Learnings); sonst nur Deploy/Verify.

- [ ] **Step 1: Volle website-Unit-Suite + Typecheck (Regressions-Gate)**

Run:
```bash
cd ~/Bachelorprojekt/website && npm run test:unit && npx astro check --minimumSeverity error
```
Expected: node- + components-Projekt grün; kein Typfehler. Astro-`build` als zusätzlicher Smoke:
```bash
npm run build
```
Expected: SSR-Build ohne Fehler (JSON-Import + neue Komponente bündeln).

- [ ] **Step 2: Manifest-Suite (offline) grün**

Run:
```bash
cd ~/Bachelorprojekt && task test:all
```
Expected: BATS + Kustomize-Build + Dry-Run grün (inkl. der `MEDIAVIEWER_HOST`-Env-Ergänzung in `website.yaml`).

- [ ] **Step 3: Branch pushen + nach main mergen (triggert Widget-Rebuild)**

```bash
cd ~/Bachelorprojekt && git push -u origin HEAD
gh pr create --title "VideoVault Phase 2d — mediaviewer companion panel in portal" \
  --body "Bettet das (in 2a deployte) Mediaviewer-Widget als PortalSidekick-Tab ein: help-videos.json + Host-Bridge + MediaviewerPanel.svelte + MEDIAVIEWER_HOST-Injektion. Fixt die Widget-Allowlist auf das echte Portal-Origin. Plan: docs/superpowers/plans/2026-06-15-videovault-migration-2d-embed.md"
```
Nach Merge auf `main`: der `build-mediaviewer-widget.yml`-Workflow baut das Widget mit der **korrigierten Allowlist** neu und rollt beide Brands aus (`paths: mediaviewer-widget/** …` — der Workflow-Edit selbst triggert ihn nicht; via `workflow_dispatch` manuell starten):
```bash
gh workflow run build-mediaviewer-widget.yml
```
Expected: PR grün gemergt; Widget-Image neu gebaut + ausgerollt (beide Namespaces).

- [ ] **Step 4: Dev deployen + iframe-SSO + Bridge rauchtesten**

Run:
```bash
cd ~/Bachelorprojekt && task workspace:deploy ENV=dev
kubectl rollout status deployment/website -n workspace --timeout=180s
kubectl rollout status deployment/mediaviewer-widget -n workspace --timeout=120s
```
Dann manuell im Browser (dev-Portal-Host aus Task 6 Step 1):
1. Portal öffnen → FAB → „Mediaviewer"-Tab → der iframe lädt `https://mediaviewer.<host>/embed.html`.
2. **iframe-SSO prüfen (Kritischer Befund 3):** Lädt der iframe den Player oder bleibt er auf einem blockierten Keycloak-Redirect hängen? Falls blockiert (`X-Frame-Options`/`frame-ancestors`): siehe Offene Punkte — entweder oauth2-proxy/Keycloak-`frame-ancestors` für den Portal-Origin freigeben, oder die Session vorwärmen (Widget einmal standalone öffnen).
3. **Bridge prüfen:** Der HelpVideoPicker zeigt die Einträge aus `help-videos.json` (beweist: `setVideos` kam durch → Allowlist korrekt). Browser-Konsole: keine „origin"-Verwerfungs-Warnung.

Expected: Panel zeigt die Hilfsvideo-Liste; Auswahl spielt ab (sofern eine Medien-URL erreichbar ist — sonst `onError`, siehe Offene Punkte 1).

- [ ] **Step 5: Beide Brands deployen + verifizieren**

Run:
```bash
cd ~/Bachelorprojekt
task workspace:deploy ENV=mentolder && task workspace:verify ENV=mentolder
task workspace:deploy ENV=korczewski && task workspace:verify ENV=korczewski
```
Expected: beide Rollouts grün; `workspace:verify` ohne Fehler. Manuell je Brand: Portal → Mediaviewer-Tab → Liste sichtbar.

- [ ] **Step 6: Learnings-Log fortschreiben**

In `~/projects/docs/superpowers/specs/2026-06-15-videovault-migration-learnings.md` einen Abschnitt „Phase 2d — Embed" ergänzen:
- **Portal-Origin ≠ Apex:** Apex redirectet auf `web.<domain>` → die Widget-Allowlist musste auf den echten Portal-Origin korrigiert werden (postMessage-Origin-Check verwirft sonst still).
- **Host besitzt die Bridge-Hälfte:** Pures `mediaviewer-bridge.ts` (Protokoll-Guard) + Origin-/Source-Validierung in der Komponente — symmetrisch zum Widget; DI-tauglich/testbar ohne echtes iframe.
- **VideoSource-Drift Spec↔Code:** vendored Package nutzt `poster`/`duration`, nicht `posterUrl`/`durationSec` — Manifest-Schema gegen den Code, nicht die Spec geschrieben.
- **iframe-SSO-Fragilität:** oauth2-proxy/Keycloak-Redirect im iframe braucht `frame-ancestors`-Freigabe oder Session-Vorwärmen — relevant für jedes künftige Companion-Panel.
- **Statisches Manifest statt API:** YAGNI — kein neuer Endpoint; die „Companion-Steckdose" wird nur verdrahtet, nicht der Companion gebaut.

- [ ] **Step 7: Commit (Learnings) + PR-Abschluss**

```bash
cd ~/projects && git add docs/superpowers/specs/2026-06-15-videovault-migration-learnings.md docs/superpowers/plans/2026-06-15-videovault-migration-2d-embed.md
git commit -m "docs(videovault): record phase-2d embed plan + learnings"
git push
```

---

## Definition of Done (Phase 2d)

- [ ] `help-videos.json` + Zod-Loader liefern eine typsichere, gegen das vendored `VideoSource`-Format (`poster`/`duration`) validierte Liste; Tests grün.
- [ ] `mediaviewer-bridge.ts` (pure) spiegelt das Protokoll; `parseOutbound` weist Fremd-/Fehlformen ab; Tests grün.
- [ ] `MediaviewerPanel.svelte` rendert den `embed.html`-iframe, postet `setVideos` origin-gezielt und reicht origin-validierte Events nach oben; Komponententests grün.
- [ ] Neuer `'mediaviewer'`-Tab im `PortalSidekick`-Drawer, erreichbar über `SidekickHome`; beide `View`-Unions konsistent; volle Komponenten-Suite ohne Regression.
- [ ] `MEDIAVIEWER_HOST` zur SSR-Zeit in `PortalSidekick` injiziert; `k3d/website.yaml` führt die Env aus der Domains-ConfigMap.
- [ ] Widget-Allowlist (`VITE_ALLOWED_PARENT_ORIGINS`) auf das **tatsächliche** Portal-Origin (`web.<domain>` + dev) korrigiert; Widget neu gebaut/ausgerollt.
- [ ] `task test:all` grün; beide Brands deployed + `workspace:verify` grün; Panel zeigt die Hilfsvideo-Liste (Bridge funktioniert).
- [ ] Learnings-Log fortgeschrieben.

## Offene Punkte für den Umsetzer (vor Start prüfen)

1. **Echte Medien-URLs:** `help-videos.json` enthält Platzhalter-URLs auf `videovault.localhost/media/help/…`. Für eine wirklich abspielbare Demo müssen entweder echte Hilfsvideos im VideoVault-Service/Upload-PVC liegen **und** unter einer iframe-erreichbaren URL servierbar sein, oder die URLs auf einen anderen erreichbaren Medien-Origin zeigen. Cross-Origin-Playback im iframe ggf. CORS-/`crossorigin`-pflichtig. Als Folge-Task notieren, falls Step-4-Playback fehlschlägt (die Verdrahtung gilt mit sichtbarer Liste als verifiziert).
2. **CSP `frame-src` der website:** Falls das Portal eine Content-Security-Policy mit `frame-src`/`default-src` setzt, muss `https://mediaviewer.<domain>` (bzw. `*.<domain>`) ergänzt werden, sonst lädt der iframe nicht. Prüfen: `grep -rni 'content-security-policy\|frame-src\|frame-ancestors' ~/Bachelorprojekt/website/src ~/Bachelorprojekt/k3d/*.yaml ~/Bachelorprojekt/prod/ingress.yaml`. Falls vorhanden → zusätzlicher Edit.
3. **iframe-SSO (`frame-ancestors`):** Siehe Task 7 Step 4. oauth2-proxy-mediaviewer und/oder Keycloak liefern evtl. `X-Frame-Options: DENY`/`frame-ancestors 'none'`, was sowohl das Widget als auch den Keycloak-Redirect im iframe blockiert. Falls so: `frame-ancestors https://web.<domain>` für den mediaviewer-Host (Traefik-Header-Middleware / static-web-server-Config) setzen und den Keycloak-Login-Flow gesondert bewerten (ggf. Session vorwärmen statt im iframe einloggen).
4. **dev-Portal-Origin:** Der dev-`build-arg`-Origin in Task 6 hängt davon ab, wie das Portal in k3d-dev erreicht wird (Traefik-Host vs. `localhost:4321` Astro-Dev). Aus `k3d/ingress.yaml` + tatsächlichem Test-Setup ableiten; bei Unsicherheit den dev-Smoke (Task 7 Step 4) gegen den deployten Portal-Host statt den lokalen Dev-Server fahren.
5. **`PortalSidekick.test.ts` + `fetch`:** Die Komponente feuert beim Mount mehrere `fetch`-Calls (fail-soft). Falls jsdom kein `fetch` hat und unhandled rejections den Test-Run stören, in `beforeEach` `globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'))` stubben (siehe Task 4 Step 5).
```
