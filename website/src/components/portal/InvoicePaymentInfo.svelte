<script lang="ts">
  export let invoice: {
    number: string;
    grossAmount: number;
    dueDate: string;
    status: string;
    paymentReference?: string;
    iban?: string;
    bic?: string;
    bankName?: string;
  };

  const fmt = (n: number) => n.toFixed(2).replace('.', ',') + ' €';
  const fmtDate = (d: string) => d.split('-').reverse().join('.');
</script>

{#if invoice.status === 'open'}
  <div class="sepa-box">
    <p class="sepa-label">Zahlung per SEPA-Überweisung</p>
    <table class="sepa-table">
      <tr><td>Betrag</td><td><strong>{fmt(invoice.grossAmount)}</strong></td></tr>
      <tr><td>Zahlungsziel</td><td>{fmtDate(invoice.dueDate)}</td></tr>
      <tr><td>Empfänger</td><td>{invoice.bankName ?? '—'}</td></tr>
      <tr><td>IBAN</td><td><code>{invoice.iban ?? '—'}</code></td></tr>
      <tr><td>BIC</td><td><code>{invoice.bic ?? '—'}</code></td></tr>
      <tr><td>Verwendungszweck</td><td><code>{invoice.paymentReference ?? invoice.number}</code></td></tr>
    </table>
  </div>
{/if}

<style>
  .sepa-box {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 1rem;
    margin-top: 0.75rem;
  }
  .sepa-label {
    font-size: 0.75rem;
    color: var(--mute-2);
    margin-bottom: 0.5rem;
    font-family: var(--font-mono);
    text-transform: uppercase;
  }
  .sepa-table {
    font-size: 0.875rem;
    border-collapse: collapse;
    width: 100%;
  }
  .sepa-table td {
    padding: 0.25rem 0.5rem;
  }
  .sepa-table td:first-child {
    color: var(--mute);
    width: 40%;
  }
  code {
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }
</style>
