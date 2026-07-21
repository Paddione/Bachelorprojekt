<script lang="ts">
  let {
    terminalHost = 'terminal.localhost',
  }: {
    terminalHost?: string;
  } = $props();
</script>

<div class="terminal-wrapper">
  <iframe
    title="Agentic Terminal"
    src="https://${terminalHost}/"
    sandbox="allow-scripts allow-same-origin"
    class="terminal-iframe"
  ></iframe>
</div>

<style>
  .terminal-wrapper {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .terminal-iframe {
    width: 100%;
    height: 100%;
    border: none;
    background: #0b111c;
  }
</style>
