<script lang="ts">
  import { onMount } from 'svelte';
  import PilotLight from '../sdlc/factory/PilotLight.svelte';
  import type { CockpitMode } from './CommandBar.svelte';

  export type Phase = 'triage' | 'planung' | 'bauen' | 'review' | 'deploy' | 'ship';

  interface RailSection {
    id: string;
    label: string;
    items: RailItem[];
  }

  interface RailItem {
    key: string;
    label: string;
    value: string;
    status?: 'green' | 'amber' | 'red';
    href?: string;
  }

  let { mode = 'overview', phase = 'bauen' as Phase, brand = 'mentolder' }: {
    mode: CockpitMode;
    phase?: Phase;
    brand: string;
  } = $props();

  let sections = $state<RailSection[]>([]);
  let loading = $state(true);

  function buildSections(): RailSection[] {
    switch (mode) {
      case 'overview':
        return [
          {
            id: 'attention',
            label: 'Aufmerksamkeit',
            items: [
              { key: 'blocked', label: 'Blockiert', value: '—' },
              { key: 'stuck', label: 'Festgefahren', value: '—' },
              { key: 'cooldown', label: 'Cooldown', value: '—' },
            ],
          },
          {
            id: 'epics',
            label: 'Laufende Epics',
            items: [], // Populated from portfolio API
          },
          {
            id: 'agents',
            label: 'Aktive Agenten',
            items: [
              { key: 'count', label: 'Agenten aktiv', value: '—' },
            ],
          },
          {
            id: 'models',
            label: 'Modell-Server',
            items: [
              { key: 'factory', label: 'Factory (8091)', value: '—', status: 'green' },
              { key: 'throughput', label: 'Throughput (8092)', value: '—', status: 'green' },
            ],
          },
        ];

      case 'fokus':
        switch (phase) {
          case 'planung':
            return [
              {
                id: 'planning',
                label: 'Planung',
                items: [
                  { key: 'dor', label: 'DoR-Score Ø', value: '—' },
                  { key: 'queue', label: 'Queue-Tiefe', value: '—' },
                  { key: 'ready', label: 'Ready', value: '—' },
                ],
              },
            ];
          case 'bauen':
            return [
              {
                id: 'factory',
                label: 'Factory',
                items: [
                  { key: 'slots', label: 'Slots belegt', value: '—' },
                  { key: 'active', label: 'Aktive Workpieces', value: '—' },
                  { key: 'lastTick', label: 'Letzter Tick', value: '—' },
                ],
              },
              {
                id: 'models',
                label: 'Modelle',
                items: [
                  { key: 'factory', label: 'Factory (8091)', value: '—', status: 'green' },
                  { key: 'throughput', label: 'Throughput (8092)', value: '—', status: 'green' },
                ],
              },
            ];
          case 'review':
            return [
              {
                id: 'prs',
                label: 'Pull Requests',
                items: [
                  { key: 'open', label: 'Offen', value: '—' },
                  { key: 'ci_pass', label: 'CI bestanden', value: '—' },
                  { key: 'ci_fail', label: 'CI fehlgeschlagen', value: '—' },
                ],
              },
            ];
          case 'deploy':
            return [
              {
                id: 'deploy',
                label: 'Deployment',
                items: [
                  { key: 'awaiting', label: 'Awaiting Deploy', value: '—' },
                  { key: 'flux', label: 'FluxCD Status', value: '—', status: 'green' },
                ],
              },
            ];
          case 'ship':
            return [
              {
                id: 'shipped',
                label: 'Ausgeliefert',
                items: [
                  { key: 'this_week', label: 'Diese Woche', value: '—' },
                  { key: 'last_week', label: 'Letzte Woche', value: '—' },
                ],
              },
            ];
          default:
            return [];
        }

      case 'insights':
        return [
          {
            id: 'metrics',
            label: 'Metriken',
            items: [
              { key: 'throughput', label: 'Durchsatz (7d)', value: '—' },
              { key: 'avg_time', label: 'Ø Zeit plan→done', value: '—' },
            ],
          },
          {
            id: 'traces',
            label: 'Traces',
            items: [
              { key: 'recorded', label: 'Aufgezeichnet', value: '—' },
              { key: 'today', label: 'Heute', value: '—' },
            ],
          },
        ];
    }
  }

  onMount(() => {
    sections = buildSections();
    loading = false;
  });

  // Re-build when mode or phase changes
  $effect(() => {
    // Reactively rebuild when props change
    void mode; void phase; // consume reactive deps
    sections = buildSections();
    loading = false;
  });
</script>

<aside class="cockpit-rail" data-testid="cockpit-rail">
  {#each sections as section}
    <div class="rail-section">
      <h3 class="rail-section__heading">{section.label}</h3>
      {#if section.items.length === 0}
        <p class="rail-section__empty">—</p>
      {:else}
        <ul class="rail-section__list">
          {#each section.items as item}
            <li class="rail-item">
              {#if item.status}
                <PilotLight state={item.status} size="sm" />
              {/if}
              <span class="rail-item__label">{item.label}</span>
              <span class="rail-item__value">{item.value}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/each}
</aside>

<style>
  .cockpit-rail {
    width: 240px;
    flex-shrink: 0;
    padding: 1rem;
    border-right: 1px solid var(--admin-border, rgba(255,255,255,0.07));
    background: var(--admin-surface, rgba(255,255,255,0.02));
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    overflow-y: auto;
  }

  .rail-section__heading {
    font-size: var(--admin-text-xs, 0.7rem);
    color: var(--admin-text-mute, #555);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0 0 0.5rem;
    font-family: var(--admin-font-mono, monospace);
  }

  .rail-section__empty {
    color: var(--admin-text-mute, #555);
    font-size: var(--admin-text-xs, 0.75rem);
    font-family: var(--admin-font-mono, monospace);
    margin: 0;
  }

  .rail-section__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .rail-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--admin-font-mono, monospace);
    font-size: var(--admin-text-xs, 0.75rem);
    color: var(--admin-text-secondary, #8892b0);
  }

  .rail-item__label {
    flex: 1;
  }

  .rail-item__value {
    color: var(--admin-text, #ccd6f6);
    font-weight: 600;
  }

  @media (max-width: 767px) {
    .cockpit-rail {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      max-height: 50vh;
      border-right: none;
      border-top: 1px solid var(--admin-border);
      transform: translateY(100%);
      transition: transform 0.3s ease;
      z-index: 100;
      border-radius: var(--admin-radius-md, 8px) var(--admin-radius-md, 8px) 0 0;
    }

    .cockpit-rail.open {
      transform: translateY(0);
    }
  }
</style>
