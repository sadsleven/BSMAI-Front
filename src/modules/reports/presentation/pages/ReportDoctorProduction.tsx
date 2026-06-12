import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserCog, TrendingUp, Crown, Stethoscope } from 'lucide-react';
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
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { accountsPayableGateway } from '@/modules/accounts-payable/infrastructure/accountsPayableGateway';
import {
  estimatedNetUsd,
  paidUsd,
  pendingUsd as apPendingUsd,
  recipientName,
  type AccountsPayable,
} from '@/modules/accounts-payable/domain/models/accountsPayable';
import { useTaxUnit } from '@/lib/taxes/useTaxUnit';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { formatUsd, formatBs, formatNumber, inDateRange } from '../../domain/format';
import { useUsdRate, usdToBs } from '../../domain/useUsdRate';
import { REPORT_PAGE_SIZE } from '../../infrastructure/fetchAll';
import { getHttpErrorMessage } from '@/lib/api';

type Row = {
  providerKey: string;
  providerType: 'doctor' | 'care_center';
  name: string;
  accountsCount: number;
  ordersCount: number;
  grossUsd: number;
  netUsd: number;
  paidUsd: number;
  pendingUsd: number;
};

export function ReportDoctorProduction() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
      providerType: sp.get('providerType') ?? '',
      search: sp.get('search') ?? '',
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [rows, setRows] = useState<AccountsPayable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overCap, setOverCap] = useState(false);
  const usdRate = useUsdRate();
  // UT vigente: neto y pendiente descuentan la retención SENIAT estimada.
  const { taxUnit } = useTaxUnit();
  const taxUnitBs = taxUnit ? Number(taxUnit.amountBs) : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    accountsPayableGateway
      .list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' })
      .then((res) => {
        if (cancelled) return;
        setRows(res.data);
        setOverCap(res.metadata.total > REPORT_PAGE_SIZE);
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
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput === filters.search) return;
      const next = new URLSearchParams(sp);
      if (searchInput) next.set('search', searchInput);
      else next.delete('search');
      setSp(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, filters.search, sp, setSp]);

  const updateParam = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    setSp(next, { replace: true });
  };

  const aggregated = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    rows.forEach((ap) => {
      if (!inDateRange(ap.createdAt, filters.from || undefined, filters.to || undefined)) return;
      if (filters.providerType && ap.recipientType !== filters.providerType) return;
      const key = ap.recipientType === 'doctor' ? `doctor:${ap.doctorId}` : `cc:${ap.careCenterId}`;
      let row = map.get(key);
      if (!row) {
        row = {
          providerKey: key,
          providerType: ap.recipientType,
          name: recipientName(ap),
          accountsCount: 0,
          ordersCount: 0,
          grossUsd: 0,
          netUsd: 0,
          paidUsd: 0,
          pendingUsd: 0,
        };
        map.set(key, row);
      }
      row.accountsCount += 1;
      const gross = Number(ap.providerAmount ?? 0);
      const net = estimatedNetUsd(ap, taxUnitBs) ?? gross;
      const paid = paidUsd(ap);
      row.grossUsd += gross;
      row.netUsd += net;
      row.paidUsd += paid;
      row.pendingUsd += apPendingUsd(ap, taxUnitBs) ?? 0;
    });

    // ordersCount derivado por orderId distintos por proveedor.
    const orderSet = new Map<string, Set<string>>();
    rows.forEach((ap) => {
      if (!inDateRange(ap.createdAt, filters.from || undefined, filters.to || undefined)) return;
      if (filters.providerType && ap.recipientType !== filters.providerType) return;
      const key = ap.recipientType === 'doctor' ? `doctor:${ap.doctorId}` : `cc:${ap.careCenterId}`;
      if (!orderSet.has(key)) orderSet.set(key, new Set());
      orderSet.get(key)!.add(ap.orderId);
    });
    map.forEach((row) => {
      row.ordersCount = orderSet.get(row.providerKey)?.size ?? 0;
    });

    const result = Array.from(map.values());
    const s = filters.search.toLowerCase().trim();
    const filtered = s ? result.filter((r) => r.name.toLowerCase().includes(s)) : result;
    return filtered.sort((a, b) => b.grossUsd - a.grossUsd);
  }, [rows, filters.from, filters.to, filters.providerType, filters.search, taxUnitBs]);

  const totals = useMemo(() => {
    let gross = 0;
    let net = 0;
    let paid = 0;
    let pending = 0;
    aggregated.forEach((r) => {
      gross += r.grossUsd;
      net += r.netUsd;
      paid += r.paidUsd;
      pending += r.pendingUsd;
    });
    return { gross, net, paid, pending };
  }, [aggregated]);

  const top = aggregated[0];
  const hasActiveFilters =
    !!filters.search || !!filters.from || !!filters.to || !!filters.providerType;
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  return (
    <ReportShell
      title="Producción por médico"
      description="Volumen de órdenes y monto generado por cada proveedor (doctor o centro de atención)"
      kpis={
        <KpiRow
          items={[
            {
              icon: UserCog,
              tone: 'blue',
              label: 'Proveedores activos',
              value: formatNumber(aggregated.length),
              hint: `${formatNumber(aggregated.reduce((s, r) => s + r.ordersCount, 0))} órdenes`,
            },
            {
              icon: Stethoscope,
              tone: 'cyan',
              label: 'Total facturado al proveedor',
              value: formatUsd(totals.gross),
              hint: 'Antes de retenciones',
            },
            {
              icon: TrendingUp,
              tone: 'success',
              label: 'Pagado',
              value: formatUsd(totals.paid),
              hint: `Pendiente ${formatUsd(totals.pending)}`,
            },
            {
              icon: Crown,
              tone: 'warning',
              label: 'Top proveedor',
              value: top ? top.name : '—',
              hint: top ? formatUsd(top.grossUsd) : undefined,
            },
          ]}
        />
      }
    >
      {overCap ? (
        <div className="px-4 py-2 text-xs text-warning border border-warning-soft bg-warning-soft rounded-lg">
          Mostrando hasta {REPORT_PAGE_SIZE} cuentas. Aplicá filtros para acotar el reporte.
        </div>
      ) : null}

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar proveedor…"
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
                value={filters.providerType || 'all'}
                onValueChange={(v) =>
                  updateParam({ providerType: v === 'all' ? undefined : v })
                }
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tipo: todos</SelectItem>
                  <SelectItem value="doctor">Solo doctores</SelectItem>
                  <SelectItem value="care_center">Solo centros</SelectItem>
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
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">#</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Proveedor</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Tipo</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Órdenes</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Cuentas</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Bruto USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Bruto Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">A recibir USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">A recibir Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Pagado USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Pagado Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Pendiente USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Pendiente Bs.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={6} columns={13} />
            ) : aggregated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="p-0">
                  <EmptyState
                    icon={UserCog}
                    title={hasActiveFilters ? 'Sin resultados' : 'Sin producción registrada'}
                    description={
                      hasActiveFilters
                        ? 'Ajustá los filtros para ver más resultados.'
                        : 'Aún no se han facturado órdenes a proveedores.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              aggregated.map((r, idx) => (
                <TableRow key={r.providerKey} className="hover:bg-[oklch(0.985_0.003_250)]">
                  <TableCell className="py-3.5 px-4 text-sm text-muted-foreground">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-medium">{r.name}</TableCell>
                  <TableCell className="py-3.5 px-4 text-sm text-muted-foreground">
                    {r.providerType === 'doctor' ? 'Doctor' : 'Centro'}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {formatNumber(r.ordersCount)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {formatNumber(r.accountsCount)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {formatUsd(r.grossUsd)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {formatBs(usdToBs(r.grossUsd, usdRate))}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {formatUsd(r.netUsd)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {formatBs(usdToBs(r.netUsd, usdRate))}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-success">
                    {formatUsd(r.paidUsd)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-success">
                    {formatBs(usdToBs(r.paidUsd, usdRate))}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-warning">
                    {formatUsd(r.pendingUsd)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-warning">
                    {formatBs(usdToBs(r.pendingUsd, usdRate))}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </div>
    </ReportShell>
  );
}
