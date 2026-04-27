# Handoff: Sistema de estilos AFMI / BSMAI

## Overview
Sistema visual unificado para **BSMAI-Front** (Billing System for Medical Appointments and Insurance) — el frontend de gestión médica de AFMI. Cubre menú lateral, header, dashboard, tablas, modales (eliminar / habilitar / deshabilitar), formularios, login, toasts, estados vacíos y de carga.

El objetivo es **reemplazar el tema neutro actual del repo** (`src/index.css` con tokens grises de shadcn) por un sistema coherente con la marca AFMI: azul profundo + cian, tono clínico-moderno.

## About the Design Files
Los archivos en este paquete (`BSMAI Style Guide.html` + `styles.css`) son **referencias de diseño en HTML** — prototipos que muestran cómo debe verse la UI, **no código de producción para copiar directo**. La tarea es **recrearlos en el entorno actual del repo** (`React 19 + Vite + Tailwind 4 + shadcn/ui radix-vega + Inter + Lucide`), reutilizando los componentes shadcn ya instalados en `src/components/ui/`.

## Fidelity
**High-fidelity (hifi)** — colores, tipografía, espaciado y radios son finales. Toma los valores exactos del CSS y mapéalos a los tokens shadcn de `src/index.css`.

## Repo objetivo
- Repo: `sadsleven/BSMAI-Front` (rama `master`)
- Stack: React 19, Vite 7, TypeScript 5.9, Tailwind 4, shadcn/ui (style `radix-vega`, baseColor `neutral`), `@fontsource-variable/inter`, `lucide-react`, `@tanstack/react-table`, `zustand`, `axios`, `zod`.
- Estructura por módulos: `src/modules/<feature>/{domain,infrastructure,presentation}`.
- Componentes shadcn ya disponibles: `button`, `card`, `input`, `label`, `select`, `table`, `textarea`, `badge`, `alert-dialog`, `dropdown-menu`, `combobox`, `separator`, `field`, `input-group`.

---

## Design Tokens — pegar en `src/index.css`

Reemplaza el bloque `:root` con estos valores. Mantén la sección `.dark` y `@theme inline` como están; solo sobreescribe los tokens listados.

```css
:root {
  /* AFMI brand */
  --brand-blue:        oklch(0.50 0.13 255);
  --brand-blue-strong: oklch(0.42 0.14 258);
  --brand-blue-soft:   oklch(0.95 0.025 250);
  --brand-cyan:        oklch(0.74 0.13 210);
  --brand-cyan-strong: oklch(0.65 0.14 210);
  --brand-cyan-soft:   oklch(0.96 0.04 210);

  /* shadcn tokens — sobrescritos */
  --primary: var(--brand-blue);
  --primary-foreground: oklch(0.99 0 0);
  --accent: var(--brand-cyan-soft);
  --accent-foreground: var(--brand-blue-strong);
  --ring: var(--brand-blue);
  --muted-foreground: oklch(0.45 0.005 260);
  --border: oklch(0.92 0.005 250);
  --input: oklch(0.92 0.005 250);
  --destructive: oklch(0.58 0.22 27);

  /* extras (no estaban en shadcn base) */
  --destructive-soft: oklch(0.96 0.03 27);
  --warning: oklch(0.74 0.16 70);
  --warning-soft: oklch(0.97 0.05 80);
  --success: oklch(0.62 0.14 155);
  --success-soft: oklch(0.96 0.04 155);

  /* sidebar */
  --sidebar: oklch(1 0 0);
  --sidebar-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.93 0.005 250);
  --sidebar-accent: var(--brand-blue-soft);
  --sidebar-accent-foreground: var(--brand-blue-strong);
  --sidebar-primary: var(--brand-blue);
  --sidebar-primary-foreground: oklch(0.99 0 0);
}
```

Y agrega los tokens semánticos al `@theme inline`:
```css
--color-warning: var(--warning);
--color-success: var(--success);
--color-destructive-soft: var(--destructive-soft);
--color-warning-soft: var(--warning-soft);
--color-success-soft: var(--success-soft);
--color-brand-cyan: var(--brand-cyan);
--color-brand-cyan-soft: var(--brand-cyan-soft);
```

### Escala tipográfica
Inter Variable (ya instalada). Aplica vía clases Tailwind:
| Token | Tailwind | Uso |
|---|---|---|
| Display | `text-[32px] font-extrabold tracking-[-0.02em]` | hero numbers |
| H1 page | `text-[26px] font-bold tracking-[-0.02em]` | encabezado de página |
| H2 section | `text-xl font-bold` | secciones de form |
| H3 card | `text-[15px] font-semibold` | títulos de cards |
| Body | `text-sm` | tablas, párrafos |
| Caption | `text-xs text-muted-foreground` | hints, fechas |
| Overline | `text-[11px] font-semibold uppercase tracking-[0.06em]` | column headers |

