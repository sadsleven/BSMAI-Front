/**
 * Proveedores que NO se pagan orden por orden: al cierre de cada mes pasan el
 * total de lo consumido y se les va abonando en montos grandes. Para ellos el
 * documento no es la hoja "EDO. DE CUENTA" del resto, sino un estado de cuenta
 * mensual aparte (total del mes + abonos + saldo corrido).
 *
 * Hoy es sólo el laboratorio RISLAB. Se identifica por nombre normalizado para
 * que dé igual si el centro trae su razón social completa o su nombre corto.
 */

/** Mayúsculas, sin acentos, sin puntuación y con un solo espacio entre palabras. */
export function normalizeProviderName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Razones sociales y nombres cortos que mapean al estado de cuenta mensual. */
const MONTHLY_STATEMENT_NAMES = new Set(
  [
    'LABORATORIO CLINICO RISLAB ORIENTE CA',
    'LABORATORIO RISLAB',
    'RISLAB',
  ].map(normalizeProviderName),
);

/** Rótulo del documento aparte (título de la hoja y del archivo). */
export const MONTHLY_STATEMENT_LABEL = 'RISLAB';

/**
 * ¿Este proveedor lleva estado de cuenta mensual? Acepta tanto la razón social
 * del seeder como el nombre corto; también cuando el nombre corto aparece como
 * palabra dentro de la razón social (p. ej. "LABORATORIO RISLAB ORIENTE").
 */
export function isMonthlyStatementProvider(
  name: string | null | undefined,
): boolean {
  if (!name) return false;
  const norm = normalizeProviderName(name);
  if (MONTHLY_STATEMENT_NAMES.has(norm)) return true;
  return norm.split(' ').includes(MONTHLY_STATEMENT_LABEL);
}
