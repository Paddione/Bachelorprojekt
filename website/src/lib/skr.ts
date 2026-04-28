export interface SkrInput {
  taxMode: 'kleinunternehmer' | 'regelbesteuerung' | string;
  type: 'income' | 'expense' | 'pretax' | 'vat_payment' | 'vat_refund' | string;
  category: string;
}

export function skrAccountFor(p: SkrInput): string {
  if (p.type === 'income') {
    return p.taxMode === 'kleinunternehmer' ? '8195' : '8400';
  }
  if (p.type === 'pretax') return '1576';
  if (p.type === 'vat_payment') return '1780';
  if (p.type === 'vat_refund') return '1781';
  return '4980';
}
