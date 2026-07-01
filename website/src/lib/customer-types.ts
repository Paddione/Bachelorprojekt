/**
 * Customer Type Definitions
 *
 * Shared `Customer` shape used by website-db.ts and project-portal-db.ts.
 * Extracted to a neutral leaf module to avoid a website-db.ts <-> projects-db.ts
 * import cycle (G-SIZE03 / S2 quality gate).
 */

export interface Customer {
  id: string;
  name: string;
  email: string;
  customer_number?: string;
  admin_number?: string;
  is_admin?: boolean;
  phone?: string;
  company?: string;
}
