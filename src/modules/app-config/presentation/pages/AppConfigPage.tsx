import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormSection, FormGrid } from '@/components/ui/form-section';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Settings, Percent } from 'lucide-react';
import { notify } from '@/lib/notifications/toast';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { appConfigGateway } from '../../infrastructure/appConfigGateway';

const MIN_PERCENT = 0;
const MAX_PERCENT = 50;

function isValidPercent(input: string): boolean {
  if (input.trim() === '') return false;
  const n = Number(input.replace(',', '.'));
  return Number.isFinite(n) && n >= MIN_PERCENT && n <= MAX_PERCENT;
}

/** Campo de porcentaje con sufijo % y validación inline. */
function PercentField(props: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  loading: boolean;
}) {
  const { id, label, hint, value, onChange, disabled, loading } = props;
  const valid = isValidPercent(value.trim());
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label} <span className="text-destructive">*</span>
      </Label>
      {loading ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <div className="relative">
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            min={MIN_PERCENT}
            max={MAX_PERCENT}
            step="0.01"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-invalid={!valid}
            className="pr-8"
          />
          <Percent className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      )}
      {!valid && !loading ? (
        <p className="text-xs text-destructive flex items-center gap-1 mt-1">
          <AlertTriangle className="w-3 h-3" />
          Ingresá un valor entre {MIN_PERCENT} y {MAX_PERCENT}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function AppConfigPage() {
  const { has } = usePermissions();
  const canUpdate = has(PERMISSIONS.APP_CONFIG.UPDATE);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [firstInput, setFirstInput] = useState('');
  const [totalInput, setTotalInput] = useState('');
  const [initial, setInitial] = useState<{ first: number; total: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await appConfigGateway.getCasheaCommission();
        if (cancelled) return;
        const first = +(cfg.firstInstallmentRate * 100).toFixed(2);
        const total = +(cfg.totalRate * 100).toFixed(2);
        setInitial({ first, total });
        setFirstInput(first.toString());
        setTotalInput(total.toString());
      } catch (e) {
        if (!cancelled) {
          setError('No se pudo cargar la configuración');
          notify.fromError(e, 'No se pudo cargar la configuración.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const firstValid = isValidPercent(firstInput.trim());
  const totalValid = isValidPercent(totalInput.trim());
  const valid = firstValid && totalValid;
  const parsedFirst = firstValid ? Number(firstInput.trim().replace(',', '.')) : NaN;
  const parsedTotal = totalValid ? Number(totalInput.trim().replace(',', '.')) : NaN;
  const dirty =
    initial !== null &&
    valid &&
    (Math.abs(parsedFirst - initial.first) > 0.0001 ||
      Math.abs(parsedTotal - initial.total) > 0.0001);

  const onSave = async () => {
    if (!valid) return;
    try {
      setSaving(true);
      const updated = await appConfigGateway.updateCasheaCommission({
        firstInstallmentRate: +(parsedFirst / 100).toFixed(4),
        totalRate: +(parsedTotal / 100).toFixed(4),
      });
      const first = +(updated.firstInstallmentRate * 100).toFixed(2);
      const total = +(updated.totalRate * 100).toFixed(2);
      setInitial({ first, total });
      setFirstInput(first.toString());
      setTotalInput(total.toString());
      notify.success('Comisión Cashea actualizada');
    } catch (e) {
      notify.fromError(e, 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageBreadcrumbs />
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-cyan-soft text-brand-cyan-strong flex items-center justify-center shrink-0">
            <Settings className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
              Configuración
            </h1>
            <p className="text-sm text-muted-foreground">
              Parámetros globales del sistema. Los cambios sólo afectan las nuevas órdenes;
              las órdenes existentes conservan los valores con los que fueron creadas.
            </p>
          </div>
        </div>

        <FormSection
          title="Cashea"
          description="Comisión que retiene Cashea por orden, en dos tramos. La cuenta por cobrar se genera por el neto: precio − (primera cuota × % primera cuota) − (precio × % total)."
        >
          <FormGrid>
            <PercentField
              id="firstInstallmentRate"
              label="% sobre la primera cuota"
              hint="Aplica al monto de la primera cuota (inicial). Ej: 4 para 4%."
              value={firstInput}
              onChange={setFirstInput}
              disabled={!canUpdate || saving}
              loading={loading}
            />
            <PercentField
              id="totalRate"
              label="% sobre el total"
              hint="Aplica al total de la orden. Ej: 6 para 6%."
              value={totalInput}
              onChange={setTotalInput}
              disabled={!canUpdate || saving}
              loading={loading}
            />
          </FormGrid>
        </FormSection>

        {error ? (
          <div className="px-4 py-2 text-sm text-destructive border rounded-md bg-destructive-soft">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            disabled={!canUpdate || !valid || !dirty || saving || loading}
            onClick={onSave}
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>

        {!canUpdate ? (
          <p className="text-xs text-muted-foreground italic">
            Solo lectura. No tenés permiso para editar la configuración.
          </p>
        ) : null}
      </div>
    </div>
  );
}
