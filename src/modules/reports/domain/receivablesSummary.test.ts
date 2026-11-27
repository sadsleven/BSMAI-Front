import { describe, expect, it } from 'vitest';
import {
  collectedUsdOf,
  costRowKeys,
  receivableAmounts,
  receivableDebtorKey,
  receivablesSummaryByDebtor,
  receivablesSummaryTotals,
} from './receivablesSummary';
import type { ReportReceivableRow } from '../infrastructure/reportsGateway';

function fila(partial: Partial<ReportReceivableRow>): ReportReceivableRow {
  return {
    orderId: 'r1',
    orderNumber: '6001',
    orderType: 'insurance',
    orderDate: '2026-07-01',
    branchId: 'b1',
    branchName: 'Sede',
    debtorType: 'insurance',
    debtorId: 'i1',
    debtorName: 'PREVISORA',
    holderName: 'Titular',
    holderId: 'V-1',
    patientName: 'Paciente',
    patientId: 'V-2',
    doctorName: 'DR. GRANADO',
    serviceKey: '123',
    invoiceNumber: '900',
    controlNumber: '950',
    invoiceDate: null,
    costoUsd: 0,
    useFixedRate: false,
    rateBs: null,
    portion: 'full',
    targetUsd: 0,
    targetBs: null,
    receivableId: null,
    receivableNumber: null,
    state: 'uncollected',
    collectedUsd: 0,
    collectedBs: 0,
    ...partial,
  };
}

describe('receivableDebtorKey', () => {
  it('agrupa por deudor, no por orden', () => {
    expect(receivableDebtorKey(fila({ orderId: 'a' }))).toBe(
      receivableDebtorKey(fila({ orderId: 'b' })),
    );
  });

  it('separa seguro de titular aunque compartan nombre', () => {
    expect(
      receivableDebtorKey(fila({ debtorType: 'insurance', debtorId: 'x' })),
    ).not.toBe(
      receivableDebtorKey(fila({ debtorType: 'holder', debtorId: 'x' })),
    );
  });

  it('cae al nombre si no hay id', () => {
    expect(
      receivableDebtorKey(fila({ debtorId: null, debtorName: 'CASHEA' })),
    ).toBe('insurance:CASHEA');
  });
});

describe('collectedUsdOf', () => {
  it('lote en USD: el cobro es el amountInUsd directo', () => {
    const r = fila({ useFixedRate: false, collectedUsd: 250 });
    expect(collectedUsdOf(r, 800)).toBe(250);
  });

  it('lote de tasa fija: convierte los Bs cobrados a la tasa del lote', () => {
    // Pagó 20.000 Bs de un lote amarrado a 400 → 50 USD, no a la tasa de hoy.
    const r = fila({
      useFixedRate: true,
      rateBs: 400,
      targetBs: 40000,
      collectedBs: 20000,
    });
    expect(collectedUsdOf(r, 800)).toBe(50);
  });

  it('tasa fija sin tasa de lote cae a la vigente', () => {
    const r = fila({ useFixedRate: true, rateBs: null, collectedBs: 40000 });
    expect(collectedUsdOf(r, 800)).toBe(50);
  });

  it('sin cobros devuelve 0', () => {
    expect(collectedUsdOf(fila({}), 800)).toBe(0);
  });
});

