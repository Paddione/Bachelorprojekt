<script lang="ts">
  import type { ChatMessage } from '../lib/messaging-db';

  const {
    messagesBaseUrl,
    roomId,
    role: _role,
    senderId: _senderId,
    onclose,
    onshare,
  }: {
    messagesBaseUrl: string;
    roomId: number;
    role: 'admin' | 'user';
    senderId: string;
    onclose?: () => void;
    onshare?: (msg: ChatMessage) => void;
  } = $props();

  let sharePath = $state('');
  let shareType = $state(3);
  let sharePassword = $state('');
  let shareExpireDate = $state('');
  let shareNote = $state('');
  let shareSending = $state(false);
  let shareError = $state('');

  function handleClose() {
    sharePath = '';
    sharePassword = '';
    shareExpireDate = '';
    shareNote = '';
    shareError = '';
    onclose?.();
  }

  async function shareFile() {
    if (!sharePath.trim() || shareSending) return;
    shareSending = true;
    shareError = '';
    const body: Record<string, unknown> = { path: sharePath.trim(), shareType };
    if (shareType === 3 && sharePassword) body.password = sharePassword;
    if (shareType === 3 && shareExpireDate) body.expireDate = shareExpireDate;
    if (shareNote.trim()) body.note = shareNote.trim();
    try {
      const res = await fetch(`${messagesBaseUrl}/${roomId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json() as { message: ChatMessage };
        sharePath = '';
        sharePassword = '';
        shareExpireDate = '';
        shareNote = '';
        onshare?.(data.message);
        onclose?.();
      } else {
        const data = await res.json() as { error?: string };
        shareError = data.error ?? 'Fehler beim Teilen der Datei';
      }
    } catch {
      shareError = 'Netzwerkfehler';
    }
    shareSending = false;
  }
</script>

<div class="share-form">
  <div class="share-row">
    <input bind:value={sharePath} placeholder="Dateipfad (z.B. Clients/Kunde/dok.pdf)…" />
    <select bind:value={shareType}>
      <option value={3}>Öffentlicher Link</option>
      <option value={0}>Intern (Nutzer)</option>
    </select>
  </div>
  {#if shareType === 3}
    <div class="share-row">
      <input bind:value={sharePassword} type="text" placeholder="Passwort (optional)" />
      <input bind:value={shareExpireDate} type="date" placeholder="Ablaufdatum (optional)" />
    </div>
  {/if}
  <div class="share-row">
    <input bind:value={shareNote} placeholder="Notiz (optional)…" />
  </div>
  {#if shareError}
    <p class="share-error">{shareError}</p>
  {/if}
  <div class="share-actions">
    <button onclick={handleClose}>Abbrechen</button>
    <button class="btn-send" disabled={!sharePath.trim() || shareSending} onclick={shareFile}>
      {shareSending ? '…' : 'Datei teilen'}
    </button>
  </div>
</div>

<style>
  .share-form { border-top: 1px solid #2a2a3e; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; background: #13131f; }
  .share-row { display: flex; gap: 6px; }
  .share-row input, .share-row select { flex: 1; background: #1e1e2e; color: #e8e8f0; border: 1px solid #374151; border-radius: 4px; padding: 5px 8px; font-size: 12px; }
  .share-row select { flex: 0 1 auto; min-width: 150px; }
  .share-error { color: #fca5a5; font-size: 11px; margin: 0; }
  .share-actions { display: flex; justify-content: flex-end; gap: 6px; }
  .share-actions button { background: #374151; color: #ccc; border: none; border-radius: 4px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
  .share-actions .btn-send { background: #60a5fa; color: #000; }
  .share-actions .btn-send:disabled { opacity: .5; cursor: not-allowed; }
</style>
