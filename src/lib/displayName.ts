/**
 * Nombre a mostrar de seguros y centros de atención.
 *
 * Los catálogos guardan la razón social completa ("C.N.A SEGUROS LA PREVISORA",
 * "UNIDAD RADIOLÓGICA DE IMÁGENES MÉDICAS, C.A. (URIMECA)") y, opcionalmente,
 * un nombre corto ("PREVISORA", "URIMECA"). En listados y reportes se usa el
 * corto: ocupa menos y se lee mejor. Las facturas, comprobantes SENIAT y demás
 * documentos legales siguen imprimiendo la razón social completa.
 */

/** Nombre corto si lo tiene; si no, el nombre completo. */
export function shortOrFull(
  shortName: string | null | undefined,
  fullName: string | null | undefined,
): string {
  return shortName?.trim() || fullName?.trim() || '';
}

/** Rótulo de un seguro para listados. */
export function insuranceLabel(
  insurance:
    | { name?: string | null; shortName?: string | null }
    | null
    | undefined,
): string {
  if (!insurance) return '';
  return shortOrFull(insurance.shortName, insurance.name);
}

/** Rótulo de un centro de atención para listados. */
export function careCenterLabel(
  center:
    | { businessName?: string | null; shortName?: string | null }
    | null
    | undefined,
): string {
  if (!center) return '';
  return shortOrFull(center.shortName, center.businessName);
}
