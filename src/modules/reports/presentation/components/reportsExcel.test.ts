import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ReportInvoiceRow,
  ReportPayableRow,
  ReportReceivableRow,
} from '../../infrastructure/reportsGateway';

/**
 * `saveAs` escribe un archivo en el navegador: acá se intercepta para quedarse
 * con el Blob y volver a leerlo con ExcelJS. Así los tests comprueban el libro
 * REAL que baja el usuario, no una simulación.
 */
const guardados: Array<{ blob: Blob; filename: string }> = [];
vi.mock('file-saver', () => ({
  saveAs: (blob: Blob, filename: string) => {
    guardados.push({ blob, filename });
  },
}));

const {
  downloadIncomeRelationXlsx,
  downloadMonthlyStatementXlsx,
  downloadPayablesReportXlsx,
  downloadReceivablesReportXlsx,
  receivableAmounts,
  reportRowDate,
} = await import('./reportsExcel');

/** Último libro generado, ya parseado. */
async function ultimoLibro(): Promise<ExcelJS.Workbook> {
  const ultimo = guardados[guardados.length - 1];
  expect(ultimo, 'no se generó ningún archivo').toBeTruthy();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await ultimo.blob.arrayBuffer());
  return wb;
}

/** Valores de una fila, como texto, saltándose las celdas vacías. */
function textoFila(ws: ExcelJS.Worksheet, fila: number): string[] {
  const out: string[] = [];
  ws.getRow(fila).eachCell({ includeEmpty: false }, (c) => {
    out.push(String(c.value ?? ''));
  });
  return out;
}

/** Busca la fila cuya primera celda con texto coincide. */
function buscarFila(ws: ExcelJS.Worksheet, texto: string): number | null {
  for (let r = 1; r <= ws.rowCount; r += 1) {
    if (textoFila(ws, r).some((v) => v === texto)) return r;
  }
  return null;
}