describe('receivablesSummaryByDebtor', () => {
  const FILAS = [
    fila({
      orderId: 'r1',
      debtorId: 'i1',
      debtorName: 'PREVISORA',
      targetUsd: 930,
      // Primera fila del lote: ahí vienen los pagos (300 USD cobrados).
      receivableId: 'ar1',
      collectedUsd: 300,
    }),
    fila({
      orderId: 'r2',
      debtorId: 'i1',
      debtorName: 'PREVISORA',
      targetUsd: 50,
      receivableId: 'ar1',
    }),
    fila({
      orderId: 'r3',
      debtorId: 'i2',
      debtorName: 'ALTAMIRA',
      useFixedRate: true,
      rateBs: 400,
      targetBs: 40000,
      // Lote fijo: los pagos vienen en Bs (20.000 a tasa 400 = 50 USD).
      receivableId: 'ar2',
      collectedBs: 20000,
    }),
    fila({
      orderId: 'r4',
      debtorType: 'holder',
      debtorId: 'h1',
      debtorName: 'JUAN PEREZ',
      targetUsd: 20,
    }),
  ];

  it('junta las órdenes de un mismo deudor', () => {
    const filas = receivablesSummaryByDebtor(FILAS, 800);
    const previsora = filas.find((f) => f.name === 'PREVISORA')!;
    expect(previsora.count).toBe(2);
    expect(previsora.usd).toBe(980);
  });

  it('por cobrar = facturado − pagos de los lotes', () => {
    const filas = receivablesSummaryByDebtor(FILAS, 800);
    const previsora = filas.find((f) => f.name === 'PREVISORA')!;
    const altamira = filas.find((f) => f.name === 'ALTAMIRA')!;
    expect(previsora.collectedUsd).toBe(300);
    expect(previsora.pendingUsd).toBe(680); // 980 − 300
    expect(altamira.usd).toBe(100); // 40.000 Bs a su tasa 400
    expect(altamira.collectedUsd).toBe(50); // 20.000 Bs a 400
    expect(altamira.pendingUsd).toBe(50);
  });

  it('distingue seguros de titulares', () => {
    const filas = receivablesSummaryByDebtor(FILAS, 800);
    expect(filas.find((f) => f.name === 'JUAN PEREZ')!.type).toBe('holder');
    expect(filas.find((f) => f.name === 'PREVISORA')!.type).toBe('insurance');
  });

  it('ordena de mayor a menor por monto facturado', () => {
    const filas = receivablesSummaryByDebtor(FILAS, 800);
    expect(filas.map((f) => f.name)).toEqual([
      'PREVISORA',
      'ALTAMIRA',
      'JUAN PEREZ',
    ]);
  });

  it('los totales cuadran con las filas', () => {
    const filas = receivablesSummaryByDebtor(FILAS, 800);
    const totales = receivablesSummaryTotals(filas);
    expect(totales.usd).toBe(1100); // 980 + 100 + 20
    expect(totales.collectedUsd).toBe(350); // 300 + 50
    expect(totales.pendingUsd).toBe(750); // 680 + 50 + 20
  });

  it('redondea a dos decimales y no arrastra error flotante', () => {
    const filas = receivablesSummaryByDebtor(
      [
        fila({ orderId: 'a', targetUsd: 0.1 }),
        fila({ orderId: 'b', targetUsd: 0.2 }),
      ],
      800,
    );
    expect(filas[0].usd).toBe(0.3); // 0.1 + 0.2 = 0.30000000000000004
  });

  it('sin filas devuelve una lista vacía y totales en cero', () => {
    expect(receivablesSummaryByDebtor([], 800)).toEqual([]);
    expect(receivablesSummaryTotals([])).toEqual({ usd: 0, collectedUsd: 0, pendingUsd: 0 });
  });
});

describe('costRowKeys', () => {
  it('una orden mixta imprime el costo una sola vez', () => {
    const mixta = [
      fila({ orderId: 'm1', portion: 'fixed' }),
      fila({ orderId: 'm1', portion: 'indexed' }),
    ];
    const keys = costRowKeys(mixta);
    expect(keys.size).toBe(1);
    expect(keys.has('m1-fixed')).toBe(true);
    expect(keys.has('m1-indexed')).toBe(false);
  });

  it('cada orden distinta lleva su propio costo', () => {
    const keys = costRowKeys([
      fila({ orderId: 'a', portion: 'full' }),
      fila({ orderId: 'b', portion: 'full' }),
    ]);
    expect(keys.size).toBe(2);
  });

  it('el costo va en el PRIMER renglón que aparece de la orden', () => {
    const keys = costRowKeys([
      fila({ orderId: 'm1', portion: 'indexed' }),
      fila({ orderId: 'm1', portion: 'fixed' }),
    ]);
    expect(keys.has('m1-indexed')).toBe(true);
  });
});

describe('la pantalla y el Excel usan el mismo cálculo', () => {
  it('receivableAmounts es la única fuente de los montos por fila', () => {
    const r = fila({ useFixedRate: true, rateBs: 400, targetBs: 40000 });
    const { usd, rate, bs } = receivableAmounts(r, 800);
    expect({ usd, rate, bs }).toEqual({ usd: 100, rate: 400, bs: 40000 });
    // El resumen parte de ese mismo monto.
    expect(receivablesSummaryByDebtor([r], 800)[0].usd).toBe(usd);
  });
});
