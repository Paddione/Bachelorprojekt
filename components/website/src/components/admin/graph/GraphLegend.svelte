<script lang="ts">
</script>

<div class="legend">
  <div class="legend-title">Status</div>
  <div class="legend-row">
    <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="none" stroke="#22c55e" stroke-width="2"/></svg>
    <span>Healthy</span>
  </div>
  <div class="legend-row">
    <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="none" stroke="#eab308" stroke-width="2"/></svg>
    <span>Degraded</span>
  </div>
  <div class="legend-row">
    <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="none" stroke="#ef4444" stroke-width="2"/></svg>
    <span>Kritisch</span>
  </div>
  <div class="legend-row">
    <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="none" stroke="#6b7280" stroke-width="2"/></svg>
    <span>CronJob</span>
  </div>
  <div class="legend-row">
    <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="none" stroke="#374151" stroke-width="2" stroke-dasharray="3,2"/></svg>
    <span>Unzugeordnet</span>
  </div>
  <div class="legend-title" style="margin-top:8px">Typen</div>
  <div class="legend-row">
    <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="#1e293b" stroke="#64748b" stroke-width="1.5"/></svg>
    <span>Deployment / StatefulSet</span>
  </div>
  <div class="legend-row">
    <svg width="14" height="14"><rect x="2" y="3" width="10" height="8" rx="2" fill="#1e293b" stroke="#64748b" stroke-width="1.5"/></svg>
    <span>CronJob</span>
  </div>
  <div class="legend-row">
    <svg width="14" height="14"><polygon points="7,1 13,7 7,13 1,7" fill="#1e293b" stroke="#64748b" stroke-width="1.5"/></svg>
    <span>Service</span>
  </div>
</div>

<style>
  .legend {
    position: absolute;
    bottom: 12px;
    left: 12px;
    background: rgba(15, 23, 42, 0.92);
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 11px;
    color: #94a3b8;
    font-family: ui-monospace, monospace;
    pointer-events: none;
    z-index: 10;
  }
  .legend-title {
    font-weight: 700;
    color: #e2e8f0;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 9px;
  }
  .legend-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }
</style>
