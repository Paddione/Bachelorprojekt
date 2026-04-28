export interface SkrInput {
  taxMode: 'kleinunternehmer' | 'regelbesteuerung' | string;
  type: 'income' | 'expense' | 'pretax' | 'vat_payment' | 'vat_refund' | string;
  category: string;
}

export function skrAccountFor(p: SkrInput): string {
  if (p.type === 'income') {
    if (p.category === 'eu_b2b_services' || p.category === 'eu_b2b_goods') return '8338';
    if (p.category === 'drittland_export') return '8120';
    if (p.category === 'kursdifferenz_gewinn') return '2668';
    return p.taxMode === 'kleinunternehmer' ? '8195' : '8400';
  }
  if (p.type === 'expense') {
    if (p.category === 'kursdifferenz_verlust') return '4930';
    return '4980';
  }
  if (p.type === 'pretax') return '1576';
  if (p.type === 'vat_payment') return '1780';
  if (p.type === 'vat_refund') return '1781';
  return '4980';
}
