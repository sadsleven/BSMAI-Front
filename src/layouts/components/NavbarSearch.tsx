import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Building2,
  FileText,
  Loader2,
  Search,
  Stethoscope,
  UserRound,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import {
  searchGateway,
  type SearchResultItem,
  type SearchResults,
} from '@/lib/api/searchGateway';

type Group = {
  key: keyof SearchResults;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: string;
  toHref: (item: SearchResultItem) => string;
};

const GROUPS: Group[] = [
  {
    key: 'patients',
    label: 'Pacientes',
    icon: UserRound,
    permission: PERMISSIONS.PATIENTS.LIST,
    toHref: (i) => `/patients/${i.id}`,
  },
  {
    key: 'orders',
    label: 'Órdenes',
    icon: FileText,
    permission: PERMISSIONS.ORDERS.LIST,
    toHref: (i) => `/orders/${i.id}`,
  },
  {
    key: 'doctors',
    label: 'Doctores',
    icon: Stethoscope,
    permission: PERMISSIONS.DOCTORS.LIST,
    toHref: (i) => `/doctors/${i.id}`,
  },
  {
    key: 'careCenters',
    label: 'Centros de atención',
    icon: Building2,
    permission: PERMISSIONS.CARE_CENTERS.LIST,
    toHref: (i) => `/care-centers/${i.id}`,
  },
];

const EMPTY: SearchResults = { patients: [], orders: [], doctors: [], careCenters: [] };

export function NavbarSearch() {
  const navigate = useNavigate();
  const { has } = usePermissions();
  const [value, setValue] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const visibleGroups = useMemo(() => GROUPS.filter((g) => has(g.permission)), [has]);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      abortRef.current?.abort();
      return;
    }
    setLoading(true);
    const t = window.setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      searchGateway
        .search(q, ctrl.signal)
        .then((data) => {
          setResults(data);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (axios.isCancel(err)) return;
          setLoading(false);
        });
    }, 300);
    return () => window.clearTimeout(t);
  }, [value]);

  const totalCount = useMemo(
    () => visibleGroups.reduce((acc, g) => acc + results[g.key].length, 0),
    [results, visibleGroups],
  );

  const goTo = (href: string) => {
    setOpen(false);
    setValue('');
    setResults(EMPTY);
    navigate(href);
  };

  const showPopover = open && value.trim().length >= 2;

  if (!visibleGroups.length) return null;

  return (
    <Popover open={showPopover} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative w-[320px] hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Buscar pacientes, órdenes, doctores…"
            className="h-10 pl-9 bg-muted/40"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (value.trim().length >= 2) setOpen(true);
            }}
          />
          {loading ? (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
          ) : null}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[420px] p-0 rounded-xl shadow-lg overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {loading && totalCount === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Buscando…
          </div>
        ) : totalCount === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Sin resultados</div>
        ) : (
          <div className="max-h-[420px] overflow-auto py-1">
            {visibleGroups.map((g) => {
              const items = results[g.key];
              if (!items.length) return null;
              const Icon = g.icon;
              return (
                <div key={g.key} className="py-1">
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {g.label}
                  </div>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => goTo(g.toHref(item))}
                      className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-center gap-3"
                    >
                      <span className="w-8 h-8 rounded-md bg-brand-blue-soft/60 flex items-center justify-center text-brand-blue shrink-0">
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium truncate">
                          {item.label}
                        </span>
                        {item.sublabel ? (
                          <span className="block text-xs text-muted-foreground truncate">
                            {item.sublabel}
                          </span>
                        ) : null}
                      </span>
                      {item.badge ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                          {item.badge}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
