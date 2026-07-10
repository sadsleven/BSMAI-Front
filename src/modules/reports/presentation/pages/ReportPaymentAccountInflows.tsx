import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Wallet,
  ListChecks,
  ClipboardList,
  HandCoins,
  Landmark,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { ReportDownloadButton } from '../components/ReportDownloadButton';
import { downloadReportTableXlsx, excelDateCell } from '../components/reportsExcel';
import { formatUsd, formatBs, formatDate, formatNumber } from '../../domain/format';
import { formatMoney } from '@/lib/format/money';
import { useUsdRate, usdToBs } from '../../domain/useUsdRate';
import { getHttpErrorMessage } from '@/lib/api';
import {
  paymentAccountReportGateway,
  type InflowByAccount,
  type InflowRow,
  type InflowsReport,
} from '@/modules/payment-accounts/infrastructure/paymentAccountReportGateway';
import { PAYMENT_ACCOUNT_TYPE_LABEL } from '@/modules/payment-accounts/domain/models/paymentAccount';
import { PAYMENT_TYPE_LABEL } from '@/modules/orders/domain/models/order';

type SourceFilter = 'all' | 'orders' | 'receivables';
type TypeFilter = '' | 'mobile_payment' | 'bank_transfer' | 'card' | 'other';

const EMPTY: InflowsReport = {
  totals: {
    totalCount: 0,
    totalUsd: 0,
    ordersCount: 0,
    ordersUsd: 0,
    receivablesCount: 0,
    receivablesUsd: 0,
  },
  byAccount: [],
  rows: [],
  truncated: false,
};

function methodLabel(t: string): string {
  return (PAYMENT_TYPE_LABEL as Record<string, string>)[t] ?? t;
}

