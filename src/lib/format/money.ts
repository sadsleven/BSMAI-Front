/**
 * Formateo de dinero unificado para AFMI.
 *
 * Salida fija "X.XXX,XX" — punto miles, coma decimal — independiente del
 * locale del navegador o de variaciones CLDR. Usar siempre estos helpers
 * para montos visibles al usuario (Bs, USD, EUR).
 *
 * Input crudo `toLocaleString('es-VE')` puede variar (NBSP, separadores)
 * entre Node/Chrome/Safari; `de-DE` garantiza "1.000,00".
 */

const NUMBER_FORMATTER_2 = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUMBER_FORMATTER_0 = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

/** Número plano "X.XXX,XX". `decimals` def 2. Nullish/NaN → `fallback`. */
export function formatMoney(
  value: number | string | null | undefined,
  options: { decimals?: number; fallback?: string } = {},
): string {
  const { decimals = 2, fallback = '—' } = options;
  const n = toNumber(value);
  if (n === null) return fallback;
  if (decimals === 2) return NUMBER_FORMATTER_2.format(n);
  if (decimals === 0) return NUMBER_FORMATTER_0.format(n);
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

/** Sufijo " Bs". Default 2 decimales. */
export function formatBs(
  value: number | string | null | undefined,
  options: { decimals?: number; fallback?: string; prefix?: boolean } = {},
): string {
  const { decimals = 2, fallback = '—', prefix = false } = options;
  const n = toNumber(value);
  if (n === null) return fallback;
  const body = formatMoney(n, { decimals });
  return prefix ? `Bs. ${body}` : `${body} Bs`;
}

/** Prefijo `$`. Default 2 decimales. */
export function formatUsd(
  value: number | string | null | undefined,
  options: { decimals?: number; fallback?: string } = {},
): string {
  const { decimals = 2, fallback = '—' } = options;
  const n = toNumber(value);
  if (n === null) return fallback;
  return `$${formatMoney(n, { decimals })}`;
}

/** Prefijo `€`. Default 2 decimales. */
export function formatEur(
  value: number | string | null | undefined,
  options: { decimals?: number; fallback?: string } = {},
): string {
  const { decimals = 2, fallback = '—' } = options;
  const n = toNumber(value);
  if (n === null) return fallback;
  return `€${formatMoney(n, { decimals })}`;
}

/** Bs compacto p/ ejes gráficos ("1,2 M"). */
export function formatBsCompact(
  value: number | string | null | undefined,
  options: { fallback?: string } = {},
): string {
  const { fallback = '—' } = options;
  const n = toNumber(value);
  if (n === null) return fallback;
  return `Bs. ${new Intl.NumberFormat('de-DE', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)}`;
}

/** Entero/decimal sin símbolo, formato VE. */
export function formatNumber(
  value: number | string | null | undefined,
  options: { decimals?: number; fallback?: string } = {},
): string {
  return formatMoney(value, options);
}

/** Porcentaje "X,XX%". Espera ya escalado (0.03 → "0,03%"; pasar 3 → "3,00%"). */
export function formatPercent(
  value: number | string | null | undefined,
  options: { decimals?: number; fallback?: string } = {},
): string {
  const { decimals = 1, fallback = '—' } = options;
  const n = toNumber(value);
  if (n === null) return fallback;
  return `${formatMoney(n, { decimals })}%`;
}
