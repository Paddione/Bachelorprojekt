# P2 — UI

Rolle: **impl / UI**. Partial P2 des Change `factory-parallel-status` (T002079). Fügt der
Admin-Pipeline-Seite einen neuen Tab `parallel` hinzu, der den Gang-Zustand der parallelen
Partialplan-Pipeline sichtbar macht: die drei Kennzahlen (`gangTickets`, `slotsClaimed`,
`slotsPerBrand`), einen Sekunden-Countdown auf `nextTickAt` und einen `Force next tick`-Button.
Das Panel ist **inline** in `DevStatusTabs.svelte` (Nutzerentscheid — kein separates
Panel-Component), analog zum bestehenden `control`-Zweig, der `ControlPanel.svelte` einbettet.

Disjunkter Scope (nur diese zwei Dateien): `DevStatusTabs.svelte` (Tab-Verdrahtung + Inline-Panel)
und `pipeline.astro` (Tab-Union + `ALLOWED`-Allowlist für den Deep-Link `?tab=parallel`).

Die vom P1-Partial gebauten API-Contracts, gegen die dieses Panel fetcht:

- `GET /api/factory/parallel-status` → `{ gangTickets, slotsClaimed, slotsPerBrand, nextTickAt }`
  (`nextTickAt`: ISO-String oder `null`).
- `POST /api/factory/force-tick` → `{ ok: true, requestedAt }`.

## File-Budgets (S1)

Beide Dateien sind **nicht** in `docs/code-quality/baseline.json` gebaselinet → wirksame Schwelle
ist das statische Extension-Limit aus `docs/code-quality/gates.yaml` (`.svelte` = 500, `.astro`
= 400). Restbudget = Limit − Ist-Zeilen. Die P2-Änderungen fügen zusammen ~120 Zeilen (nur in
`DevStatusTabs.svelte`) bzw. 0 Netto-Zeilen (`pipeline.astro`, nur String-Union-Erweiterung) hinzu
und bleiben damit komfortabel unter der Schwelle.

| Datei | Ist | Budget |
|-------|-----|--------|
| `website/src/components/DevStatusTabs.svelte` | 114 | 386 |
| `website/src/pages/admin/pipeline.astro` | 32 | 368 |

> Hinweis für den Orchestrator: `intel.json` weist `pipeline.astro` fälschlich `s1_limit: 500` /
> `s1_budget: 468` aus. Der reale Wert aus `gates.yaml` (`.astro: 400`) und der von
> `scripts/plan-lint.sh` (`residual_budget`) berechnete Wert ist **368** — dieser Plan nennt daher
> 368, damit die B1a-Budget-Integritätsprüfung grün bleibt.

---

## File: `website/src/components/DevStatusTabs.svelte`

Ist 114 Zeilen · Budget 386 (`.svelte`-Limit 500, nicht baselined). Svelte-5-Runes-Component
(`$state`, `$props`, `$derived`, `$effect`). Bestehende Struktur: Script Z1–50, Tab-Leiste
Z52–65 (`AdminTabs`), `{#if activeTab === …}`-Kette Z67–91, `<style>` Z93–114.

### Task 2.1 — Tab-Typ & TAB_KEYS um `parallel` erweitern

**Anker Z19** — bestehende Tab-Union ersetzen:

```svelte
  type Tab = 'factory' | 'planung' | 'analytics' | 'kosten' | 'control' | 'abhaengigkeiten' | 'parallel';
```

**Anker Z20** — `TAB_KEYS` ersetzen (hält den `switchTab`/localStorage/popstate-Pfad konsistent,
sodass `?tab=parallel` und der gespeicherte Tab-State den neuen Wert akzeptieren):

```svelte
  const TAB_KEYS: Tab[] = ['factory', 'planung', 'analytics', 'kosten', 'control', 'abhaengigkeiten', 'parallel'];
```

### Task 2.2 — Inline-Panel-State + Fetch + Countdown im Script ergänzen

**Anker: nach Z49** (unmittelbar nach dem schließenden `});` des `onMount`-Blocks, noch vor
`</script>` in Z50) den folgenden Block einfügen. Er folgt dem Fetch-/Error-Muster aus
`ControlPanel.svelte` (`$state`-Trio `loading`/`error`/`data`, `try/catch/finally`,
`err instanceof Error ? err.message : …`):