### Radios y sombras
- Radio base ya existente: `--radius: 0.625rem`. Mantenlo.
- Cards y modales: `rounded-xl` (12px). Botones e inputs: `rounded-md` (8px). Badges: `rounded-full`.
- Sombras: usar `shadow-xs` para cards estándar, `shadow-md` para toasts/dropdowns, `shadow-lg` para modales.

---

## Screens / Views

### 1. Sidebar — `src/layouts/components/Sidebar.tsx`

**Layout:** ancho fijo `w-64` (256px), altura `h-screen`, fondo `bg-sidebar`, borde derecho `border-r border-sidebar-border`. Flex column.

**Estructura:**
- **Brand header** (top, padding 20px): mark cuadrado 36×36 con gradiente `from-cyan to-blue` mostrando "A", al lado dos líneas "AFMI" / "Sistema clínico".
- **Sección "Principal"** con items: Dashboard, Pacientes, Doctores, Aseguradoras, Servicios médicos, Órdenes (con badge de contador), Facturación, Reportes.
- **Sección "Administración"** con: Usuarios, Roles y permisos, Configuración.
- **Footer** (bottom, padding 12px, border-top): user chip (avatar 32×32 con gradiente, nombre + rol) + botón logout que limpia store y navega a `/login`.

**Etiqueta de sección** (`<div className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Principal</div>`).

**Nav item** (component reutilizable):
- Default: `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[oklch(0.30_0.02_255)] font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground`.
- Active: `bg-[var(--brand-blue-soft)] text-[var(--brand-blue-strong)] font-semibold` + barra cian al borde izquierdo (`::before` 3px de ancho, `bg-brand-blue`, posicionado a `left:-12px`).
- Icon size: `w-[18px] h-[18px]` lucide.
- Badge contador a la derecha (`ml-auto`): pill cian con texto blanco, `text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-cyan`.

**Iconos por módulo (lucide):**
| Módulo | Icono |
|---|---|
| Dashboard | `Home` |
| Pacientes | `UserRound` |
| Doctores | `Stethoscope` |
| Aseguradoras | `Shield` |
| Servicios médicos | `ClipboardList` |
| Órdenes | `FileText` |
| Facturación | `Receipt` |
| Reportes | `BarChart3` |
| Usuarios | `Users` |
| Roles | `Shield` |
| Configuración | `Settings` |

### 2. Navbar — `src/layouts/components/Navbar.tsx`

**3 variantes** según contexto. Implementar como prop `variant: 'breadcrumbs' | 'search' | 'compact'`.

**Común:** `h-16 border-b bg-card flex items-center px-6 gap-4`.

**Variante A — Breadcrumbs + acciones (default):**
- Izq: breadcrumbs (`AFMI > Pacientes > María González`) con separadores `ChevronRight` color `oklch(0.80 0.005 250)`. Último crumb: `font-semibold text-[oklch(0.20_0.02_255)]`.
- Centro: search 320px (`Search` icon left, placeholder, focus ring azul de 3px).
- Der: bell icon button (con dot cian), avatar 36×36 con gradiente.

**Variante B — Búsqueda prominente:** search 480px sin breadcrumbs, botón "Nueva orden" outline antes del bell.

**Variante C — Compacto:** botón "Volver" ghost con `ChevronLeft`, título de página inline, "Cancelar" + "Guardar" a la derecha.

### 3. Dashboard — nuevo `src/modules/dashboard/presentation/pages/DashboardPage.tsx`

**Page header:** flex justify-between. Izq: `<h1 className="text-[26px] font-bold tracking-[-0.02em]">Buenas tardes, Dr. Rivero</h1>` + subtítulo "Resumen del día · 26 de abril, 2026". Der: botones "Exportar" outline + "Nueva orden" primary.

**KPI Grid:** `grid grid-cols-4 gap-4`. Cada KPI:
- Card padding 18/20px, border + `shadow-xs`, `rounded-xl`.
- Icon container 36×36 `rounded-lg` con tinte de color (blue/cyan/amber/green soft variants).
- Label uppercase 12px, value 26px font-bold, delta con icono trending y color success/destructive.

**Layout secundario:** `grid grid-cols-[2fr_1fr] gap-4`:
- Card "Órdenes recientes" con tabla compacta (5 filas).
- Card "Próximas citas" con lista de items (hora 42×42 cuadrado azul soft, nombre + tipo, badge de estado).

