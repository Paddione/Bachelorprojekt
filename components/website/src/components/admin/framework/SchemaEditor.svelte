<script lang="ts">
  import { onMount } from 'svelte';
  import { createBehaviorStore } from '$lib/admin/behaviorStore';
  import { validateAgainst } from '$lib/admin/validate';
  import { postContentSave } from '$lib/admin/content-client';
  import { STAMMDATEN_TOKENS } from '$lib/legal-tokens';
  import type { SectionSchema, FieldSchema } from '$lib/admin/schema-types';
  import SectionFrame from './SectionFrame.svelte';

  type ContentValue = Record<string, unknown>;

  interface Props {
    schema: SectionSchema;
    initialValue: ContentValue;
    initialVersion: number;
    saveFn?: (contentKey: string, baseVersion: number, value: ContentValue) => Promise<{ version: number }>;
  }

  let { schema, initialValue, initialVersion, saveFn }: Props = $props();

  const resolvedSaveFn = saveFn ?? postContentSave;

  const store = createBehaviorStore({
    contentKey: schema.contentKey,
    initialValue,
    initialVersion,
    validate: (v) => validateAgainst(schema.fields, v),
    saveFn: resolvedSaveFn,
  });

  let currentValue = $state<ContentValue>({ ...initialValue });

  onMount(() => {
    const unsub = store.subscribe((s) => {
      // Keep local currentValue in sync only when external update occurs (e.g. conflict resolution)
      if (s.state !== 'dirty') {
        currentValue = { ...s.value };
      }
    });
    return unsub;
  });

  function setField(key: string, val: unknown) {
    currentValue = { ...currentValue, [key]: val };
    store.setValue(currentValue);
  }


  function getErrors(fieldKey: string): string[] {
    return store.get().errors.filter((e) => e.field === fieldKey).map((e) => e.message);
  }

  function insertTokenAtCursor(textarea: HTMLTextAreaElement, token: string, key: string) {
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const before = (currentValue[key] ?? '') as string;
    const updated = before.slice(0, start) + token + before.slice(end);
    setField(key, updated);
    // Restore cursor after update (async to let DOM settle)
    requestAnimationFrame(() => {
      textarea.selectionStart = start + token.length;
      textarea.selectionEnd = start + token.length;
      textarea.focus();
    });
  }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
  const errorCls = 'text-xs text-red-400 mt-1';
</script>

