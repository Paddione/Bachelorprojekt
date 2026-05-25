<script lang="ts">
  import { onDestroy } from 'svelte';

  let imageFile: File | null = null;
  let imagePreview: string | null = null;
  let skinName = '';
  let jobId: string | null = null;
  let status: 'idle' | 'pending' | 'running' | 'done' | 'error' = 'idle';
  let errorMsg = '';
  let skinId: string | null = null;
  let recentJobs: Array<{id:string;name:string;status:string;skin_id:string|null;error_msg:string|null;created_at:string}> = [];
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function loadRecent() {
    const res = await fetch('/api/admin/generate-3d/status');
    if (res.ok) recentJobs = await res.json();
  }

  loadRecent();

  function onFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    imageFile = input.files?.[0] ?? null;
    if (imageFile) {
      const reader = new FileReader();
      reader.onload = () => { imagePreview = reader.result as string; };
      reader.readAsDataURL(imageFile);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    imageFile = e.dataTransfer?.files[0] ?? null;
    if (imageFile) {
      const reader = new FileReader();
      reader.onload = () => { imagePreview = reader.result as string; };
      reader.readAsDataURL(imageFile);
    }
  }

  async function startGeneration() {
    if (!imageFile || !skinName.trim()) return;
    status = 'pending';
    errorMsg = '';
    skinId = null;
    jobId = null;

    const form = new FormData();
    form.append('image', imageFile);
    form.append('name', skinName.trim());

    const res = await fetch('/api/admin/generate-3d', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) {
      status = 'error';
      errorMsg = data.error ?? 'Unknown error';
      return;
    }
    jobId = data.job_id;
    pollTimer = setInterval(poll, 3000);
  }

  async function poll() {
    if (!jobId) return;
    const res = await fetch(`/api/admin/generate-3d/status?id=${jobId}`);
    if (!res.ok) return;
    const job = await res.json();
    status = job.status;
    if (job.status === 'done') {
      skinId = job.skin_id;
      clearInterval(pollTimer!);
      pollTimer = null;
      loadRecent();
    } else if (job.status === 'error') {
      errorMsg = job.error_msg ?? 'Generation failed';
      clearInterval(pollTimer!);
      pollTimer = null;
      loadRecent();
    }
  }

  onDestroy(() => { if (pollTimer) clearInterval(pollTimer); });

  function statusLabel(s: string) {
    return { pending: '⏳ Queued', running: '🔄 Generating...', done: '✅ Done', error: '❌ Error' }[s] ?? s;
  }
</script>

