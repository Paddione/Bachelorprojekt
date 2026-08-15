<script lang="ts" module>
  type Toast = { id: number; text: string; kind: 'info' | 'ok' | 'warn' | 'err' };
  let toasts = $state<Toast[]>([]);
  let next = 1;

  export function pushToast(text: string, kind: Toast['kind'] = 'info') {
    const id = next++;
    toasts = [...toasts, { id, text, kind }];
    setTimeout(() => { toasts = toasts.filter(t => t.id !== id); }, 4500);
  }
</script>

<div data-testid="live-toasts" class="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
  {#each toasts as t (t.id)}
    <div class={`px-4 py-2 rounded-lg shadow-xl border text-sm pointer-events-auto
      ${t.kind==='ok'   ? 'bg-green-500/10 text-green-400 border-green-400/30' :
       t.kind==='warn' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-400/30' :
       t.kind==='err'  ? 'bg-red-500/10 text-red-400 border-red-400/30' :
                          'bg-dark-light text-light border-dark-lighter'}`}>
      {t.text}
    </div>
  {/each}
</div>
