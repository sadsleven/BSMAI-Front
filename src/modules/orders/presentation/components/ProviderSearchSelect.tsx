import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, BriefcaseMedical, Hospital, X, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { doctorGateway } from '@/modules/doctors/infrastructure/doctorGateway';
import { careCenterGateway } from '@/modules/care-centers/infrastructure/careCenterGateway';
import type { Doctor } from '@/modules/doctors/domain/models/doctor';
import type { CareCenter } from '@/modules/care-centers/domain/models/careCenter';
import type { Specialty } from '@/modules/specialties/domain/models/specialty';
import { cn } from '@/lib/utils';

export type ProviderSelectValue =
  | { providerType: 'doctor'; doctor: Doctor }
  | { providerType: 'care_center'; careCenter: CareCenter };

export type ProviderSearchSelectProps = {
  providerType: 'doctor' | 'care_center';
  value: ProviderSelectValue | null;
  onChange: (next: ProviderSelectValue | null) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  /** Filtra resultados a proveedores con esta especialidad. */
  specialtyId?: string;
  /** Etiqueta y bordes compactos para uso embebido en tabla. */
  compact?: boolean;
  /** Oculta el label superior. */
  hideLabel?: boolean;
};

export function providerLabel(v: ProviderSelectValue): string {
  if (v.providerType === 'doctor') return `${v.doctor.firstName} ${v.doctor.lastName}`.trim();
  return v.careCenter.businessName;
}

export function providerSpecialties(v: ProviderSelectValue): Specialty[] {
  return v.providerType === 'doctor' ? v.doctor.specialties : v.careCenter.specialties;
}

export function ProviderSearchSelect({
  providerType,
  value,
  onChange,
  required,
  disabled,
  error,
  specialtyId,
  compact,
  hideLabel,
}: ProviderSearchSelectProps) {
  const [query, setQuery] = useState('');
  const [docResults, setDocResults] = useState<Doctor[]>([]);
  const [ccResults, setCcResults] = useState<CareCenter[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Posiciona el dropdown (portal fixed) anclado al input. Recalcula en scroll/resize.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const trimmed = query.trim();
      setLoading(true);
      try {
        if (providerType === 'doctor') {
          const res = await doctorGateway.list({
            limit: 10,
            search: trimmed || undefined,
            isActive: true,
            specialtyId: specialtyId || undefined,
          });
          setDocResults(res.data);
        } else {
          const res = await careCenterGateway.list({
            limit: 10,
            search: trimmed || undefined,
            isActive: true,
            specialtyId: specialtyId || undefined,
          });
          setCcResults(res.data);
        }
      } catch {
        setDocResults([]);
        setCcResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, open, providerType, specialtyId]);

  const selectedLabel = useMemo(() => (value ? providerLabel(value) : ''), [value]);
  const Icon = providerType === 'doctor' ? BriefcaseMedical : Hospital;
  const labelText = providerType === 'doctor' ? 'Doctor' : 'Centro de atención';

  return (
    <div className={cn('space-y-1.5', compact && 'space-y-0')} ref={wrapRef}>
      {!hideLabel && (
        <Label className="text-sm font-medium flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          {labelText}
          {required ? <span className="text-destructive">*</span> : null}
        </Label>
      )}
      {value ? (
        <div className={cn('flex items-center gap-2 p-2 border rounded-lg bg-muted/30', error && 'border-destructive')}>
          <Badge variant="default">{selectedLabel}</Badge>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            className="ml-auto p-1 rounded hover:bg-accent"
            title="Quitar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative" ref={anchorRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder={`Buscar ${labelText.toLowerCase()}…`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            disabled={disabled}
            className={cn('h-9 pl-9', error && 'border-destructive')}
          />
          {open && rect ? (
            createPortal(
            <div
              ref={dropdownRef}
              style={{
                position: 'fixed',
                top: rect.top,
                left: rect.left,
                width: rect.width,
              }}
              className="z-50 max-h-[280px] overflow-y-auto rounded-lg border bg-card shadow-md"
            >
              {loading ? (
                <div className="p-3 text-sm text-muted-foreground">Buscando…</div>
              ) : providerType === 'doctor' ? (
                docResults.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">Sin resultados.</div>
                ) : (
                  <ul className="py-1">
                    {docResults.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onChange({ providerType: 'doctor', doctor: d });
                            setOpen(false);
                            setQuery('');
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                        >
                          <div className="font-medium">
                            {d.firstName} {d.lastName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {d.cedula} · {d.email}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : ccResults.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">Sin resultados.</div>
              ) : (
                <ul className="py-1">
                  {ccResults.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange({ providerType: 'care_center', careCenter: c });
                          setOpen(false);
                          setQuery('');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                      >
                        <div className="font-medium">{c.businessName}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.rif} · {c.email}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>,
            document.body,
            )
          ) : null}
        </div>
      )}
      {error ? (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