```svelte
  // --- Parallel-Status-Panel (inline, T002079) ---
  interface ParallelStatus {
    gangTickets: number;
    slotsClaimed: number;
    slotsPerBrand: number;
    nextTickAt: string | null;
  }

  let parallel = $state<ParallelStatus | null>(null);
  let parallelError = $state<string | null>(null);
  let parallelLoading = $state(false);
  let forcing = $state(false);
  let nowMs = $state(Date.now());
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let refetchArmed = false;

  async function loadParallel() {
    try {
      parallelLoading = true;
      const res = await fetch('/api/factory/parallel-status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      parallel = (await res.json()) as ParallelStatus;
      parallelError = null;
      refetchArmed = false;
    } catch (err) {
      parallelError = err instanceof Error ? err.message : 'Laden fehlgeschlagen';
      parallel = null;
    } finally {
      parallelLoading = false;
    }
  }

  async function forceTick() {
    try {
      forcing = true;
      const res = await fetch('/api/factory/force-tick', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadParallel();
    } catch (err) {
      parallelError = err instanceof Error ? err.message : 'Force-Tick fehlgeschlagen';
    } finally {
      forcing = false;
    }
  }

  // Restsekunden bis nextTickAt (≤ 0 → Tick fällig); null wenn kein Tick geplant.
  const remainingSec = $derived(
    parallel?.nextTickAt
      ? Math.floor((new Date(parallel.nextTickAt).getTime() - nowMs) / 1000)
      : null,
  );

  function fmtCountdown(sec: number): string {
    const s = Math.max(0, sec);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  // Beim Aktivieren des Tabs: einmal fetchen + 1-Sekunden-Timer starten.
  // Cleanup (Tab-Wechsel/Unmount) räumt den Timer auf — kein Leak.
  $effect(() => {
    if (activeTab !== 'parallel') return;
    loadParallel();
    tickTimer = setInterval(() => {
      nowMs = Date.now();
    }, 1000);
    return () => {
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
    };
  });

  // Countdown kreuzt 0 → genau einmal auto-refetchen (refetchArmed entschärft Refetch-Sturm).
  $effect(() => {
    if (activeTab === 'parallel' && parallel && remainingSec !== null && remainingSec <= 0 && !refetchArmed) {
      refetchArmed = true;
      loadParallel();
    }
  });
```

Begründung Timer-Lifecycle: Der `$effect` liest `activeTab` als Reaktiv-Abhängigkeit. Wechselt der
Nutzer weg (oder unmountet die Component), feuert die zurückgegebene Cleanup-Funktion und
`clearInterval` stoppt den Timer; ein erneuter Eintritt in den Tab startet einen frischen Timer.
`nowMs` treibt `remainingSec` (ein `$derived`), sodass der Countdown ohne manuelles Re-Rendering
jede Sekunde neu berechnet wird. `refetchArmed` ist bewusst eine schlichte Nicht-Reaktiv-Variable
(reine Idempotenz-Sperre); `loadParallel` setzt sie bei Erfolg zurück, weil `nextTickAt` dann
wieder in der Zukunft liegt.

### Task 2.3 — Tab-Eintrag in der `AdminTabs`-Leiste ergänzen

**Anker: nach Z60** (`{ id: 'abhaengigkeiten', label: 'Abhängigkeiten' },`) und vor `]}` in Z61
die neue Zeile einfügen:

```svelte
      { id: 'parallel', label: 'Parallel' },
```

### Task 2.4 — Inline-Panel-Markup als neuen `{:else if}`-Zweig ergänzen

**Anker: vor Z91** (`{/if}`, dem Abschluss der bestehenden `{#if activeTab === …}`-Kette;
konkret zwischen dem `abhaengigkeiten`-Block in Z87–90 und `{/if}` in Z91) den folgenden Zweig
einfügen:

```svelte
{:else if activeTab === 'parallel'}
  <div class="parallel-tab-wrap">
    {#if parallelError}
      <div class="parallel-panel__error">
        <p>Parallel-Status nicht ladbar: {parallelError}</p>
        <button onclick={loadParallel} disabled={parallelLoading}>Erneut laden</button>
      </div>
    {:else if parallel}
      <div class="parallel-panel__grid">
        <div class="parallel-stat">
          <span class="parallel-stat__num">{parallel.gangTickets}</span>
          <span class="parallel-stat__label">Gang-Tickets</span>
        </div>
        <div class="parallel-stat">
          <span class="parallel-stat__num">{parallel.slotsClaimed}</span>
          <span class="parallel-stat__label">Slots belegt</span>
        </div>
        <div class="parallel-stat">
          <span class="parallel-stat__num">{parallel.slotsPerBrand}</span>
          <span class="parallel-stat__label">Slots / Brand</span>
        </div>
      </div>
      <div class="parallel-panel__tick">
        {#if remainingSec !== null && remainingSec <= 0}
          <span class="parallel-panel__due">Tick fällig</span>
        {:else if remainingSec !== null}
          <span class="parallel-panel__countdown">Nächster Tick in {fmtCountdown(remainingSec)}</span>
        {:else}
          <span class="parallel-panel__countdown">Kein Tick geplant</span>
        {/if}
        <button class="parallel-panel__force" onclick={forceTick} disabled={forcing}>
          {forcing ? 'Wird ausgelöst…' : 'Force next tick'}
        </button>
      </div>
    {:else}
      <div class="parallel-panel__loading">Lade Parallel-Status…</div>
    {/if}
  </div>
```

