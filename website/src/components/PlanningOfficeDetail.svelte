<script lang="ts">
  const DOR_KEYS = ['spec_skizziert', 'offene_fragen_geklaert', 'abhaengigkeiten_klar', 'aufwand_geschaetzt'] as const;
  const DOR_LABEL: Record<string, string> = {
    spec_skizziert: 'Spec skizziert',
    offene_fragen_geklaert: 'Fragen geklärt',
    abhaengigkeiten_klar: 'Abhängigkeiten klar',
    aufwand_geschaetzt: 'Aufwand geschätzt',
  };

  interface PlanItem {
    extId: string;
    title: string;
    valueProp: string | null;
    priority: string;
    effort: string | null;
    areas: string[];
    dependsOn: string[];
    rank: number | null;
    readiness: Record<string, boolean>;
    dorScore: number;
    isNextCandidate: boolean;
    pinned: boolean;
  }

  let {
    item,
    override = $bindable(),
    newDep = $bindable(),
    patchFn,
    toggleDorFn,
    promoteFn,
    removeDepFn,
    addDepFn,
  }: {
    item: PlanItem;
    override: boolean;
    newDep: string;
    patchFn: (extId: string, body: Record<string, unknown>) => void;
    toggleDorFn: (item: PlanItem, key: string) => void;
    promoteFn: (item: PlanItem) => void;
    removeDepFn: (dep: string) => void;
    addDepFn: () => void;
  } = $props();
</script>

<h2 class="pb-detail-title">{item.title}</h2>
<label class="pb-field-label">Kern-Nutzen
  <textarea
    class="pb-textarea"
    value={item.valueProp ?? ''}
    onblur={(e) => patchFn(item.extId, { valueProp: (e.target as HTMLTextAreaElement).value })}
  ></textarea>
</label>
<fieldset class="pb-fieldset">
  <legend>Definition of Ready</legend>
  {#each DOR_KEYS as k}
    <label class="pb-check">
      <input type="checkbox" checked={item.readiness?.[k] === true} onchange={() => toggleDorFn(item, k)} />
      {DOR_LABEL[k]}
    </label>
  {/each}
</fieldset>
<div class="pb-deps">
  <span class="pb-field-label">Abhängigkeiten</span>
  <div class="pb-chips">
    {#each item.dependsOn as dep}
      <span class="pb-chip">{dep}<button class="pb-chip-x" onclick={() => removeDepFn(dep)}>×</button></span>
    {/each}
  </div>
  <input
    class="pb-dep-input"
    placeholder="Neue Abhängigkeit…"
    bind:value={newDep}
    onkeydown={(e) => { if (e.key === 'Enter') addDepFn(); }}
  />
</div>
<div class="pb-effort-btns">
  {#each ['klein', 'mittel', 'gross'] as eff}
    <button
      class="pb-effort-btn"
      class:active={item.effort === eff}
      onclick={() => patchFn(item.extId, { effort: eff })}
    >{eff}</button>
  {/each}
</div>
<label class="pb-check pb-override-check">
  <input type="checkbox" data-testid="pb-override" bind:checked={override} />
  Override (trotz &lt; 4/4)
</label>
<button
  class="pb-promote-btn"
  data-testid="pb-detail-promote"
  disabled={!override && item.dorScore < 4}
  onclick={() => promoteFn(item)}
>Als nächstes planen</button>

<style>
  .pb-detail-title {
    font-size: 1.1rem;
    margin: 0 0 12px;
    color: var(--pb-text);
  }

  .pb-field-label {
    display: block;
    font-size: 0.75rem;
    color: var(--pb-text-muted);
    margin-bottom: 4px;
  }

  .pb-textarea {
    width: 100%;
    min-height: 60px;
    background: var(--pb-bg);
    border: 1px solid var(--pb-border);
    color: var(--pb-text);
    border-radius: 4px;
    padding: 6px 8px;
    font-family: var(--pb-mono);
    font-size: 0.8rem;
    resize: vertical;
    box-sizing: border-box;
  }

  .pb-fieldset {
    border: 1px solid var(--pb-border);
    border-radius: 4px;
    padding: 8px 12px;
    margin: 12px 0;
  }

  .pb-fieldset legend {
    font-size: 0.75rem;
    color: var(--pb-text-muted);
  }

  .pb-check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    margin: 4px 0;
    cursor: pointer;
  }

  .pb-check input[type="checkbox"] {
    accent-color: var(--pb-amber);
  }

  .pb-deps {
    margin: 12px 0;
  }

  .pb-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 4px 0;
  }

  .pb-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--pb-bg);
    border: 1px solid var(--pb-border);
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 0.7rem;
    color: var(--pb-amber);
  }

  .pb-chip-x {
    background: none;
    border: none;
    color: var(--pb-text-muted);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0;
    line-height: 1;
  }

  .pb-chip-x:hover {
    color: #ef4444;
  }

  .pb-dep-input {
    width: 100%;
    background: var(--pb-bg);
    border: 1px solid var(--pb-border);
    color: var(--pb-text);
    border-radius: 4px;
    padding: 4px 8px;
    font-family: var(--pb-mono);
    font-size: 0.75rem;
    margin-top: 4px;
    box-sizing: border-box;
  }

  .pb-effort-btns {
    display: flex;
    gap: 6px;
    margin: 12px 0;
  }

  .pb-effort-btn {
    background: var(--pb-bg);
    border: 1px solid var(--pb-border);
    color: var(--pb-text-muted);
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--pb-mono);
    font-size: 0.75rem;
  }

  .pb-effort-btn.active {
    border-color: var(--pb-amber);
    color: var(--pb-amber);
    background: var(--pb-selected-bg);
  }

  .pb-override-check {
    margin: 12px 0 8px;
  }

  .pb-promote-btn {
    width: 100%;
    padding: 8px;
    background: var(--pb-amber);
    color: var(--pb-bg);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--pb-mono);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .pb-promote-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