function filaPagable(partial: Partial<ReportPayableRow>): ReportPayableRow {
  return {
    orderId: 'o1',
    orderNumber: '5001',
    invoiceNumber: '',
    controlNumber: '',
    invoiceDate: null,
    internalNumber: '5001',
    orderDate: '2026-07-01',
    branchId: 'b1',
    branchName: 'Sede',
    providerType: 'doctor',
    providerId: 'doc-1',
    providerName: 'DR. GRANADO',
    patientName: 'Juan Perez',
    insuranceName: null,
    procedure: 'Consulta',
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

function filaCobrable(
  partial: Partial<ReportReceivableRow>,
): ReportReceivableRow {
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

function filaFactura(partial: Partial<ReportInvoiceRow>): ReportInvoiceRow {
  return {
    invoiceId: 'f1',
    invoiceNumber: '900',
    controlNumber: '950',
    invoiceDate: '2026-07-01',
    status: 'active',
    cancelledAt: null,
    cancelReason: null,
    createdByName: 'admin',
    orderId: 'o1',
    orderNumber: '5001',
    orderType: 'insurance',
    orderDate: '2026-07-01',
    branchId: 'b1',
    branchName: 'Sede',
    clientType: 'insurance',
    clientId: 'i1',
    clientName: 'PREVISORA',
    holderName: 'Titular',
    holderId: 'V-1',
    patientName: 'Paciente',
    patientId: 'V-2',
    doctorName: 'DR. GRANADO',
    serviceKey: '123',
    ordersCount: 1,
    orderNumbers: '5001',
    internalNumbers: '5001',
    rateBs: 100,
    amountUsd: 0,
    amountBs: 0,
    costUsd: 0,
    marginUsd: 0,
    ...partial,
  } as ReportInvoiceRow;
}

beforeEach(() => {
  guardados.length = 0;
  // Sin logo: el fetch de public/ no existe fuera del navegador.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false }) as unknown as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reportRowDate', () => {
  it('prefiere la fecha de la factura', () => {
    expect(
      reportRowDate({ invoiceDate: '2026-08-15', orderDate: '2026-07-01' }),
    ).toBe('2026-08-15');
  });

  it('cae a la fecha de la orden si aún no se facturó', () => {
    expect(reportRowDate({ invoiceDate: null, orderDate: '2026-07-01' })).toBe(
      '2026-07-01',
    );
  });

  it('sin ninguna fecha devuelve null', () => {
    expect(reportRowDate({ invoiceDate: null, orderDate: null })).toBeNull();
  });
});

describe('receivableAmounts', () => {
  it('orden indexada: el monto es el USD y los Bs salen de la tasa de hoy', () => {
    const r = filaCobrable({ useFixedRate: false, targetUsd: 100 });
    expect(receivableAmounts(r, 50)).toEqual({ usd: 100, rate: 50, bs: 5000 });
  });

  it('orden indexada sin tasa vigente no inventa bolívares', () => {
    const r = filaCobrable({ useFixedRate: false, targetUsd: 100 });
    expect(receivableAmounts(r, null)).toEqual({
      usd: 100,
      rate: null,
      bs: null,
    });
  });

  it('orden a tasa fija: manda el monto en Bs y su propia tasa', () => {
    const r = filaCobrable({
      useFixedRate: true,
      rateBs: 40,
      targetBs: 4000,
      targetUsd: 999,
    });
    // El USD se deriva de los Bs, no del targetUsd.
    expect(receivableAmounts(r, 50)).toEqual({ usd: 100, rate: 40, bs: 4000 });
  });

  it('tasa fija en cero cae al targetUsd y no divide por cero', () => {
    const r = filaCobrable({
      useFixedRate: true,
      rateBs: 0,
      targetBs: 4000,
      targetUsd: 77,
    });
    expect(receivableAmounts(r, 50)).toEqual({ usd: 77, rate: null, bs: 4000 });
  });
});

describe('Excel de cuentas por pagar', () => {
  const FILAS = [
    filaPagable({
      orderId: 'o1',
      internalNumber: '5001',
      grossUsd: 400,
      payableId: 'L1',
      payableNumber: '39',
      state: 'partially_paid',
      payableGrossUsd: 415,
      payableCoveredUsd: 300,
      payablePendingUsd: 115,
      settlements: [
        {
          id: 's1',
          settlementDate: '2026-07-10',
          coveredUsd: 300,
          grossBs: 30000,
          retentionBs: 0,
          netBs: 30000,
          payments: [
            {
              date: '2026-07-10',
              type: 'bank_transfer',
              reference: '1542',
              bankCode: '0191',
              bankName: 'Banco Nacional de Crédito (BNC)',
              amountBs: 30000,
            },
          ],
        },
      ],
    }),
    filaPagable({
      orderId: 'o2',
      internalNumber: '5002',
      grossUsd: 15,
      payableId: 'L1',
      payableNumber: '39',
      state: 'partially_paid',
      payableGrossUsd: 415,
      payableCoveredUsd: 300,
      payablePendingUsd: 115,
    }),
    filaPagable({
      orderId: 'o3',
      internalNumber: '5003',
      grossUsd: 5,
      providerType: 'care_center',
      providerId: 'cc-1',
      providerName: 'CENTRO RX',
      insuranceName: 'PREVISORA',
    }),
  ];

  it('la primera hoja es el RESUMEN, ordenado y con su total', async () => {
    await downloadPayablesReportXlsx(FILAS);
    const wb = await ultimoLibro();
    const resumen = wb.worksheets[0];
    expect(resumen.name).toBe('RESUMEN');

    const cabecera = buscarFila(resumen, 'NOMBRE')!;
    expect(textoFila(resumen, cabecera)).toEqual([
      'NOMBRE',
      'ORDENES POR PAGAR $',
    ]);
    // DR. GRANADO debe 115 (415 − 300) y va primero; CENTRO RX debe 5.
    expect(textoFila(resumen, cabecera + 1)).toEqual(['DR. GRANADO', '115']);
    expect(textoFila(resumen, cabecera + 2)).toEqual(['CENTRO RX', '5']);
    expect(textoFila(resumen, cabecera + 3)).toEqual(['TOTAL', '120']);
  });

  it('todas las hojas llevan la cabecera inmovilizada', async () => {
    await downloadPayablesReportXlsx(FILAS);
    const wb = await ultimoLibro();
    for (const ws of wb.worksheets) {
      expect(ws.views[0]?.state, `hoja ${ws.name}`).toBe('frozen');
    }
  });

  it('la hoja del proveedor imprime un renglón por abono', async () => {
    await downloadPayablesReportXlsx(FILAS);
    const wb = await ultimoLibro();
    const hoja = wb.worksheets.find((w) => w.name === 'DR. GRANADO')!;
    const abono = buscarFila(hoja, 'ABONO LOTE 39');
    expect(abono, 'falta el renglón del abono').not.toBeNull();
    const valores = textoFila(hoja, abono!);
    expect(valores).toContain('300');
    // La referencia usa la abreviatura del banco entre paréntesis.
    expect(valores.some((v) => v.includes('BNC') && v.includes('1542'))).toBe(
      true,
    );
  });

  it('el saldo pendiente descuenta lo abonado del total por pagar', async () => {
    await downloadPayablesReportXlsx(FILAS);
    const wb = await ultimoLibro();
    const hoja = wb.worksheets.find((w) => w.name === 'DR. GRANADO')!;
    const totales = textoFila(hoja, buscarFila(hoja, 'TOTALES')!);
    const saldo = textoFila(hoja, buscarFila(hoja, 'SALDO PENDIENTE')!);
    expect(totales).toContain('415'); // bruto de las dos órdenes
    expect(totales).toContain('300'); // monto pagado
    expect(saldo).toContain('115'); // 415 − 300
  });

  it('sin seguro la columna dice AFMI, no "Particular"', async () => {
    await downloadPayablesReportXlsx(FILAS);
    const wb = await ultimoLibro();
    const hoja = wb.worksheets.find((w) => w.name === 'DR. GRANADO')!;
    const fila = buscarFila(hoja, '5001')!;
    expect(textoFila(hoja, fila)).toContain('AFMI');
    expect(textoFila(hoja, fila)).not.toContain('PARTICULAR');
  });

  it('la lista general trae la columna ABONADO $', async () => {
    await downloadPayablesReportXlsx(FILAS);
    const wb = await ultimoLibro();
    const plana = wb.worksheets.find((w) => w.name === 'LISTA GENERAL')!;
    expect(textoFila(plana, buscarFila(plana, 'FECHA')!)).toContain(
      'ABONADO $',
    );
  });

  it('usa la fecha de la factura cuando la orden ya se facturó', async () => {
    await downloadPayablesReportXlsx([
      filaPagable({
        internalNumber: '7777',
        grossUsd: 10,
        orderDate: '2026-07-01',
        invoiceDate: '2026-08-20',
      }),
    ]);
    const wb = await ultimoLibro();
    const hoja = wb.worksheets.find((w) => w.name === 'DR. GRANADO')!;
    const celda = hoja.getRow(buscarFila(hoja, '7777')!).getCell(2)
      .value as Date;
    expect(celda.toISOString().slice(0, 10)).toBe('2026-08-20');
  });

  it('el proveedor con estado de cuenta mensual sale del libro general', async () => {
    await downloadPayablesReportXlsx([
      ...FILAS,
      filaPagable({
        orderId: 'oR',
        internalNumber: '9001',
        grossUsd: 90,
        providerType: 'care_center',
        providerId: 'cc-rislab',
        providerName: 'RISLAB',
      }),
    ]);
    const wb = await ultimoLibro();
    expect(wb.worksheets.map((w) => w.name)).not.toContain('RISLAB');
    const resumen = wb.worksheets[0];
    expect(buscarFila(resumen, 'RISLAB')).toBeNull();
  });
});

describe('Estado de cuenta mensual (RISLAB)', () => {
  const FILAS = [
    filaPagable({
      orderId: 'a',
      providerName: 'RISLAB',
      providerType: 'care_center',
      providerId: 'cc-rislab',
      internalNumber: '8001',
      orderDate: '2026-07-05',
      grossUsd: 382.1,
      payableId: 'LR',
      payableNumber: '50',
      state: 'partially_paid',
      settlements: [
        {
          id: 'sr1',
          settlementDate: '2026-07-29',
          coveredUsd: 40,
          grossBs: 4000,
          retentionBs: 0,
          netBs: 4000,
          payments: [
            {
              date: '2026-07-29',
              type: 'bank_transfer',
              reference: '5779',
              bankCode: '0191',
              bankName: 'Banco Nacional de Crédito (BNC)',
              amountBs: 4000,
            },
          ],
        },
      ],
    }),
    filaPagable({
      orderId: 'b',
      providerName: 'RISLAB',
      providerType: 'care_center',
      providerId: 'cc-rislab',
      internalNumber: '8002',
      orderDate: '2026-08-03',
      grossUsd: 552,
      payableId: 'LR',
      payableNumber: '50',
      state: 'partially_paid',
    }),
  ];

  it('arma una fila por mes y lleva el saldo corrido', async () => {
    await downloadMonthlyStatementXlsx(FILAS, { providerName: 'RISLAB' });
    const wb = await ultimoLibro();
    const hoja = wb.worksheets[0];

    const julio = textoFila(hoja, buscarFila(hoja, 'JULIO')!);
    expect(julio).toContain('382.1'); // órdenes del mes
    expect(julio).toContain('382.1'); // saldo tras el primer mes

    // El abono de julio baja el saldo a 342,10.
    const filaAbono = buscarFila(hoja, '342.1');
    expect(filaAbono, 'falta el saldo tras el abono').not.toBeNull();

    // Agosto suma 552 → 894,10.
    const agosto = textoFila(hoja, buscarFila(hoja, 'AGOSTO')!);
    expect(agosto).toContain('552');
    expect(agosto).toContain('894.1');
  });

  it('el total final es el saldo que queda debiendo', async () => {
    await downloadMonthlyStatementXlsx(FILAS, { providerName: 'RISLAB' });
    const wb = await ultimoLibro();
    const hoja = wb.worksheets[0];
    expect(textoFila(hoja, buscarFila(hoja, 'TOTAL:')!)).toContain('894.1');
  });

  it('arranca con el saldo anterior cuando se le pasa', async () => {
    await downloadMonthlyStatementXlsx(FILAS, {
      providerName: 'RISLAB',
      openingBalanceUsd: 100,
    });
    const wb = await ultimoLibro();
    const hoja = wb.worksheets[0];
    expect(buscarFila(hoja, 'SALDO ANTERIOR')).not.toBeNull();
    // 100 + 382,10 − 40 + 552 = 994,10
    expect(textoFila(hoja, buscarFila(hoja, 'TOTAL:')!)).toContain('994.1');
  });

  it('el archivo se nombra por el proveedor', async () => {
    await downloadMonthlyStatementXlsx(FILAS, { providerName: 'RISLAB' });
    expect(guardados[guardados.length - 1].filename).toContain('RISLAB');
  });
});

describe('Excel de cuentas por cobrar', () => {
  const FILAS = [
    filaCobrable({
      orderId: 'r1',
      debtorName: 'PREVISORA',
      debtorId: 'i1',
      targetUsd: 930,
      state: 'uncollected',
    }),
    filaCobrable({
      orderId: 'r2',
      debtorName: 'PREVISORA',
      debtorId: 'i1',
      targetUsd: 50,
      state: 'uncollected',
    }),
    filaCobrable({
      orderId: 'r3',
      debtorName: 'ALTAMIRA',
      debtorId: 'i2',
      useFixedRate: true,
      rateBs: 400,
      targetBs: 40000,
      state: 'collected',
    }),
  ];

  it('la primera hoja resume por deudor, de mayor a menor', async () => {
    await downloadReceivablesReportXlsx(FILAS, 800);
    const wb = await ultimoLibro();
    const resumen = wb.worksheets[0];
    expect(resumen.name).toBe('CUENTAS POR COBRAR');

    const cab = buscarFila(resumen, 'SEGURO')!;
    expect(textoFila(resumen, cab + 1)).toEqual(['PREVISORA', '980', '980']);
    // Tasa fija: 40.000 Bs a 800 de hoy = 50 actualizados, sobre 100 facturados.
    expect(textoFila(resumen, cab + 2)).toEqual(['ALTAMIRA', '100', '50']);
    expect(textoFila(resumen, cab + 3)).toEqual(['TOTAL', '1080', '1030']);
  });

  it('la cabecera del resumen muestra la tasa usada', async () => {
    await downloadReceivablesReportXlsx(FILAS, 875.65);
    const wb = await ultimoLibro();
    const resumen = wb.worksheets[0];
    const cab = textoFila(resumen, buscarFila(resumen, 'SEGURO')!);
    expect(cab.some((v) => v.includes('875'))).toBe(true);
  });

  it('crea una hoja por deudor con su total', async () => {
    await downloadReceivablesReportXlsx(FILAS, 800);
    const wb = await ultimoLibro();
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'CUENTAS POR COBRAR',
      'PREVISORA',
      'ALTAMIRA',
    ]);
    const previsora = wb.worksheets[1];
    expect(textoFila(previsora, buscarFila(previsora, 'TOTAL')!)).toContain(
      '980',
    );
  });

  it('sin incluir cobradas no aparece la columna ESTADO', async () => {
    await downloadReceivablesReportXlsx(FILAS, 800);
    const wb = await ultimoLibro();
    const hoja = wb.worksheets[1];
    expect(textoFila(hoja, buscarFila(hoja, 'FECHA')!)).not.toContain('ESTADO');
  });

  it('con las cobradas incluidas se agrega la columna ESTADO', async () => {
    await downloadReceivablesReportXlsx(FILAS, 800, {
      includeCollected: true,
    });
    const wb = await ultimoLibro();
    const hoja = wb.worksheets[1];
    expect(textoFila(hoja, buscarFila(hoja, 'FECHA')!)).toContain('ESTADO');
  });

  it('todas las hojas llevan la cabecera inmovilizada', async () => {
    await downloadReceivablesReportXlsx(FILAS, 800);
    const wb = await ultimoLibro();
    for (const ws of wb.worksheets) {
      expect(ws.views[0]?.state, `hoja ${ws.name}`).toBe('frozen');
    }
  });
});

describe('Excel de relación de ingresos', () => {
  const FILAS = [
    filaFactura({
      invoiceId: 'f1',
      invoiceNumber: '900',
      amountUsd: 50,
      amountBs: 5000,
      costUsd: 15,
    }),
    filaFactura({
      invoiceId: 'f2',
      invoiceNumber: '901',
      status: 'cancelled',
      amountUsd: 0,
      amountBs: 0,
      costUsd: 0,
    }),
  ];

  it('ya no trae la columna N° REMESA', async () => {
    await downloadIncomeRelationXlsx(FILAS);
    const wb = await ultimoLibro();
    const hoja = wb.worksheets[0];
    const cab = textoFila(hoja, buscarFila(hoja, 'FECHA')!);
    expect(cab).not.toContain('N° REMESA');
    expect(cab).toHaveLength(15);
  });

  it('la anulada dice ANULADA solo en CLIENTE y deja el titular vacío', async () => {
    await downloadIncomeRelationXlsx(FILAS);
    const wb = await ultimoLibro();
    const hoja = wb.worksheets[0];
    const fila = buscarFila(hoja, 'ANULADA')!;
    // Col 2 = CLIENTE, col 3 = TITULAR.
    expect(hoja.getRow(fila).getCell(2).value).toBe('ANULADA');
    expect(hoja.getRow(fila).getCell(3).value ?? '').toBe('');
  });

  it('la anulada va con 0,00 en bolívares, no en blanco', async () => {
    await downloadIncomeRelationXlsx(FILAS);
    const wb = await ultimoLibro();
    const hoja = wb.worksheets[0];
    const fila = buscarFila(hoja, 'ANULADA')!;
    // Col 14 = MONTO FACTURADO Bs.
    expect(hoja.getRow(fila).getCell(14).value).toBe(0);
  });

  it('la anulada no entra en los totales', async () => {
    await downloadIncomeRelationXlsx(FILAS);
    const wb = await ultimoLibro();
    const hoja = wb.worksheets[0];
    const totales = hoja.getRow(buscarFila(hoja, 'TOTALES')!);
    expect(totales.getCell(12).value).toBe(50); // monto $
    expect(totales.getCell(14).value).toBe(5000); // monto Bs
    expect(totales.getCell(15).value).toBe(15); // costo
  });

  it('la anulada conserva su renglón y su número de factura', async () => {
    await downloadIncomeRelationXlsx(FILAS);
    const wb = await ultimoLibro();
    const hoja = wb.worksheets[0];
    const fila = buscarFila(hoja, 'ANULADA')!;
    expect(hoja.getRow(fila).getCell(9).value).toBe('901');
  });

  it('genera la hoja de detalle y la de resumen, ambas congeladas', async () => {
    await downloadIncomeRelationXlsx(FILAS);
    const wb = await ultimoLibro();
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'RELACION DE INGRESOS',
      'RESUMEN',
    ]);
    for (const ws of wb.worksheets) {
      expect(ws.views[0]?.state, `hoja ${ws.name}`).toBe('frozen');
    }
  });
});
