import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, Receipt, Users, Wallet, TrendingUp } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { notify } from '@/lib/notifications/toast';
import { getHttpErrorMessage } from '@/lib/api';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { downloadArcXlsx } from '../components/arcExcel';
import { formatBs, formatNumber } from '../../domain/format';
import {
  reportsGateway,
  type ArcBeneficiary,
  type ArcReport,
} from '../../infrastructure/reportsGateway';

const COLUMNS = 8;

const CURRENT_YEAR = new Date().getFullYear();

const PROVIDER_LABEL: Record<ArcBeneficiary['providerType'], string> = {
  doctor: 'Médico',
  care_center: 'Centro',
};

/** Botón por fila: descarga el ARC del beneficiario (una hoja, un archivo). */
function ArcRowDownload({ report, beneficiary }: { report: ArcReport; beneficiary: ArcBeneficiary }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await downloadArcXlsx({ period: report.period, beneficiaries: [beneficiary] });
    } catch (e) {
      notify.fromError(e, 'No se pudo generar el ARC');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      size="sm"
      onClick={run}
      disabled={busy}
      className="bg-[#107C41] text-white hover:bg-[#0e6a38] focus-visible:ring-[#107C41]/40"
    >
      <FileSpreadsheet className="size-4" />
      {busy ? 'Generando…' : 'Descargar ARC'}
    </Button>
  );
}

export function ReportArc() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      page: Number(sp.get('page') ?? 1) || 1,
      limit: Number(sp.get('limit') ?? 20) || 20,
      search: sp.get('search') ?? '',
      year: sp.get('year') ?? String(CURRENT_YEAR),
      providerType: sp.get('providerType') ?? '',
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [report, setReport] = useState<ArcReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await reportsGateway.arc({ year: filters.year });
        if (cancelled) return;
        setReport(res);
      } catch (e) {
        if (!cancelled) setError(getHttpErrorMessage(e, 'No se pudo cargar el reporte'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.year]);

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

  // Años seleccionables: de la orden más vieja a la más nueva del sistema
  // (rango que reporta el BE). Antes de cargar, sólo el año seleccionado.
  const arcYears = useMemo(() => {
    const min = report?.years?.min ?? CURRENT_YEAR;
    const max = report?.years?.max ?? CURRENT_YEAR;
    const list = Array.from({ length: Math.max(1, max - min + 1) }, (_, i) => max - i);
    const selected = Number(filters.year);
    if (Number.isFinite(selected) && !list.includes(selected)) list.push(selected);
    return list.sort((a, b) => b - a);
  }, [report, filters.year]);

  const beneficiaries = useMemo(() => {
    let list = report?.beneficiaries ?? [];
    if (filters.providerType) list = list.filter((b) => b.providerType === filters.providerType);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          (b.rif ?? '').toLowerCase().includes(q) ||
          (b.cedula ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [report, filters.providerType, filters.search]);

  const totals = useMemo(() => {
    let lines = 0;
    let baseBs = 0;
    let retainedBs = 0;
    beneficiaries.forEach((b) => {
      lines += b.lines.length;
      baseBs += b.totalBaseBs;
      retainedBs += b.totalRetainedBs;
    });
    return { lines, baseBs, retainedBs };
  }, [beneficiaries]);

  const paged = useMemo(() => {
    const start = (filters.page - 1) * filters.limit;
    return beneficiaries.slice(start, start + filters.limit);
  }, [beneficiaries, filters.page, filters.limit]);
  const lastPage = Math.max(1, Math.ceil(beneficiaries.length / filters.limit));

  const hasActiveFilters = !!filters.search || !!filters.providerType;
  const clearFilters = () => {
    setSearchInput('');
    const next = new URLSearchParams();
    if (filters.year !== String(CURRENT_YEAR)) next.set('year', filters.year);
    setSp(next, { replace: true });
  };

  return (
    <ReportShell
      title="Comprobantes ARC"
      description={`Comprobante anual de retenciones (Decreto 1.808) · ejercicio fiscal ${filters.year}`}
      kpis={
        <KpiRow
          items={[
            {
              icon: Users,
              tone: 'blue',
              label: 'Beneficiarios',
              value: formatNumber(beneficiaries.length),
              hint: 'Médicos y centros con retenciones en el año',
            },
            {
              icon: Receipt,
              tone: 'cyan',
              label: 'Retenciones',
              value: formatNumber(totals.lines),
            },
            {
              icon: Wallet,
              tone: 'warning',
              label: 'Base total',
              value: formatBs(totals.baseBs),
            },
            {
              icon: TrendingUp,
              tone: 'success',
              label: 'Retenido total',
              value: formatBs(totals.retainedBs),
            },
          ]}
        />
      }
    >
      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por nombre, RIF o cédula…"
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <>
              <Select value={filters.year} onValueChange={(v) => updateParam({ year: v })}>
                <SelectTrigger className="h-9 w-40" title="Año fiscal del comprobante ARC">
                  <SelectValue placeholder="Año" />
                </SelectTrigger>
                <SelectContent>
                  {arcYears.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      Año: {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.providerType || 'all'}
                onValueChange={(v) => updateParam({ providerType: v === 'all' ? undefined : v })}
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tipo: todos</SelectItem>
                  <SelectItem value="doctor">Médicos</SelectItem>
                  <SelectItem value="care_center">Centros</SelectItem>
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
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Beneficiario</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Tipo</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Persona</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Documento</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Retenciones</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Base Bs.</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Retenido Bs.</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <SkeletonTableRows rows={6} columns={COLUMNS} />
              ) : paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS} className="p-0">
                    <EmptyState
                      icon={Receipt}
                      title={hasActiveFilters ? 'Sin resultados' : 'Sin retenciones en el año'}
                      description={
                        hasActiveFilters
                          ? 'Ajusta los filtros para ver más resultados.'
                          : `No hay retenciones registradas en el ejercicio ${filters.year}.`
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((b) => (
                  <TableRow
                    key={`${b.providerType}:${b.providerId}`}
                    className="hover:bg-[oklch(0.985_0.003_250)]"
                  >
                    <TableCell className="py-3.5 px-4 text-sm font-medium">{b.name}</TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      <Badge variant="outline" className="text-xs font-normal">
                        {PROVIDER_LABEL[b.providerType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      <Badge variant="outline" className="text-xs font-normal">
                        {b.personType === 'legal_entity' ? 'Jurídico' : 'Natural'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono">
                      {b.rif ?? b.cedula ?? '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-muted-foreground">
                      {formatNumber(b.lines.length)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-muted-foreground">
                      {formatBs(b.totalBaseBs)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatBs(b.totalRetainedBs)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-right">
                      {report ? <ArcRowDownload report={report} beneficiary={b} /> : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <DataTablePagination
            page={filters.page}
            pageSize={filters.limit}
            total={beneficiaries.length}
            lastPage={lastPage}
            onPageChange={(p) => updateParam({ page: String(p) }, false)}
            onPageSizeChange={(limit) => updateParam({ limit: String(limit) })}
            itemLabel="beneficiarios"
          />
        </div>
      </div>
    </ReportShell>
  );
}
