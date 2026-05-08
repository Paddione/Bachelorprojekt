<script lang="ts">
  let {
    open,
    onclose,
    onActivePoll,
  }: {
    open: boolean;
    onclose: () => void;
    onActivePoll?: (poll: { id: string; question: string; kind: string }) => void;
  } = $props();

  type Tpl = { label: string; question: string; kind: 'multiple_choice' | 'text'; options: string[] | null };
  let templates = $state<Tpl[]>([]);
  let loadedTemplates = false;

  async function ensureTemplates() {
    if (loadedTemplates) return;
    try {
      const r = await fetch('/api/admin/poll/templates');
      if (r.ok) templates = (await r.json() as { templates: Tpl[] }).templates;
    } catch {}
    loadedTemplates = true;
  }

  let selected = $state<number | 'custom' | null>(null);
  let question = $state('');
  let kind = $state<'multiple_choice' | 'text'>('text');
  let options = $state<string[]>([]);
  let result = $state<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  let busy = $state(false);

  function pick(i: number | 'custom') {
    selected = i;
    if (i === 'custom') {
      kind = 'text'; question = ''; options = [];
    } else {
      const t = templates[i];
      kind = t.kind; question = t.question;
      options = t.options ? [...t.options] : [];
    }
  }

  function valid(): boolean {
    if (question.trim().length < 2) return false;
    if (kind === 'multiple_choice') return options.filter(o => o.trim()).length >= 2;
    return true;
  }

  async function submit() {
    busy = true;
    result = null;
    try {
      const res = await fetch('/api/admin/poll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), kind, options: kind === 'multiple_choice' ? options.filter(o => o.trim()) : null }),
      });
      const data = await res.json() as { poll?: { id: string; question: string; kind: string }; error?: string; sent?: number; total?: number };
      if (res.ok && data.poll) {
        onActivePoll?.(data.poll);
        onclose();
      } else if (res.status === 409) {
        result = { kind: 'warn', text: 'Es läuft bereits eine Umfrage.' };
      } else {
        result = { kind: 'err', text: 'Fehler: ' + (data.error ?? 'Unbekannt') };
      }
    } catch { result = { kind: 'err', text: 'Netzwerkfehler.' }; }
    finally { busy = false; }
  }

  $effect(() => { if (open) ensureTemplates(); });
</script>

{#if open}
  <div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
       onclick={(e) => { if (e.currentTarget === e.target) onclose(); }} role="presentation">
    <div class="bg-dark-light rounded-2xl border border-dark-lighter max-w-lg w-full p-6 shadow-xl">
      <h2 class="text-xl font-serif text-light mb-2">📊 Umfrage starten</h2>

      <div class="flex flex-col gap-2 mb-4">
        {#each templates as t, i}
          <label class="flex items-center gap-3 px-3 py-2 rounded-lg border border-dark-lighter hover:border-gold/40 text-sm text-light cursor-pointer">
            <input type="radio" name="poll-tpl" value={i} checked={selected===i} onchange={() => pick(i)} class="accent-gold" />
            <span><strong>{t.label}</strong>
              <span class="text-muted ml-1">{t.options ? t.options.join(' · ') : 'Freitext'}</span></span>
          </label>
        {/each}
        <label class="flex items-center gap-3 px-3 py-2 rounded-lg border border-dark-lighter hover:border-gold/40 text-sm cursor-pointer">
          <input type="radio" name="poll-tpl" value="custom" checked={selected==='custom'} onchange={() => pick('custom')} class="accent-gold" />
          <span><strong style="color:#d7b06a">Eigene Frage…</strong>
            <span class="text-muted ml-1">Freitext-Antwort</span></span>
        </label>
      </div>

      {#if selected !== null}
        <div class="space-y-3 bg-dark rounded-xl border border-dark-lighter p-3 mb-4">
          <input type="text" bind:value={question} maxlength="200" placeholder="Ihre Frage…"
            class="w-full bg-dark-light border border-dark-lighter rounded-lg px-3 py-2 text-sm text-light focus:outline-none focus:border-gold" />
          {#if kind === 'multiple_choice'}
            <div class="flex flex-col gap-1.5">
              {#each options as opt, i}
                <div class="flex gap-1.5">
                  <input type="text" bind:value={options[i]} maxlength="100" placeholder="Option…"
                    class="flex-1 bg-dark-light border border-dark-lighter rounded-lg px-3 py-1.5 text-sm text-light focus:outline-none focus:border-gold" />
                  <button onclick={() => options = options.filter((_, j) => j !== i)}
                    class="px-2 text-muted hover:text-red-400 text-lg leading-none">×</button>
                </div>
              {/each}
              <button type="button" onclick={() => options = [...options, '']}
                class="mt-2 text-xs text-gold hover:text-gold/70 self-start">+ Option hinzufügen</button>
            </div>
          {/if}
        </div>
      {/if}

      {#if result}
        <p class="mb-4 text-sm" class:text-green-400={result.kind==='ok'} class:text-yellow-400={result.kind==='warn'} class:text-red-400={result.kind==='err'}>{result.text}</p>
      {/if}

      <div class="flex gap-2 justify-end">
        <button onclick={onclose} class="px-4 py-2 bg-dark rounded-lg border border-dark-lighter text-sm text-muted hover:text-light">Abbrechen</button>
        <button onclick={submit} disabled={busy || !valid()}
          class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold disabled:opacity-40">
          {busy ? '…' : '📊 Umfrage starten'}
        </button>
      </div>
    </div>
  </div>
{/if}
