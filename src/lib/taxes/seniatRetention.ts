/**
 * Espejo FE del cálculo SENIAT de retención de ISLR sobre honorarios
 * profesionales no mercantiles (Decreto 1.808). Mantener en sync con
 * `afmi-backend/src/shared/utils/seniat-retention.ts`.
 */

export const SENIAT_FACTOR = 83.33334;
export const PJD_TAX_RATE = 0.05;
export const PNR_TAX_RATE = 0.03;

export type SeniatPersonType = 'natural' | 'legal_entity';

export interface RetentionInput {
  /** Totalpagado al proveedor, en bolívares (Bs). */
  grossBs: number;
  personType: SeniatPersonType;
  /** Valor de 1 UT en bolívares al momento del cálculo. */
  taxUnitBs: number;
}

export interface RetentionResult {
  taxRate: number;
  subtrahendBs: number;
  thresholdBs: number;
  taxAmountBs: number;
  belowThreshold: boolean;
}

export function pnrSubtrahend(taxUnitBs: number): number {
  return round2(taxUnitBs * PNR_TAX_RATE * SENIAT_FACTOR);
}

export function pnrThreshold(taxUnitBs: number): number {
  return round2(taxUnitBs * SENIAT_FACTOR);
}

export function calcRetention(input: RetentionInput): RetentionResult {
  const gross = Number(input.grossBs) || 0;
  const ut = Number(input.taxUnitBs) || 0;

  if (input.personType === 'legal_entity') {
    return {
      taxRate: PJD_TAX_RATE,
      subtrahendBs: 0,
      thresholdBs: 0,
      taxAmountBs: round2(gross * PJD_TAX_RATE),
      belowThreshold: false,
    };
  }

  const threshold = pnrThreshold(ut);
  const subtrahend = pnrSubtrahend(ut);

  if (gross <= threshold) {
    return {
      taxRate: PNR_TAX_RATE,
      subtrahendBs: subtrahend,
      thresholdBs: threshold,
      taxAmountBs: 0,
      belowThreshold: true,
    };
  }

  const raw = gross * PNR_TAX_RATE - subtrahend;
  return {
    taxRate: PNR_TAX_RATE,
    subtrahendBs: subtrahend,
    thresholdBs: threshold,
    taxAmountBs: Math.max(0, round2(raw)),
    belowThreshold: false,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
