import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, TrendingUp, Crown, Wallet } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { accountsReceivableGateway } from '@/modules/accounts-receivable/infrastructure/accountsReceivableGateway';
import {
  collectedUsd,
  targetUsd,
  type AccountsReceivable,
} from '@/modules/accounts-receivable/domain/models/accountsReceivable';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { formatUsd, formatBs, formatNumber, formatPercent, inDateRange } from '../../domain/format';
import { useUsdRate, usdToBs } from '../../domain/useUsdRate';
import { REPORT_PAGE_SIZE } from '../../infrastructure/fetchAll';
import { getHttpErrorMessage } from '@/lib/api';

type Row = {
  insuranceId: string;
  name: string;
  accountsCount: number;
  ordersCount: number;
  billedUsd: number;
  collectedUsd: number;
  pendingUsd: number;
};

export function ReportInsuranceProduction() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
      search: sp.get('search') ?? '',
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [rows, setRows] = useState<AccountsReceivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overCap, setOverCap] = useState(false);
  const usdRate = useUsdRate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    accountsReceivableGateway
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
    const orderSet = new Map<string, Set<string>>();
    rows.forEach((ar) => {
      if (!inDateRange(ar.createdAt, filters.from || undefined, filters.to || undefined)) return;
      const id = ar.insuranceId;
      if (!id) return;
      let row = map.get(id);
      if (!row) {
        row = {
          insuranceId: id,
          name: ar.insurance?.name ?? '—',
          accountsCount: 0,
          ordersCount: 0,
          billedUsd: 0,
          collectedUsd: 0,
          pendingUsd: 0,
        };
        map.set(id, row);
      }
      const tgt = targetUsd(ar) ?? 0;
      const col = collectedUsd(ar);
      row.accountsCount += 1;
      row.billedUsd += tgt;
      row.collectedUsd += col;
      row.pendingUsd += Math.max(0, tgt - col);
      if (!orderSet.has(id)) orderSet.set(id, new Set());
      orderSet.get(id)!.add(ar.orderId);
    });
    map.forEach((row) => {
      row.ordersCount = orderSet.get(row.insuranceId)?.size ?? 0;
    });
    const result = Array.from(map.values());
    const s = filters.search.toLowerCase().trim();
    const filtered = s ? result.filter((r) => r.name.toLowerCase().includes(s)) : result;
    return filtered.sort((a, b) => b.billedUsd - a.billedUsd);
  }, [rows, filters.from, filters.to, filters.search]);

  const totals = useMemo(() => {
    let billed = 0;
    let collected = 0;
    let pending = 0;
    aggregated.forEach((r) => {
      billed += r.billedUsd;
      collected += r.collectedUsd;
      pending += r.pendingUsd;
    });
    return { billed, collected, pending };
  }, [aggregated]);

  const top = aggregated[0];
  const hasActiveFilters = !!filters.search || !!filters.from || !!filters.to;
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  return (
    <ReportShell
      title="Producción por aseguradora"
      description="Volumen y recaudo por cada compañía de seguros"
      kpis={
        <KpiRow
          items={[
            {
              icon: ShieldCheck,
              tone: 'blue',
              label: 'Aseguradoras activas',
              value: formatNumber(aggregated.length),
              hint: `${formatNumber(aggregated.reduce((s, r) => s + r.ordersCount, 0))} órdenes`,
            },
            {
              icon: Wallet,
              tone: 'cyan',
              label: 'Total facturado',
              value: formatUsd(totals.billed),
            },
            {
              icon: TrendingUp,
              tone: 'success',
              label: 'Cobrado',
              value: formatUsd(totals.collected),
              hint: `${totals.billed > 0 ? formatPercent((totals.collected / totals.billed) * 100) : '—'}`,
            },
            {
              icon: Crown,
              tone: 'warning',
              label: 'Top aseguradora',
              value: top ? top.name : '—',
              hint: top ? formatUsd(top.billedUsd) : undefined,
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
          searchPlaceholder="Buscar aseguradora…"
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <DateRangeFilter
              from={filters.from || undefined}
              to={filters.to || undefined}
              onChange={(f, t) => updateParam({ from: f, to: t })}
            />
          }
        />

        {error ? (
          <div className="px-4 py-2 text-sm text-destructive border-b bg-destructive-soft">
            {error}
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow className="bg-[oklch(0.985_0.003_250)] hover:bg-[oklch(0.985_0.003_250)]">
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">#</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Aseguradora</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Órdenes</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Cuentas</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Facturado USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Facturado Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Cobrado USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Cobrado Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Pendiente USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Pendiente Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">% Cobranza</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={6} columns={11} />
            ) : aggregated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="p-0">
                  <EmptyState
                    icon={ShieldCheck}
                    title={hasActiveFilters ? 'Sin resultados' : 'Sin actividad de aseguradoras'}
                    description={
                      hasActiveFilters
                        ? 'Ajustá los filtros para ver más resultados.'
                        : 'Aún no se han facturado órdenes de aseguradoras.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              aggregated.map((r, idx) => {
                const pct = r.billedUsd > 0 ? (r.collectedUsd / r.billedUsd) * 100 : 0;
                return (
                  <TableRow key={r.insuranceId} className="hover:bg-[oklch(0.985_0.003_250)]">
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-medium">{r.name}</TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatNumber(r.ordersCount)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatNumber(r.accountsCount)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatUsd(r.billedUsd)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatBs(usdToBs(r.billedUsd, usdRate))}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-success">
                      {formatUsd(r.collectedUsd)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-success">
                      {formatBs(usdToBs(r.collectedUsd, usdRate))}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-warning">
                      {formatUsd(r.pendingUsd)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-warning">
                      {formatBs(usdToBs(r.pendingUsd, usdRate))}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-muted-foreground">
                      {formatPercent(pct)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </ReportShell>
  );
}
