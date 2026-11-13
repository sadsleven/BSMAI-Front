import { describe, expect, it } from 'vitest';
import {
  paidUsdOf,
  payableProviderKey,
  payablesSummaryByProvider,
  pendingUsdOf,
} from './payablesSummary';
import type { ReportPayableRow } from '../infrastructure/reportsGateway';

/**
 * Fila de cuentas por pagar con lo mínimo que usa la matemática. El resto de
 * los campos no interviene en los montos.
 */
function fila(partial: Partial<ReportPayableRow>): ReportPayableRow {
  return {
    orderId: 'o1',
    orderNumber: '1',
    invoiceNumber: '',
    controlNumber: '',
    invoiceDate: null,
    internalNumber: '1',
    orderDate: '2026-07-01',
    branchId: 'b1',
    branchName: 'Sede',
    providerType: 'doctor',
    providerId: 'doc-1',
    providerName: 'DR. GRANADO',
    patientName: 'Paciente',
    insuranceName: null,
    procedure: null,
    facturacionUsd: 0,
    personType: 'natural',
    grossUsd: 0,
    billingRateBs: 100,
    grossBs: 0,
    retentionBs: 0,
    netBs: 0,
    payableId: null,
    payableNumber: null,
    paymentDate: null,
    paymentReference: null,
    payments: [],
    payableGrossUsd: null,
    payableCoveredUsd: null,
    payablePendingUsd: null,
    settlements: [],
    state: 'sin_lote',
    ...partial,
  };
}

/** Lote L1: dos órdenes (400 + 15) con un abono parcial de 300. */
const LOTE_PARCIAL = [
  fila({
    orderId: 'o1',
    grossUsd: 400,
    payableId: 'L1',
    state: 'partially_paid',
    payableGrossUsd: 415,
    payableCoveredUsd: 300,
    payablePendingUsd: 115,
  }),
  fila({
    orderId: 'o2',
    grossUsd: 15,
    payableId: 'L1',
    state: 'partially_paid',
    payableGrossUsd: 415,
    payableCoveredUsd: 300,
    payablePendingUsd: 115,
  }),
];

describe('payableProviderKey', () => {
  it('usa el id del proveedor', () => {
    expect(payableProviderKey(fila({}))).toBe('doctor:doc-1');
    expect(
      payableProviderKey(
        fila({ providerType: 'care_center', providerId: 'cc-9' }),
      ),
    ).toBe('care_center:cc-9');
  });

  it('cae al nombre cuando no hay id', () => {
    expect(
      payableProviderKey(fila({ providerId: null, providerName: 'SIN ID' })),
    ).toBe('doctor:SIN ID');
  });
});

describe('pendingUsdOf', () => {
  it('una orden sin lote debe su bruto completo', () => {
    expect(pendingUsdOf([fila({ grossUsd: 5 })])).toBe(5);
  });

  it('descuenta el abono de un lote con pago parcial', () => {
    // 400 + 15 de bruto, menos los 300 abonados.
    expect(pendingUsdOf(LOTE_PARCIAL)).toBe(115);
  });

  it('no resta el abono dos veces aunque el lote tenga varias órdenes', () => {
    // Si se descontara por fila daría 415 − 600 = 0 y taparía la deuda real.
    expect(pendingUsdOf(LOTE_PARCIAL)).not.toBe(0);
  });

  it('un lote pagado no deja saldo', () => {
    const pagado = fila({
      grossUsd: 20,
      payableId: 'L2',
      state: 'paid',
      payableGrossUsd: 20,
      payableCoveredUsd: 20,
      payablePendingUsd: 0,
    });
    expect(pendingUsdOf([pagado])).toBe(0);
  });

  it('nunca da negativo si se abonó de más', () => {
    const sobrepagado = fila({
      grossUsd: 10,
      payableId: 'L3',
      state: 'partially_paid',
      payableCoveredUsd: 999,
    });
    expect(pendingUsdOf([sobrepagado])).toBe(0);
  });

  it('sin filas devuelve cero', () => {
    expect(pendingUsdOf([])).toBe(0);
  });

  it('redondea a dos decimales', () => {
    const r = fila({
      grossUsd: 0.1,
      payableId: 'L4',
      state: 'partially_paid',
      payableCoveredUsd: 0.02,
    });
    expect(pendingUsdOf([r])).toBe(0.08);
  });
});

describe('paidUsdOf', () => {
  it('cuenta el abono del lote una sola vez', () => {
    expect(paidUsdOf(LOTE_PARCIAL)).toBe(300);
  });

  it('suma los abonos de lotes distintos', () => {
    const otro = fila({
      orderId: 'o3',
      payableId: 'L2',
      state: 'paid',
      payableCoveredUsd: 20,
    });
    expect(paidUsdOf([...LOTE_PARCIAL, otro])).toBe(320);
  });

  it('las órdenes sin lote no aportan abonos', () => {
    expect(paidUsdOf([fila({ grossUsd: 5 })])).toBe(0);
  });
});

describe('payablesSummaryByProvider', () => {
  const FILAS = [
    ...LOTE_PARCIAL,
    fila({ orderId: 'o3', grossUsd: 5 }), // suelta, mismo doctor
    fila({
      orderId: 'o4',
      providerType: 'care_center',
      providerId: 'cc-1',
      providerName: 'CENTRO RX',
      grossUsd: 20,
      payableId: 'L2',
      state: 'paid',
      payableGrossUsd: 20,
      payableCoveredUsd: 20,
      payablePendingUsd: 0,
    }),
  ];

  it('agrupa por proveedor y cuenta sus renglones', () => {
    const filas = payablesSummaryByProvider(FILAS);
    expect(filas).toHaveLength(2);
    const granado = filas.find((f) => f.name === 'DR. GRANADO')!;
    expect(granado.ordersCount).toBe(3);
    expect(granado.providerType).toBe('doctor');
  });

  it('el total es el bruto y el pendiente descuenta lo abonado', () => {
    const granado = payablesSummaryByProvider(FILAS).find(
      (f) => f.name === 'DR. GRANADO',
    )!;
    expect(granado.grossUsd).toBe(420); // 400 + 15 + 5
    expect(granado.paidUsd).toBe(300);
    expect(granado.pendingUsd).toBe(120); // 115 del lote + 5 de la suelta
  });

  it('un proveedor saldado queda en cero', () => {
    const centro = payablesSummaryByProvider(FILAS).find(
      (f) => f.name === 'CENTRO RX',
    )!;
    expect(centro.grossUsd).toBe(20);
    expect(centro.paidUsd).toBe(20);
    expect(centro.pendingUsd).toBe(0);
  });

  it('ordena de mayor a menor por lo que falta pagar', () => {
    const filas = payablesSummaryByProvider(FILAS);
    expect(filas.map((f) => f.name)).toEqual(['DR. GRANADO', 'CENTRO RX']);
  });

  it('el total de la tabla cuadra con la suma de las filas', () => {
    const filas = payablesSummaryByProvider(FILAS);
    const sumaPendiente = filas.reduce((a, f) => a + f.pendingUsd, 0);
    expect(sumaPendiente).toBe(120);
    expect(sumaPendiente).toBe(pendingUsdOf(FILAS));
  });

  it('sin filas devuelve una lista vacía', () => {
    expect(payablesSummaryByProvider([])).toEqual([]);
  });
});