Verhaltens-Kontrakt (aus `design.md`): Fetch-Fehler → Fehlermeldung **statt** Zahlen; der Button
ist während des laufenden Requests (`forcing`) disabled; `remainingSec <= 0` rendert `Tick fällig`
und der zweite `$effect` triggert genau einen Auto-Refetch.

### Task 2.5 — Panel-Styles ergänzen

**Anker: vor Z114** (`</style>`) die Regeln einfügen. Sie nutzen die bestehenden
`--admin-*`-CSS-Variablen (siehe `ControlPanel.svelte`-Styles), damit das Panel sich ins
Admin-Theme einfügt:

```svelte
  .parallel-tab-wrap {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .parallel-panel__grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
  }

  .parallel-stat {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1rem;
    background: var(--admin-surface, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--admin-border, rgba(255, 255, 255, 0.07));
    border-radius: var(--admin-radius-md, 8px);
  }

  .parallel-stat__num {
    font-size: 1.75rem;
    font-family: var(--admin-font-mono);
    color: var(--admin-text-primary);
  }

  .parallel-stat__label {
    font-size: var(--admin-text-sm, 0.85rem);
    color: var(--admin-text-secondary);
  }

  .parallel-panel__tick {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-family: var(--admin-font-mono);
    color: var(--admin-text-secondary);
  }

  .parallel-panel__due {
    color: var(--admin-error);
    font-weight: 600;
  }

  .parallel-panel__force {
    padding: 0.5rem 1.25rem;
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    border-radius: var(--admin-radius-md);
    color: var(--admin-text-primary);
    cursor: pointer;
    font-family: var(--admin-font-mono);
  }

  .parallel-panel__force:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .parallel-panel__error p {
    margin: 0 0 1rem;
    color: var(--admin-error);
  }

  .parallel-panel__loading {
    padding: 1.5rem;
    font-family: var(--admin-font-mono);
    color: var(--admin-text-secondary);
  }

  @media (max-width: 768px) {
    .parallel-panel__grid {
      grid-template-columns: 1fr;
    }
  }
```

**CQ02:** Alle neuen Typen sind explizit (`interface ParallelStatus`, typisierte `$state`/`$derived`);
keine expliziten Untyped-Zusicherungen im Fehlerpfad (`err instanceof Error`-Narrowing statt
Untyped-Cast) — die CQ02-Zählung in `website/src` steigt nicht.

---

## File: `website/src/pages/admin/pipeline.astro`

Ist 32 Zeilen · Budget 368 (`.astro`-Limit 400, nicht baselined). Reine Verdrahtung — die
Server-Guard (`getSession`/`isAdmin`) und `initialTab`-Auflösung bleiben unverändert; nur die
`Tab`-Union und die `ALLOWED`-Allowlist müssen `parallel` kennen, sonst fällt `?tab=parallel` auf
`'factory'` zurück (Zeile 24).

### Task 2.6 — `Tab`-Union um `parallel` erweitern

**Anker Z21** — ersetzen:

```astro
type Tab = 'factory' | 'planung' | 'analytics' | 'kosten' | 'control' | 'abhaengigkeiten' | 'parallel';
```

### Task 2.7 — `ALLOWED`-Allowlist um `parallel` erweitern

**Anker Z22** — ersetzen (schaltet den Deep-Link `?tab=parallel` frei, damit
`initialTab` in Z24 den Wert durchlässt statt auf `'factory'` zu defaulten):

```astro
const ALLOWED: Tab[] = ['factory', 'planung', 'analytics', 'kosten', 'control', 'abhaengigkeiten', 'parallel'];
```

<!-- vitest: kein neuer Test nötig, weil P2 reine UI-Verdrahtung ist (Tab-Union + Inline-Panel);
     die testbare Kernlogik (deriveParallelStatus/deriveNextTickAt, Countdown-Grenzfall) liegt in
     lib/parallel-status.ts und wird vom P3-Partial via vitest abgedeckt. -->

## Abhängigkeiten & Reihenfolge

- P2 ist zur Compile-Zeit unabhängig von P1/P3 (disjunkte Dateien) und kann parallel gestaget
  werden. Zur **Laufzeit** liefern erst die P1-Endpoints echte Daten; bis dahin rendert das Panel
  bei fehlendem Endpoint sauber den Fehlerzweig (`parallelError`) statt Zahlen.
- Kein Brand-Domain-Literal, kein neues Manifest/Skript (S3/S4 nicht berührt).
