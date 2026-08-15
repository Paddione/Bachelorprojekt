<script lang="ts">
  interface ProfileData {
    phone?: string; company?: string; address?: string; city?: string;
    postal_code?: string; country?: string;
    preferred_contact_channel?: string; communication_frequency?: string;
  }
  interface Props { profile: ProfileData | null; }
  let { profile }: Props = $props();

  let open = $state(false);
  let saving = $state(false);
  let message = $state('');
  let error = $state('');

  let form = $state<ProfileData>({
    phone: profile?.phone ?? '',
    company: profile?.company ?? '',
    address: profile?.address ?? '',
    city: profile?.city ?? '',
    postal_code: profile?.postal_code ?? '',
    country: profile?.country ?? 'DE',
    preferred_contact_channel: profile?.preferred_contact_channel ?? 'email',
    communication_frequency: profile?.communication_frequency ?? 'monatlich',
  });

  const CHANNELS = [
    { v: 'email', label: 'E-Mail' }, { v: 'phone', label: 'Telefon' }, { v: 'portal', label: 'Portal-Nachricht' },
  ];
  const FREQS = ['wöchentlich', 'zweiwöchentlich', 'monatlich', 'bei_bedarf'];

  async function save() {
    saving = true; message = ''; error = '';
    try {
      const res = await fetch('/api/portal/profile/update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { message = 'Profil gespeichert.'; setTimeout(() => window.location.reload(), 800); }
      else error = j.error || 'Fehler beim Speichern.';
    } catch { error = 'Netzwerkfehler.'; }
    finally { saving = false; }
  }
</script>

{#if !open}
  <button onclick={() => (open = true)}
    class="px-4 py-2 bg-[#21262d] border border-[#30363d] text-[#e5e5e5] rounded text-sm hover:border-[#f59e0b]/40 transition-colors">
    Profil bearbeiten
  </button>
{:else}
  <div class="rounded-lg border border-[#f59e0b]/30 bg-[#161b22] p-5" data-testid="profile-editor">
    <h3 class="text-xs font-mono uppercase tracking-widest text-[#a3a3a3] mb-4">Profil bearbeiten</h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
      <label class="text-sm text-[#a3a3a3]">Telefon
        <input bind:value={form.phone} maxlength="30" class="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-sm text-[#e5e5e5]" /></label>
      <label class="text-sm text-[#a3a3a3]">Firma
        <input bind:value={form.company} maxlength="100" class="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-sm text-[#e5e5e5]" /></label>
      <label class="text-sm text-[#a3a3a3] sm:col-span-2">Straße
        <input bind:value={form.address} maxlength="200" class="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-sm text-[#e5e5e5]" /></label>
      <label class="text-sm text-[#a3a3a3]">PLZ
        <input bind:value={form.postal_code} maxlength="10" class="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-sm text-[#e5e5e5]" /></label>
      <label class="text-sm text-[#a3a3a3]">Ort
        <input bind:value={form.city} maxlength="100" class="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-sm text-[#e5e5e5]" /></label>
      <label class="text-sm text-[#a3a3a3]">Kontaktkanal
        <select bind:value={form.preferred_contact_channel} class="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-sm text-[#e5e5e5]">
          {#each CHANNELS as c}<option value={c.v}>{c.label}</option>{/each}
        </select></label>
      <label class="text-sm text-[#a3a3a3]">Frequenz
        <select bind:value={form.communication_frequency} class="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-sm text-[#e5e5e5] capitalize">
          {#each FREQS as f}<option value={f}>{f}</option>{/each}
        </select></label>
    </div>
    <div class="flex items-center gap-3">
      <button onclick={save} disabled={saving}
        class="px-4 py-2 bg-[#f59e0b] text-[#0d1117] rounded text-sm font-semibold hover:bg-[#d97706] disabled:opacity-50">
        {saving ? '...' : 'Speichern'}
      </button>
      <button onclick={() => (open = false)} class="px-3 py-2 text-sm text-[#a3a3a3] hover:text-[#e5e5e5]">Abbrechen</button>
      {#if message}<span class="text-xs text-[#22c55e]">{message}</span>{/if}
      {#if error}<span class="text-xs text-[#ef4444]">{error}</span>{/if}
    </div>
  </div>
{/if}