<div class="studio">
  <div class="studio-form">
    <!-- Drop Zone -->
    <div
      class="drop-zone"
      class:has-image={!!imagePreview}
      on:dragover|preventDefault
      on:drop={onDrop}
      role="button"
      tabindex="0"
      on:click={() => (document.getElementById('file-input') as HTMLInputElement).click()}
      on:keydown={(e) => e.key === 'Enter' && (document.getElementById('file-input') as HTMLInputElement).click()}
    >
      {#if imagePreview}
        <img src={imagePreview} alt="preview" class="preview-img" />
      {:else}
        <span class="drop-hint">📎 Bild hier ablegen<br><small>oder klicken zum Auswählen</small></span>
      {/if}
    </div>
    <input id="file-input" type="file" accept="image/*" class="hidden-input" on:change={onFileChange} />

    <!-- Name Input -->
    <input
      class="name-input"
      type="text"
      placeholder="Skin-Name (z. B. Patrick Hero)"
      bind:value={skinName}
      maxlength="64"
    />

    <!-- Generate Button -->
    <button
      class="generate-btn"
      disabled={!imageFile || !skinName.trim() || status === 'pending' || status === 'running'}
      on:click={startGeneration}
    >
      {status === 'pending' || status === 'running' ? '⏳ Generating...' : '▶ Generate 3D Model'}
    </button>
  </div>

  <!-- Status Panel -->
  <div class="status-panel">
    {#if status === 'idle'}
      <p class="hint">Upload ein Bild und klick Generate.</p>
      <p class="hint-small">Generierung dauert ~2–5 Minuten.</p>
    {:else if status === 'pending'}
      <div class="status-badge pending">⏳ Job angenommen — warte auf ComfyUI...</div>
    {:else if status === 'running'}
      <div class="status-badge running">🔄 Hunyuan3D-2 generiert...</div>
      <div class="progress-bar"><div class="progress-inner"></div></div>
    {:else if status === 'done'}
      <div class="status-badge done">✅ Skin erstellt!</div>
      {#if skinId}
        <p class="skin-id">Skin-ID: <code>{skinId}</code></p>
        <p class="hint-small">Im Mayhem Hero-Select wählbar.</p>
      {/if}
    {:else if status === 'error'}
      <div class="status-badge error">❌ Fehler</div>
      <p class="error-msg">{errorMsg}</p>
    {/if}
  </div>
</div>

<!-- Recent Jobs -->
{#if recentJobs.length > 0}
  <section class="recent">
    <h3>Letzte Jobs</h3>
    <div class="job-list">
      {#each recentJobs as job}
        <div class="job-chip" class:done={job.status==='done'} class:error={job.status==='error'}>
          <span class="job-status">{statusLabel(job.status)}</span>
          <span class="job-name">{job.name}</span>
          {#if job.skin_id}<span class="job-meta">{job.skin_id}</span>{/if}
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  .studio {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    margin-bottom: 2rem;
  }
  @media (max-width: 768px) { .studio { grid-template-columns: 1fr; } }

  .drop-zone {
    border: 2px dashed rgba(255,255,255,0.3);
    border-radius: 8px;
    padding: 2rem;
    text-align: center;
    cursor: pointer;
    min-height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.2s;
  }
  .drop-zone:hover, .drop-zone.has-image { border-color: rgba(255,255,255,0.6); }
  .preview-img { max-width: 100%; max-height: 120px; border-radius: 4px; object-fit: contain; }
  .drop-hint { opacity: 0.6; line-height: 1.6; }
  .hidden-input { display: none; }

  .name-input {
    width: 100%;
    padding: 0.6rem 0.75rem;
    margin-top: 0.75rem;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.05);
    color: inherit;
    font-size: 1rem;
    min-height: 44px;
    box-sizing: border-box;
  }

  .generate-btn {
    margin-top: 0.75rem;
    width: 100%;
    min-height: 44px;
    padding: 0.6rem 1rem;
    border-radius: 6px;
    border: none;
    background: #b8860b;
    color: #000;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
  }
  .generate-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .status-panel { display: flex; flex-direction: column; gap: 0.5rem; }
  .status-badge { padding: 0.5rem 0.75rem; border-radius: 6px; font-weight: 500; }
  .pending { background: rgba(255,200,0,0.15); border: 1px solid rgba(255,200,0,0.4); }
  .running { background: rgba(0,150,255,0.15); border: 1px solid rgba(0,150,255,0.4); }
  .done    { background: rgba(0,200,80,0.15);  border: 1px solid rgba(0,200,80,0.4); }
  .error   { background: rgba(220,50,50,0.15); border: 1px solid rgba(220,50,50,0.4); }

  .progress-bar { height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; margin-top: 0.5rem; }
  .progress-inner { height: 100%; background: #0096ff; width: 60%; animation: slide 1.5s infinite ease-in-out; }
  @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }

  .hint { opacity: 0.5; margin: 0; }
  .hint-small { opacity: 0.4; font-size: 0.85em; margin: 0; }
  .skin-id { font-size: 0.85em; margin: 0.25rem 0 0; }
  .error-msg { color: #ff6b6b; font-size: 0.9em; margin: 0.25rem 0 0; word-break: break-word; }

  .recent h3 { margin: 0 0 0.5rem; font-size: 0.9em; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em; }
  .job-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .job-chip {
    display: flex; gap: 0.5rem; align-items: center;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    padding: 0.35rem 0.65rem;
    font-size: 0.82em;
    min-height: 44px;
  }
  .job-chip.done  { border-color: rgba(0,200,80,0.3); }
  .job-chip.error { border-color: rgba(220,50,50,0.3); }
  .job-name { font-weight: 500; }
  .job-meta { opacity: 0.5; font-size: 0.85em; }
</style>
