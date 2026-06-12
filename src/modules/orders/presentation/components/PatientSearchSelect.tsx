import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, UserRound, X, Plus, AlertTriangle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { patientGateway } from '@/modules/patients/infrastructure/patientGateway';
import { displayName, displayIdentifier, type Patient } from '@/modules/patients/domain/models/patient';
import { cn } from '@/lib/utils';

export type PatientSearchSelectProps = {
  label: string;
  value?: Patient | null;
  onChange: (patient: Patient | null) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  /** Si true, restringe a pacientes con seguro y contratista. Tipo `insurance`. */
  hasInsuranceAndContractor?: boolean;
  /** Habilita botón "+ Crear paciente". */
  onCreateClick?: () => void;
  placeholder?: string;
};

/**
 * Selector con búsqueda asíncrona + chip seleccionado + botón crear.
 * Patrón reutilizable: selector con búsqueda + crear-modal del módulo.
 */
export function PatientSearchSelect({
  label,
  value,
  onChange,
  required,
  disabled,
  error,
  hasInsuranceAndContractor,
  onCreateClick,
  placeholder = 'Buscar por cédula, RIF, nombre o razón social…',
}: PatientSearchSelectProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const trimmed = query.trim();
      setLoading(true);
      try {
        const params: Record<string, string> = { limit: '10', isActive: 'true' };
        if (trimmed) params.search = trimmed;
        if (hasInsuranceAndContractor) params.hasInsuranceAndContractor = 'true';
        const res = await patientGateway.list(params as never);
        setResults(res.data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, open, hasInsuranceAndContractor]);

  const selectedLabel = useMemo(() => (value ? displayName(value) : ''), [value]);
  const selectedId = useMemo(() => (value ? displayIdentifier(value) : ''), [value]);

  return (
    <div className="space-y-1.5" ref={wrapRef}>
      <Label className="text-sm font-medium flex items-center gap-2">
        <UserRound className="w-4 h-4 text-muted-foreground" />
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {value ? (
        <div className={cn('flex items-center gap-2 p-2 border rounded-lg bg-muted/30', error && 'border-destructive')}>
          <Badge variant="default">{selectedLabel}</Badge>
          {selectedId ? (
            <span className="text-xs text-muted-foreground">{selectedId}</span>
          ) : null}
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
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder={placeholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              disabled={disabled}
              className={cn('h-9 pl-9 pr-9', error && 'border-destructive')}
            />
            {loading ? (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
            ) : null}
            {open ? (
              <div className="absolute z-30 mt-1 w-full max-h-[280px] overflow-y-auto rounded-lg border bg-card shadow-md">
                {loading ? (
                  <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando opciones…
                  </div>
                ) : results.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">Sin resultados.</div>
                ) : (
                  <ul className="py-1">
                    {results.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onChange(p);
                            setOpen(false);
                            setQuery('');
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                        >
                          <div className="font-medium">{displayName(p)}</div>
                          <div className="text-xs text-muted-foreground">
                            {displayIdentifier(p) || '—'} · {p.email}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
          {onCreateClick ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={onCreateClick}
              disabled={disabled}
            >
              <Plus className="w-4 h-4 mr-1" /> Crear
            </Button>
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
