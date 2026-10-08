import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DetailBadge,
  DetailRow,
  DetailSection,
} from '@/components/ui/detail-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { PageLoader } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ArrowRight,
  ChevronLeft,
  Pencil,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { formatDateOnly, formatCreatedDateTime } from '@/lib/dates';
import { formatMoney } from '@/lib/format/money';
import { Can } from '@/modules/auth/presentation/components/Can';
import {
  holderDisplayId,
  holderDisplayName,
  orderUserDisplayName,
} from '@/modules/orders/domain/models/order';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { budgetGateway } from '../../infrastructure/budgetGateway';
import {
  BUDGET_TYPE_LABEL,
  budgetAdjustment,
  budgetDiagnosisText,
  budgetIsEditable,
  budgetLinesTotalUsd,
  budgetRowTotalUsd,
  type Budget,
} from '../../domain/models/budget';
import { BudgetExportMenu } from '../components/BudgetExportMenu';

export function BudgetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setBudget(await budgetGateway.getById(id));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo cargar el presupuesto.',
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <PageLoader label="Cargando presupuesto…" />;
  if (error || !budget) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageBreadcrumbs />
        <EmptyState
          title="Presupuesto no disponible"
          description={error ?? 'No se encontró el presupuesto.'}
          action={
            <Button variant="outline" onClick={() => navigate('/budgets')}>
              Volver a presupuestos
            </Button>
          }
        />
      </div>
    );
  }

  const rows = [...(budget.budgetServiceTypes ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  const linesTotal = budgetLinesTotalUsd(budget);
  const adjustment = budgetAdjustment(budget);
  const editable = budgetIsEditable(budget);
  const rateBs = budget.exchangeRate ? Number(budget.exchangeRate.amountBs) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageBreadcrumbs />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em]">
              Presupuesto {budget.budgetNumber}
            </h1>
            {budget.expired ? (
              <DetailBadge tone="warning">Vencido</DetailBadge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {holderDisplayName(budget.patient)} ·{' '}
            {formatDateOnly(budget.budgetDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/budgets"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Volver
          </Link>
          <Can permission={PERMISSIONS.BUDGETS.LIST}>
            <BudgetExportMenu budget={budget} variant="outline" />
          </Can>
          {editable ? (
            <Can permission={PERMISSIONS.BUDGETS.UPDATE}>
              <Link to={`/budgets/edit/${budget.id}`}>
                <Button variant="outline" className="gap-1.5">
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
              </Link>
            </Can>
          ) : null}
        </div>
      </div>

      {/* Enlace con la orden: el único hito del presupuesto. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4 shadow-xs">
        {budget.convertedOrder ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              Este presupuesto generó la orden
            </span>
            <Link
              to={`/orders/${budget.convertedOrderId}`}
              className="font-semibold text-brand-blue-strong hover:underline"
            >
              N° {budget.convertedOrder.orderNumber}
            </Link>
            {budget.convertedAt ? (
              <span className="text-muted-foreground">
                · {formatCreatedDateTime(budget.convertedAt)}
              </span>
            ) : null}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Descarga el presupuesto para entregarlo. Si lo aceptan, crea la
              orden con estos mismos datos.
            </p>
            <Can permission={PERMISSIONS.BUDGETS.CONVERT}>
              <Link to={`/orders/create?budget=${budget.id}`} className="ml-auto">
                <Button className="gap-1.5">
                  Crear orden
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </Can>
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <DetailSection title="Datos generales">
            <DetailRow label="N°" value={budget.budgetNumber} mono />
            <DetailRow label="Sucursal" value={budget.branch?.name} />
            <DetailRow label="Tipo" value={BUDGET_TYPE_LABEL[budget.type]} />
            <DetailRow
              label="Fecha"
              value={formatDateOnly(budget.budgetDate)}
            />
            <DetailRow
              label="Válido hasta"
              value={
                budget.validUntilDate
                  ? formatDateOnly(budget.validUntilDate)
                  : null
              }
            />
            <DetailRow
              label="Creado por"
              value={orderUserDisplayName(budget.createdBy)}
            />
            <DetailRow
              label="Creado"
              value={formatCreatedDateTime(budget.createdAt)}
            />
          </DetailSection>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <DetailSection title="Titular y paciente">
            <DetailRow
              label="Titular"
              value={holderDisplayName(budget.holder)}
            />
            <DetailRow label="CI / RIF" value={holderDisplayId(budget.holder)} />
            <DetailRow
              label="Paciente"
              value={holderDisplayName(budget.patient)}
            />
            <DetailRow label="Cédula" value={holderDisplayId(budget.patient)} />
            <DetailRow
              label="Teléfono"
              value={budget.patient?.phones?.[0]?.number}
            />
            {budget.insurance ? (
              <>
                <DetailRow label="Seguro" value={budget.insurance.name} />
                <DetailRow label="RIF seguro" value={budget.insurance.rif} />
                <DetailRow
                  label="Origen"
                  value={
                    budget.insuranceSource === 'direct'
                      ? 'Directo'
                      : `Vía ${budget.contractor?.name ?? 'contratista'}`
                  }
                />
              </>
            ) : null}
            <DetailRow label="Diagnóstico" value={budgetDiagnosisText(budget)} />
          </DetailSection>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="border-b px-4 py-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Servicios presupuestados
          </h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-brand-blue-soft hover:bg-brand-blue-soft">
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Servicio
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Proveedor
              </TableHead>
              <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Cant.
              </TableHead>
              <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                P. unit. $
              </TableHead>
              <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Total $
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id ?? `${r.serviceTypeId}-${r.position}`}>
                <TableCell className="px-4 py-3">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">{r.customName}</div>
                    {r.serviceType && r.serviceType.name !== r.customName ? (
                      <div className="text-xs text-muted-foreground">
                        {r.serviceType.name}
                      </div>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                  {r.providerType === 'doctor'
                    ? holderDisplayName(r.doctor)
                    : r.providerType === 'care_center'
                      ? holderDisplayName(r.careCenter)
                      : 'Sin asignar'}
                </TableCell>
                <TableCell className="px-4 py-3 text-right text-sm tabular-nums">
                  {r.quantity}
                </TableCell>
                <TableCell className="px-4 py-3 text-right text-sm tabular-nums">
                  {formatMoney(r.unitPriceUsd)}
                </TableCell>
                <TableCell className="px-4 py-3 text-right text-sm font-medium tabular-nums">
                  {formatMoney(budgetRowTotalUsd(r))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="space-y-1.5 border-t bg-muted/30 px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Suma de servicios</span>
            <span className="tabular-nums">${formatMoney(linesTotal)}</span>
          </div>
          {adjustment ? (
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                {adjustment.isDiscount ? (
                  <TrendingDown className="h-3.5 w-3.5" />
                ) : (
                  <TrendingUp className="h-3.5 w-3.5" />
                )}
                {adjustment.isDiscount ? 'Descuento' : 'Recargo'} sobre catálogo
                {adjustment.percent !== null
                  ? ` (${formatMoney(Math.abs(adjustment.percent))}%)`
                  : ''}
              </span>
              <span className="tabular-nums">
                ${formatMoney(Math.abs(adjustment.amount))}
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t pt-1.5 text-sm font-semibold">
            <span>Total presupuestado</span>
            <span className="tabular-nums">
              ${formatMoney(budget.priceAmount)}
            </span>
          </div>
          {rateBs > 0 ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                En bolívares · tasa {formatMoney(rateBs)}
              </span>
              <span className="tabular-nums">
                {formatMoney(Number(budget.priceAmount) * rateBs)} Bs
              </span>
            </div>
          ) : null}
          {budget.priceAdjustmentNote ? (
            <p className="pt-1 text-xs text-muted-foreground">
              Motivo del ajuste: {budget.priceAdjustmentNote}
            </p>
          ) : null}
        </div>
      </div>

      {budget.referringDoctorName ||
      budget.referringSpecialtyName ||
      budget.observations ||
      budget.paymentAccount ? (
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <DetailSection title="Datos del documento">
            <DetailRow
              label="Médico que refiere"
              value={budget.referringDoctorName}
            />
            <DetailRow
              label="Especialidad"
              value={budget.referringSpecialtyName}
            />
            <DetailRow
              label="Cuenta de pago"
              value={
                budget.paymentAccount
                  ? `${budget.paymentAccount.name}${
                      budget.paymentAccount.accountNumber
                        ? ` · ${budget.paymentAccount.accountNumber}`
                        : ''
                    }`
                  : null
              }
            />
            <DetailRow label="Observaciones" value={budget.observations} />
          </DetailSection>
        </div>
      ) : null}

    </div>
  );
}
