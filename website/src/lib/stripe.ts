// Stripe SDK removed — all billing is now handled natively via billing_invoices table.
// The `stripe` package itself is no longer a dependency, so there is no real SDK type to
// import. This stub only models the slice of the SDK surface actually called by the two
// remaining consumers (src/pages/api/admin/billing/[id]/item.ts,
// src/pages/stripe/success.astro) so callers keep type-checking without `any`.
interface StripeStub {
  invoices: {
    retrieve: (id: string) => Promise<unknown>;
  };
  invoiceItems: {
    retrieve: (id: string) => Promise<{ invoice: string | null }>;
  };
  checkout: {
    sessions: {
      retrieve: (
        id: string,
        opts?: { expand?: string[] },
      ) => Promise<{
        line_items?: { data: Array<{ description?: string | null }> };
        amount_total?: number | null;
        customer_details?: { email?: string | null } | null;
      }>;
    };
  };
}

export const stripe = null as unknown as StripeStub;