export function ReportPaymentAccountInflows() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      page: Number(sp.get('page') ?? 1) || 1,
      limit: Number(sp.get('limit') ?? 20) || 20,
      search: sp.get('search') ?? '',
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
      source: (sp.get('source') ?? 'all') as SourceFilter,
      type: (sp.get('type') ?? '') as TypeFilter,
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [report, setReport] = useState<InflowsReport>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const usdRate = useUsdRate();

  // Fetch server-side (filtros de fecha/origen/tipo se aplican en BE).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    paymentAccountReportGateway
      .inflows({
        from: filters.from || undefined,
        to: filters.to || undefined,
        source: filters.source === 'all' ? undefined : filters.source,
        type: filters.type || undefined,
      })
      .then((res) => {
        if (!cancelled) setReport(res);
      })
      .catch((e) => {
        if (!cancelled) setError(getHttpErrorMessage(e, 'No se pudo cargar el reporte'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.from, filters.to, filters.source, filters.type]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput === filters.search) return;
      const next = new URLSearchParams(sp);
      if (searchInput) next.set('search', searchInput);
      else next.delete('search');
      next.set('page', '1');
      setSp(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, filters.search, sp, setSp]);

  const updateParam = (patch: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.set('page', '1');
    setSp(next, { replace: true });
  };

  // Búsqueda libre (cliente) sobre detalle.
  const filteredRows = useMemo(() => {
    const s = filters.search.toLowerCase().trim();
    if (!s) return report.rows;
    return report.rows.filter((r) =>
      [
        r.paymentAccountName,
        r.bankCode,
        r.referenceNumber,
        r.documentNumber,
        r.counterpart,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(s),
    );
  }, [report.rows, filters.search]);

  const paged = useMemo(() => {
    const start = (filters.page - 1) * filters.limit;
    return filteredRows.slice(start, start + filters.limit);
  }, [filteredRows, filters.page, filters.limit]);
  const lastPage = Math.max(1, Math.ceil(filteredRows.length / filters.limit));

  const hasActiveFilters =
    !!filters.search ||
    !!filters.from ||
    !!filters.to ||
    filters.source !== 'all' ||
    !!filters.type;
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  const { totals, byAccount } = report;

  return (
    <ReportShell
      title="Dinero recibido por cuenta"
      description="Pagos recibidos en las cuentas propias de AFMI (órdenes y cuentas por cobrar)"
      headerRight={
        <ReportDownloadButton
          disabled={loading || filteredRows.length === 0}
          onDownload={() =>
            downloadReportTableXlsx({
              filename: 'Dinero-recibido-por-cuenta',
              title: 'Dinero recibido por cuenta',
              sheetName: 'DINERO RECIBIDO',
              rows: filteredRows,
              columns: [
                { header: 'Fecha', value: (r) => excelDateCell(r.paymentDate), width: 12, numFmt: 'dd/mm/yyyy', align: 'center' },
                { header: 'Origen', value: (r) => (r.source === 'order' ? 'Orden' : 'Por cobrar'), width: 11 },
                { header: 'Cuenta propia', value: (r) => r.paymentAccountName ?? '', width: 22 },
                { header: 'Método', value: (r) => methodLabel(r.type), width: 16 },
                { header: 'Documento', value: (r) => r.documentNumber ?? '', width: 14, align: 'center' },
                { header: 'Contraparte', value: (r) => r.counterpart ?? '', width: 22 },
                { header: 'Referencia', value: (r) => r.referenceNumber ?? '', width: 14 },
                { header: 'Moneda', value: (r) => r.amountCurrency, width: 9, align: 'center' },
                { header: 'Monto', value: (r) => r.amountValue, width: 13, numFmt: '#,##0.00' },
                { header: 'Monto USD', value: (r) => r.amountInUsd, width: 13, numFmt: '0.00', total: true },
              ],
            })
          }
        />
      }
      kpis={
        <KpiRow
          items={[
            {
              icon: Wallet,
              tone: 'success',
              label: 'Total recibido',
              value: formatUsd(totals.totalUsd),
              hint: usdRate
                ? formatBs(usdToBs(totals.totalUsd, usdRate))
                : undefined,
            },
            {
              icon: ListChecks,
              tone: 'blue',
              label: 'Pagos recibidos',
              value: formatNumber(totals.totalCount),
            },
            {
              icon: ClipboardList,
              tone: 'cyan',
              label: 'Desde órdenes',
              value: formatUsd(totals.ordersUsd),
              hint: `${formatNumber(totals.ordersCount)} pagos`,
            },
            {
              icon: HandCoins,
              tone: 'warning',
              label: 'Desde cuentas por cobrar',
              value: formatUsd(totals.receivablesUsd),
              hint: `${formatNumber(totals.receivablesCount)} cobros`,
            },
          ]}
        />
      }
    >
      {report.truncated ? (
        <div className="px-4 py-2 text-xs text-warning border border-warning-soft bg-warning-soft rounded-lg">
          El detalle fue truncado al límite. Acota con filtros de fecha para ver todo.
        </div>
      ) : null}

      {/* Resumen por cuenta */}
      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="text-[15px] font-semibold">Resumen por cuenta</h2>
          <p className="text-xs text-muted-foreground">
            Total acumulado por cada cuenta propia
          </p>
        </div>
        <div className="m-4 rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Cuenta</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Tipo</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Banco</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"># Órdenes</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">USD Órdenes</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"># Cobros</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">USD Cobros</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Total USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Total Bs.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={4} columns={9} />
            ) : byAccount.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="p-0">
                  <EmptyState
                    icon={Wallet}
                    title={hasActiveFilters ? 'Sin resultados' : 'Sin pagos recibidos'}
                    description={
                      hasActiveFilters
                        ? 'Ajusta los filtros para ver más resultados.'
                        : 'Aún no se han recibido pagos en cuentas propias.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              byAccount.map((a: InflowByAccount) => (
                <TableRow key={a.paymentAccountId} className="hover:bg-[oklch(0.985_0.003_250)]">
                  <TableCell className="py-3 px-4 text-sm font-medium">
                    <div className="flex items-center gap-2 min-w-0">
                      <Landmark className="w-4 h-4 text-brand-cyan-strong shrink-0" />
                      <span className="truncate">{a.paymentAccountName}</span>
                      {a.deletedAt ? (
                        <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">
                          Papelera
                        </Badge>
                      ) : !a.isActive ? (
                        <Badge variant="outline" className="text-[10px] text-warning border-warning/40">
                          Deshabilitada
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-sm">
                    <Badge variant="outline" className="text-xs font-normal">
                      {PAYMENT_ACCOUNT_TYPE_LABEL[a.paymentAccountType]}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-sm font-mono text-muted-foreground">
                    {a.bankCode ?? '—'}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-sm text-right">{formatNumber(a.ordersCount)}</TableCell>
                  <TableCell className="py-3 px-4 text-sm font-mono text-right">{formatUsd(a.ordersUsd)}</TableCell>
                  <TableCell className="py-3 px-4 text-sm text-right">{formatNumber(a.receivablesCount)}</TableCell>
                  <TableCell className="py-3 px-4 text-sm font-mono text-right">{formatUsd(a.receivablesUsd)}</TableCell>
                  <TableCell className="py-3 px-4 text-sm font-mono text-right font-semibold text-success">
                    {formatUsd(a.totalUsd)}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-sm font-mono text-right text-success">
                    {formatBs(usdToBs(a.totalUsd, usdRate))}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </div>

      {/* Detalle de pagos */}
      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por cuenta, documento, contraparte, referencia…"
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <>
              <DateRangeFilter
                from={filters.from || undefined}
                to={filters.to || undefined}
                onChange={(f, t) => updateParam({ from: f, to: t })}
              />
              <Select
                value={filters.source}
                onValueChange={(v) => updateParam({ source: v })}
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Origen: todos</SelectItem>
                  <SelectItem value="orders">Órdenes</SelectItem>
                  <SelectItem value="receivables">Cuentas por cobrar</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.type || 'all'}
                onValueChange={(v) => updateParam({ type: v === 'all' ? undefined : v })}
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tipo: todos</SelectItem>
                  <SelectItem value="mobile_payment">Pago móvil</SelectItem>
                  <SelectItem value="bank_transfer">Transferencia</SelectItem>
                  <SelectItem value="card">Punto (tarjeta)</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />

        {error ? (
          <div className="px-4 py-2 text-sm text-destructive border-b bg-destructive-soft">
            {error}
          </div>
        ) : null}

        <div className="m-4 rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Fecha</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Origen</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Cuenta propia</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Método</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Documento</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Contraparte</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Referencia</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Monto</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Monto USD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={6} columns={9} />
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="p-0">
                  <EmptyState
                    icon={Wallet}
                    title={hasActiveFilters ? 'Sin resultados' : 'Sin pagos recibidos'}
                    description={
                      hasActiveFilters
                        ? 'Ajusta los filtros para ver más resultados.'
                        : 'Aún no se han recibido pagos en cuentas propias.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              paged.map((r: InflowRow) => (
                <TableRow key={`${r.source}-${r.id}`} className="hover:bg-[oklch(0.985_0.003_250)]">
                  <TableCell className="py-3 px-4 text-sm whitespace-nowrap">
                    {formatDate(r.paymentDate)}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-sm">
                    <Badge
                      variant="outline"
                      className={
                        r.source === 'order'
                          ? 'text-xs font-normal text-brand-blue-strong border-brand-blue/40'
                          : 'text-xs font-normal text-warning border-warning/40'
                      }
                    >
                      {r.source === 'order' ? 'Orden' : 'Por cobrar'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-sm font-medium truncate max-w-[180px]">
                    {r.paymentAccountName ?? '—'}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-sm">
                    <Badge variant="outline" className="text-xs font-normal">
                      {methodLabel(r.type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-sm font-mono">{r.documentNumber}</TableCell>
                  <TableCell className="py-3 px-4 text-sm truncate max-w-[160px]">{r.counterpart}</TableCell>
                  <TableCell className="py-3 px-4 text-sm font-mono text-muted-foreground">
                    {r.referenceNumber ?? '—'}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-sm font-mono text-right">
                    {r.amountCurrency} {formatMoney(r.amountValue)}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-sm font-mono text-right text-success">
                    {formatUsd(r.amountInUsd)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <DataTablePagination
          page={filters.page}
          pageSize={filters.limit}
          total={filteredRows.length}
          lastPage={lastPage}
          onPageChange={(p) => updateParam({ page: String(p) }, false)}
          onPageSizeChange={(limit) => updateParam({ limit: String(limit) })}
          itemLabel="pagos"
        />
        </div>
      </div>
    </ReportShell>
  );
}
