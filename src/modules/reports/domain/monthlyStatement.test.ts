import { describe, expect, it } from 'vitest';
import {
  MONTHLY_STATEMENT_LABEL,
  isMonthlyStatementProvider,
  normalizeProviderName,
} from './monthlyStatement';

describe('normalizeProviderName', () => {
  it('quita acentos, puntuación y espacios de sobra', () => {
    expect(normalizeProviderName('  Laboratorio  Clínico, C.A. ')).toBe(
      'LABORATORIO CLINICO C A',
    );
  });

  it('un nombre ya limpio no cambia', () => {
    expect(normalizeProviderName('RISLAB')).toBe('RISLAB');
  });
});

describe('isMonthlyStatementProvider', () => {
  it('reconoce la razón social completa del seeder', () => {
    expect(
      isMonthlyStatementProvider('LABORATORIO CLÍNICO RISLAB ORIENTE C.A.'),
    ).toBe(true);
  });

  it('reconoce el nombre corto', () => {
    expect(isMonthlyStatementProvider('RISLAB')).toBe(true);
    expect(isMonthlyStatementProvider(MONTHLY_STATEMENT_LABEL)).toBe(true);
  });

  it('no distingue mayúsculas ni acentos', () => {
    expect(isMonthlyStatementProvider('rislab')).toBe(true);
    expect(
      isMonthlyStatementProvider('laboratorio clinico rislab oriente ca'),
    ).toBe(true);
  });

  it('lo reconoce aunque venga dentro de otro nombre', () => {
    expect(isMonthlyStatementProvider('LABORATORIO RISLAB ORIENTE')).toBe(true);
  });

  it('no confunde a otros proveedores', () => {
    expect(isMonthlyStatementProvider('URIMECA')).toBe(false);
    expect(isMonthlyStatementProvider('CENTRO DE RX')).toBe(false);
    expect(isMonthlyStatementProvider('TOMAS GRANADO')).toBe(false);
  });

  it('no matchea por coincidencia parcial de palabra', () => {
    // "RISLABORATORIO" no es RISLAB: el match es por palabra completa.
    expect(isMonthlyStatementProvider('RISLABORATORIO DEL ESTE')).toBe(false);
  });

  it('tolera vacío y nulo', () => {
    expect(isMonthlyStatementProvider('')).toBe(false);
    expect(isMonthlyStatementProvider(null)).toBe(false);
    expect(isMonthlyStatementProvider(undefined)).toBe(false);
  });
});
