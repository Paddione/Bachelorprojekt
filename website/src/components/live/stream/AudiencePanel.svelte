<!--
  AudiencePanel: thin marker component to indicate where the host-side audience widgets live.
  The actual rendering is performed by StreamHandRaise / StreamReactions / StreamChat
  inside StreamPlayer when isHost=true. This component is kept as a boundary marker
  so future expansion (viewer count graph, chat moderation actions, Q&A queue) has
  a clear home without needing to crack open StreamPlayer.
-->
<script lang="ts">
  // No props for v1 — marker only.
</script>

<div data-testid="audience-panel" class="contents"></div>
