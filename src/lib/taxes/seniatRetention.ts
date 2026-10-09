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

// -----------------------------------------------------------------------------
// Retención de un ABONO (pago parcial de una obligación mayor).
// -----------------------------------------------------------------------------

export interface SliceRetentionInput {
  /** Porción del bruto, en USD, que cubre el abono. */
  sliceUsd: number;
  /** Bruto total en USD de la obligación (el lote completo). */
  totalUsd: number;
  /** Tasa USD/Bs del abono. */
  rateBs: number;
  personType: SeniatPersonType;
  /** Valor de 1 UT en bolívares al momento del abono. */
  taxUnitBs: number;
}

export interface SliceRetentionResult extends RetentionResult {
  /** Proporción del bruto total que cubre el abono (0..1). */
  share: number;
  /** Bruto en Bs del abono (= `sliceUsd` × `rateBs`). */
  sliceGrossBs: number;
  /** Bruto en Bs del total a la tasa del abono (base del prorrateo). */
  totalGrossBs: number;
  /** Retención del total a la tasa del abono (antes de prorratear). */
  totalTaxAmountBs: number;
}

/**
 * Retención de ISLR de un abono: la retención del bruto TOTAL a la tasa de este
 * abono, por la proporción que el abono cubre. Así la suma de las retenciones
 * de los abonos de un lote (a una misma tasa) da la retención del lote
 * completo: el sustraendo y el mínimo no sujeto son del total, no de cada
 * abono. Espejo de `calcSliceRetention` del BE.
 */
export function calcSliceRetention(
  input: SliceRetentionInput,
): SliceRetentionResult {
  const sliceUsd = Math.max(0, Number(input.sliceUsd) || 0);
  const rawTotal = Number(input.totalUsd) || 0;
  const totalUsd = rawTotal > 0 ? rawTotal : sliceUsd;
  const rateBs = Number(input.rateBs) || 0;
  const share = totalUsd > 0 ? Math.min(1, sliceUsd / totalUsd) : 0;
  const totalGrossBs = round2(totalUsd * rateBs);
  const full = calcRetention({
    grossBs: totalGrossBs,
    personType: input.personType,
    taxUnitBs: input.taxUnitBs,
  });
  return {
    ...full,
    subtrahendBs: round2(full.subtrahendBs * share),
    taxAmountBs: round2(full.taxAmountBs * share),
    share,
    sliceGrossBs: round2(sliceUsd * rateBs),
    totalGrossBs,
    totalTaxAmountBs: full.taxAmountBs,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
