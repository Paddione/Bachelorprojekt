<script lang="ts">
  // T008016/E4: Der API-Katalog ist in <ApiKatalog /> (einziger Konsument von
  // api-inventory.json unter components/leitstand/, Guard T3). Hier bleibt
  // Der Vorschau-Katalog wurde durch das Vollmodul ersetzt.
  import ApiKatalog from '../ApiKatalog.svelte';
  // E5 (T008017): Prompt-Bibliothek — Absorptionsmodul der aufgeloesten
  // /sdlc/prompts-Seite. Die API-Route /sdlc/api/prompt-library existiert
  // bereits (SSOT-Tabellenpfad), das Deck laedt die Vorlagen selbst
  // (?all=1 = inkl. inaktiver) — kein Direkt-DB-Zugriff aus der Komponente.
  import PromptLibraryManager from '../../admin/PromptLibraryManager.svelte';
  import type { Prompt } from '../../../lib/prompt-library-db';

  // ── Prompt-Bibliothek (E5): selbstladend wie die uebrigen Deck-Bereiche.
  //    $effect stoesst den Fetch beim Mount; der Cleanup guardt gegen
  //    Zustaende nach dem Dismount (DeckLeiste wechselt Decks per {#if}). ──
  let prompts = $state<Prompt[]>([]);
  let promptsLoaded = $state(false);
  let promptsError = $state<string | null>(null);

  $effect(() => {
    let cancelled = false;
    fetch('/sdlc/api/prompt-library?all=1')
      .then((res) => {
        if (cancelled) return null;
        if (!res.ok) { promptsError = `HTTP ${res.status}`; return null; }
        return res.json();
      })
      .then((body: { prompts?: Prompt[]; error?: string } | null) => {
        if (cancelled || body === null) return;
        if (body.error) { promptsError = body.error; return; }
        prompts = body.prompts ?? [];
        promptsLoaded = true;
      })
      .catch(() => { if (!cancelled) promptsError = 'Netzwerkfehler beim Laden.'; });
    return () => { cancelled = true; };
  });
</script>

<section class="deck-wissen" data-testid="deck-panel-wissen" data-purpose-id="deck-wissen">
  <h2 class="deck-wissen__heading">API-Katalog</h2>
  <ApiKatalog />

  <h2 class="deck-wissen__heading">Prompt-Bibliothek</h2>
  {#if promptsError}
    <p class="deck-wissen__error">{promptsError}</p>
  {:else if promptsLoaded}
    <PromptLibraryManager {prompts} />
  {:else}
    <p class="deck-wissen__hint">Lade Vorlagen…</p>
  {/if}
</section>

<style>
  .deck-wissen {
    padding: var(--ls-space-6, 1.5rem);
    display: flex;
    flex-direction: column;
    gap: var(--ls-space-4, 8px);
  }

  .deck-wissen__heading {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ls-text-muted, #707b8a);
    margin: var(--ls-space-4, 8px) 0 0;
  }

  .deck-wissen__empty {
    color: var(--ls-text-muted, #707b8a);
    font-size: 0.8rem;
    margin: 0;
  }

</style>
