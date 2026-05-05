import { getSiteSetting } from './website-db';

export async function calculateGewSt(brand: string, profit: number): Promise<any> {
  const hebesatz = Number(await getSiteSetting(brand, 'tax_gewst_hebesatz') || 400);
  const freibetrag = 24500;
  
  const gewerbeertrag = Math.max(0, profit);
  const gekuerzterErtrag = Math.max(0, gewerbeertrag - freibetrag);
  const abgerundet = Math.floor(gekuerzterErtrag / 100) * 100;
  
  const steuermesszahl = 0.035;
  const steuermessbetrag = round2(abgerundet * steuermesszahl);
  
  const gewerbesteuer = round2(steuermessbetrag * (hebesatz / 100));
  
  return {
    profit,
    gekuerzterErtrag,
    abgerundet,
    steuermessbetrag,
    hebesatz,
    gewerbesteuer
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function calculate15aCorrection(brand: string, params: {
  acquisitionCost: number,
  vatRate: number,
  usageYear: number,
  totalUsageYears: number,
  initialBusinessUsage: number,
  newBusinessUsage: number
}) {
  const initialVat = round2(params.acquisitionCost * (params.vatRate / 100));
  const vatPerYear = round2(initialVat / params.totalUsageYears);
  
  const diffUsage = params.newBusinessUsage - params.initialBusinessUsage;
  const correction = round2(vatPerYear * diffUsage);
  
  return {
    initialVat,
    vatPerYear,
    diffUsage,
    correction,
    direction: correction > 0 ? 'Nachzahlung an FA' : 'Erstattung vom FA'
  };
}