### 4. Tabla de listado — reemplazar `src/modules/users/presentation/pages/UserList.tsx`

Aplica el mismo patrón a Pacientes, Doctores, Aseguradoras, Servicios, Órdenes.

**Estructura:**
1. Page header (title + count subtítulo + actions Exportar/Nuevo).
2. Card que contiene:
   - **Toolbar** (`p-4 border-b flex items-center gap-3`): search 320px max + 3 filtros con `Filter` icon y `ChevronDown` (Aseguradora, Estado, Rango de fechas) + spacer + "Limpiar filtros" ghost.
   - **Tabla** densidad cómoda (padding `py-3.5 px-4`):
     - Header: `bg-[oklch(0.985_0.003_250)] text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground`.
     - Filas: hover `bg-[oklch(0.985_0.003_250)]`, border-bottom entre filas.
     - Columna "Paciente": avatar 32px gradiente + nombre (font-semibold) + email debajo (text-xs muted).
     - Columna "Estado": badge con dot.
     - Columna "Acciones": grupo de 3 botones icon (Eye/Edit/Trash); Trash con hover rojo soft.
   - **Pagination footer** (`p-4 border-t bg-muted flex justify-between`): info "Mostrando 1–10 de 1,284" + page buttons (active = primary).

Usar `@tanstack/react-table` (ya instalado) para sorting/filtering. Mover toolbar y pagination a componentes reutilizables: `<DataTableToolbar>`, `<DataTablePagination>`.

### 5. Modal Eliminar — usar `<AlertDialog>` de shadcn

Reemplaza el `confirm()` nativo del UserList actual.

**Layout:** width 460px, `rounded-2xl`, `shadow-lg`.

**Header** (padding 22px 24px, gap 14px):
- Icon container 40×40 `rounded-full bg-destructive-soft text-destructive` con `AlertTriangle`.
- Texto: `<h3>¿Eliminar paciente?</h3>` + descripción mencionando el nombre en bold.
- Close button (X) a la derecha, ghost.

**Body:**
- Banner amarillo soft con `Info` icon: "Se eliminarán también X órdenes y $YYY en facturación pendiente."
- Checkbox: "Entiendo que esta acción es permanente." (debe estar marcado para habilitar el botón destructivo).

**Footer:** "Cancelar" outline + "Eliminar paciente" destructive (rojo sólido).

### 6. Modal Habilitar/Deshabilitar

Mismo patrón pero **sin checkbox de confirmación** (es reversible). Dos variantes:
- **Deshabilitar**: icon `Power` en `bg-warning-soft text-warning`, botón ámbar.
- **Habilitar**: icon `Power` en `bg-success-soft text-success`, botón primary azul con ícono `Check`.

### 7. Formulario — reemplazar `UserCreate.tsx` / `UserEdit.tsx`

**Patrón:** layout 2 columnas con secciones en cards separadas.

**Page header:** título + "Cancelar"/"Guardar" en la esquina superior derecha (sticky si la página es larga).

**Card de sección:**
- Header: `<h3>Información personal</h3>` + subtítulo descriptivo.
- Body: `grid grid-cols-2 gap-x-5 gap-y-[18px]`. Campos full-width con `col-span-2`.
- Footer (opcional, en la última card): hint "* obligatorios" + botones acción.

**Field**:
- Label `text-sm font-medium`, asterisco rojo si requerido.
- Input/Select/Textarea con altura 38px, `border rounded-lg`, focus ring azul 3px.
- Hint debajo (`text-xs text-muted-foreground`) o error (`text-xs text-destructive` con `AlertTriangle` icon).
- Variante invalid: borde rojo + ring rojo soft.
- Input-group: con addon izq/der (icono o texto en `bg-muted` con border-divider).
- Switch para booleanos (38×22 pill, tab 18×18 con shadow).

Usa `Zod` (ya instalado) para validar antes de submit.

### 8. Login — reemplazar `LoginPage.tsx`

**Stage:** fondo gradient `linear-gradient(135deg, oklch(0.96 0.025 220) 0%, oklch(0.98 0.005 250) 50%, oklch(0.96 0.04 200) 100%)`. Dos pseudo-elements con radial-gradients (cian abajo izq, azul arriba der) creando sutil ambient.

**Card:** 420px max, padding 36px, `rounded-2xl shadow-lg`.

**Brand block centrado:**
- Mark 56×56 con gradiente cyan→blue, "A" blanca bold, shadow azul soft.
- "Bienvenido a AFMI" font-bold 22px.
- Subtítulo muted 13px.

