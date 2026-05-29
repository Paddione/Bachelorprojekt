<script lang="ts">
  interface Props {
    route: string;
  }

  let { route }: Props = $props();

  let ts = $state(Date.now());

  function reload() {
    ts = Date.now();
  }

  let src = $derived(`${route}${route.includes('?') ? '&' : '?'}_=${ts}`);
</script>

<div class="mt-4 space-y-2">
  <div class="flex items-center justify-between">
    <p class="text-xs text-muted font-mono">{route}</p>
    <button
      onclick={reload}
      class="px-3 py-1 text-xs bg-dark border border-dark-lighter text-muted hover:text-light hover:border-gold/50 rounded-lg transition-colors"
    >
      Neu laden
    </button>
  </div>
  <iframe
    {src}
    class="w-full border-0 rounded bg-dark"
    style="height: 600px;"
    title="Vorschau"
  ></iframe>
</div>
