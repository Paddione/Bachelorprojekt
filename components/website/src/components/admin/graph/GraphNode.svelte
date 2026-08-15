<script lang="ts">
  import type { GraphNode as GNode, NodeStatus } from '../../../lib/graph-utils';

  interface Props {
    node: GNode & { x?: number; y?: number };
    status: NodeStatus | null;
    selected: boolean;
    onclick: (node: GNode) => void;
  }

  let { node, status, selected, onclick }: Props = $props();

  const x = $derived(node.x ?? 0);
  const y = $derived(node.y ?? 0);
  const strokeColor = $derived(status?.color ?? '#374151');
  const strokeDash = $derived(!status?.matched ? '4,3' : 'none');
  const label = $derived(node.name.length > 20 ? node.name.slice(0, 18) + '…' : node.name);
  const tooltipText = $derived(`${node.name}\n${node.namespace}\n${status?.detail ?? 'unbekannt'}`);

  function shapeNode(type: string) {
    switch (type) {
      case 'CronJob': return 'rect';
      case 'Service': return 'diamond';
      default: return 'circle';
    }
  }

  const shape = $derived(shapeNode(node.type));
</script>

<g
  transform="translate({x},{y})"
  class="graph-node"
  class:selected
  on:click={() => onclick(node)}
  role="button"
  tabindex="0"
  aria-label={node.name}
>
  <title>{tooltipText}</title>

  {#if shape === 'circle'}
    <circle r="18" fill="#1e293b" stroke={strokeColor} stroke-width={selected ? 3 : 2} stroke-dasharray={strokeDash} />
  {:else if shape === 'rect'}
    <rect x="-18" y="-14" width="36" height="28" rx="4" fill="#1e293b" stroke={strokeColor} stroke-width={selected ? 3 : 2} stroke-dasharray={strokeDash} />
  {:else}
    <polygon points="0,-20 20,0 0,20 -20,0" fill="#1e293b" stroke={strokeColor} stroke-width={selected ? 3 : 2} stroke-dasharray={strokeDash} />
  {/if}

  <text
    y="32"
    text-anchor="middle"
    fill="#94a3b8"
    font-size="10"
    font-family="ui-monospace, monospace"
    pointer-events="none"
  >{label}</text>
</g>

<style>
  .graph-node {
    cursor: pointer;
  }
  .graph-node:hover circle,
  .graph-node:hover rect,
  .graph-node:hover polygon {
    filter: brightness(1.3);
  }
  .selected circle,
  .selected rect,
  .selected polygon {
    filter: drop-shadow(0 0 6px rgba(99, 102, 241, 0.6));
  }
</style>
