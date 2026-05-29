<script lang="ts">
  import { createBehaviorStore } from '$lib/admin/behaviorStore';
  import { postContentSave } from '$lib/admin/content-client';
  import SectionFrame from './SectionFrame.svelte';

  interface Props {
    contentKey: string;
    initialValue: any;
    initialVersion: number;
    validate?: (v: any) => { field: string; message: string }[];
    saveFn?: (contentKey: string, baseVersion: number, value: any) => Promise<{ version: number }>;
    children?: import('svelte').Snippet<[{ store: ReturnType<typeof createBehaviorStore> }]>;
  }

  let { contentKey, initialValue, initialVersion, validate, saveFn, children }: Props = $props();

  const store = createBehaviorStore({
    contentKey,
    initialValue,
    initialVersion,
    validate: validate ?? (() => []),
    saveFn: saveFn ?? postContentSave,
  });
</script>

<SectionFrame {contentKey} {store}>
  {#if children}
    {@render children({ store })}
  {/if}
</SectionFrame>