{#snippet fieldRenderer(field: FieldSchema, value: unknown, onChange: (val: unknown) => void)}
  <div class="space-y-1">
    {#if field.type !== 'toggle'}
      <label class={labelCls}>{field.label}{field.validation?.required ? ' *' : ''}</label>
    {/if}

    {#if field.type === 'text' || field.type === 'image'}
      <input
        type="text"
        value={(value as string | undefined) ?? ''}
        oninput={(e) => onChange((e.target as HTMLInputElement).value)}
        class={inputCls}
      />

    {:else if field.type === 'textarea'}
      <textarea
        rows={4}
        value={(value as string | undefined) ?? ''}
        oninput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
        class="{inputCls} resize-y"
      ></textarea>

    {:else if field.type === 'html'}
      {#if field.tokens}
        <div class="flex flex-wrap gap-1 mb-2">
          {#each STAMMDATEN_TOKENS as token (token)}
            <button
              type="button"
              onclick={(e) => {
                const ta = (e.target as HTMLElement).closest('.field-html-wrap')?.querySelector('textarea') as HTMLTextAreaElement | null;
                if (ta) insertTokenAtCursor(ta, token, field.key);
              }}
              class="px-2 py-0.5 text-xs bg-dark border border-dark-lighter text-gold hover:bg-gold/10 rounded font-mono transition-colors"
            >{token}</button>
          {/each}
        </div>
      {/if}
      <div class="field-html-wrap">
        <textarea
          rows={6}
          value={(value as string | undefined) ?? ''}
          oninput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
          class="{inputCls} resize-y font-mono text-xs"
        ></textarea>
      </div>

    {:else if field.type === 'select'}
      <select
        value={(value as string | undefined) ?? ''}
        onchange={(e) => onChange((e.target as HTMLSelectElement).value)}
        class={inputCls}
      >
        <option value="">— Auswählen —</option>
        {#each (field.options ?? []) as opt (opt.value)}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>

    {:else if field.type === 'toggle'}
      <label class="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={!!value}
          onchange={(e) => onChange((e.target as HTMLInputElement).checked)}
          class="w-4 h-4 accent-gold"
        />
        <span class="text-sm text-light">{field.label}</span>
      </label>

    {:else if field.type === 'list'}
      <div class="space-y-2">
        {#if field.fields}
          <!-- Object list: each item is a sub-form -->
          {#each ((value ?? []) as Record<string, unknown>[]) as item, idx (idx)}
            <div class="flex gap-2 items-start p-3 bg-dark/50 border border-dark-lighter rounded-lg">
              <div class="flex-1 space-y-2">
                {#each (field.fields ?? []) as subField (subField.key)}
                  {@render fieldRenderer(
                    subField,
                    (item ?? {})[subField.key],
                    (val) => {
                      const arr = [...((value as Record<string, unknown>[]) ?? [])];
                      arr[idx] = { ...(arr[idx] ?? {}), [subField.key]: val };
                      onChange(arr);
                    }
                  )}
                {/each}
              </div>
              <button
                type="button"
                onclick={() => {
                  const arr = [...((value as Record<string, unknown>[]) ?? [])];
                  arr.splice(idx, 1);
                  onChange(arr);
                }}
                class="px-3 py-2 text-xs bg-dark border border-dark-lighter text-red-400 hover:text-red-300 rounded-lg transition-colors"
              >−</button>
            </div>
          {/each}
          <button
            type="button"
            onclick={() => {
              const empty: Record<string, unknown> = {};
              for (const sf of field.fields ?? []) empty[sf.key] = '';
              onChange([...((value as unknown[]) ?? []), empty]);
            }}
            class="px-3 py-1.5 text-xs bg-dark border border-dark-lighter text-muted hover:text-light hover:border-gold/50 rounded-lg transition-colors"
          >+ Hinzufügen</button>
        {:else}
          <!-- Flat string list (existing behavior) -->
          {#each ((value ?? []) as string[]) as item, idx (idx)}
            <div class="flex gap-2">
              <input
                type="text"
                value={item}
                oninput={(e) => {
                  const arr = [...((value as string[]) ?? [])];
                  arr[idx] = (e.target as HTMLInputElement).value;
                  onChange(arr);
                }}
                class="{inputCls} flex-1"
              />
              <button
                type="button"
                onclick={() => {
                  const arr = [...((value as string[]) ?? [])];
                  arr.splice(idx, 1);
                  onChange(arr);
                }}
                class="px-3 py-2 text-xs bg-dark border border-dark-lighter text-red-400 hover:text-red-300 rounded-lg transition-colors"
              >−</button>
            </div>
          {/each}
          <button
            type="button"
            onclick={() => onChange([...((value as string[]) ?? []), ''])}
            class="px-3 py-1.5 text-xs bg-dark border border-dark-lighter text-muted hover:text-light hover:border-gold/50 rounded-lg transition-colors"
          >+ Hinzufügen</button>
        {/if}
      </div>

    {:else if field.type === 'group'}
      <div class="pl-3 border-l-2 border-dark-lighter space-y-4 mt-2">
        {#each (field.fields ?? []) as subField (subField.key)}
          {@render fieldRenderer(
            subField,
            ((value as Record<string, unknown>) ?? {})[subField.key],
            (val) => onChange({ ...((value as Record<string, unknown>) ?? {}), [subField.key]: val })
          )}
        {/each}
      </div>
    {/if}

    {#if field.help && field.type !== 'toggle'}
      <p class="text-xs text-muted">{field.help}</p>
    {/if}

    {#each getErrors(field.key) as err (err)}
      <p class={errorCls}>{err}</p>
    {/each}
  </div>
{/snippet}

<SectionFrame contentKey={schema.contentKey} {store}>
  <div class="pt-4 space-y-6">
    {#each schema.fields as field (field.key)}
      {@render fieldRenderer(
        field,
        currentValue[field.key],
        (val) => setField(field.key, val)
      )}
    {/each}
  </div>
</SectionFrame>