**Form:**
- Email con input-group (Mail icon left).
- Password con input-group (Lock icon left, Eye icon right toggleable).
- Row entre form: "Recordarme" checkbox + "¿Olvidaste tu contraseña?" link azul.
- Botón "Entrar" primary `lg` full-width.

Mantener flujo JWT actual (`authApi.login` + `setAccessToken`).

### 9. Toasts — instalar `sonner`

```bash
npm install sonner
```

En `App.tsx` o root:
```tsx
import { Toaster } from 'sonner';

<Toaster
  position="top-right"
  toastOptions={{
    unstyled: true,
    classNames: {
      toast: 'toast',
      success: 'toast success',
      error: 'toast danger',
      warning: 'toast warning',
      info: 'toast info',
    },
  }}
/>
```

Las clases `.toast`, `.toast.success`, etc. están definidas en `styles.css` (border-left coloreado). Migrarlas a Tailwind o mantener en `index.css` como utilities.

### 10. Empty state y Skeleton

**Empty state:** centrado, icon container 56×56 `rounded-2xl bg-brand-blue-soft text-brand-blue` con icono `FolderOpen`, h3 + descripción muted + CTA primary.

**Skeleton:** filas en `<Table>` durante loading. `bg-gradient` animado con `@keyframes` (200% width, mover de derecha a izquierda en 1.5s).

---

## Color Palette (hex equivalents)

| Token | OKLCH | Hex aprox |
|---|---|---|
| `--brand-blue` (primary) | `0.50 0.13 255` | `#1E5AA8` |
| `--brand-blue-strong` | `0.42 0.14 258` | `#1A4A8E` |
| `--brand-blue-soft` | `0.95 0.025 250` | `#EAF1F9` |
| `--brand-cyan` (accent) | `0.74 0.13 210` | `#2BB7C9` |
| `--brand-cyan-strong` | `0.65 0.14 210` | `#1A99AB` |
| `--brand-cyan-soft` | `0.96 0.04 210` | `#E5F6F8` |
| `--success` | `0.62 0.14 155` | `#3BA76A` |
| `--warning` | `0.74 0.16 70` | `#D89A28` |
| `--destructive` | `0.58 0.22 27` | `#D8351F` |
| `--background` | `1 0 0` | `#FFFFFF` |
| `app bg` (fuera de cards) | `0.985 0.003 250` | `#F8FAFC` |
| `--border` | `0.92 0.005 250` | `#E4E8EE` |
| `--muted-foreground` | `0.45 0.005 260` | `#5C6371` |

---

## Plan de implementación recomendado

1. **Tokens primero** (1 commit): actualizar `src/index.css` con la paleta AFMI. Verifica que el botón primary, focus rings y selección cambien a azul.
2. **Layout** (1 commit): rebuild `Sidebar.tsx` (logo AFMI, items con iconos lucide, secciones, badge de contador, active state con barra cian) + `Navbar.tsx` (variante A breadcrumbs por defecto).
3. **Componentes shadcn extras**: instalar `npx shadcn@latest add alert-dialog sonner`. Crear `<DataTableToolbar>` y `<DataTablePagination>` reutilizables en `src/components/ui/`.
4. **Module pages**: aplicar el patrón a `users/`, luego replicar carpeta para `patients/`, `doctors/`, `insurers/`, `services/`, `orders/`. Cada una con `*List`, `*Create`, `*Edit`.
5. **LoginPage** rediseñada con el bloque brand.
6. **Dashboard** nuevo en `src/modules/dashboard/`.
7. **Toasts globales** con sonner — reemplazar todos los `alert()` y `confirm()`.

---

## Files in this bundle

- `BSMAI Style Guide.html` — visualización completa con todas las vistas. Abrir en navegador para ver el sistema en contexto.
- `styles.css` — CSS de referencia con todos los tokens, componentes y utilidades. Usar como spec de medidas exactas. **No copiarlo entero al repo** — extraer valores y aplicarlos vía Tailwind / `index.css`.

## Notas finales para Claude Code

- **Mantén la arquitectura por módulos** del repo (`domain/infrastructure/presentation`).
- **Reutiliza componentes shadcn existentes** (`Button`, `Input`, `Card`, `Table`, `AlertDialog`, etc.) — solo reestilízalos vía tokens, no reinventes.
- **No agregues librerías de CSS nuevas** (NO styled-components, NO emotion). Todo debe ir en Tailwind 4 + tokens en `index.css`.
- **Iconos: solo `lucide-react`** (ya instalada). No mezclar con otras librerías.
- **JWT y axios sin cambios** — la migración es 100% visual.
- **Internacionalización**: todos los textos en español.
