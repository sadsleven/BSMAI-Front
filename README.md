# AFMI Front

Frontend de **AFMI**: panel de administración conectado al backend REST de NestJS. Stack: Vite 7 + React 19 + TypeScript + Tailwind 4 + shadcn/ui + Zustand + Axios + React Router 7.

## Requisitos

- Node.js LTS
- npm

## Inicio rápido

```bash
npm install
cp .env.example .env
npm run dev
```

- Desarrollo: [http://localhost:5173](http://localhost:5173)
- El backend debe permitir CORS desde el origen del front (`CORS_ORIGIN=http://localhost:5173`).

## Variables de entorno

Solo se exponen al bundle las que empiezan por `VITE_`.

| Variable | Descripción |
| -------- | ----------- |
| `VITE_API_BASE_URL` | URL base del backend, **sin barra final**. Incluye prefijos si los usa la API. |

```env
VITE_API_BASE_URL=http://localhost:3000
```

## Tecnologías

| Área | Stack |
| ---- | ----- |
| Runtime / build | Vite 7, TypeScript 5.9 |
| UI | React 19, React Router 7 |
| Estilos | Tailwind 4, tw-animate-css |
| Componentes | shadcn/ui (Radix, `class-variance-authority`, `clsx`/`tailwind-merge`) |
| Tablas | `@tanstack/react-table` (disponible) |
| Forms | React Hook Form 7 |
| Validación | Zod 4 + `@hookform/resolvers/zod` |
| Toasts | `sonner` (mediante helper `notify`) |
| Estado global | Zustand |
| HTTP | Axios (instancia única en `src/lib/api/`) |
| Iconos | `lucide-react` |

## Arquitectura

Feature-modular Clean Architecture. Cada feature en `src/modules/<nombre>/` con tres capas:

- **`domain/`** — modelos, tipos, stores Zustand.
- **`infrastructure/`** — gateways HTTP, mapeo DTO, persistencia (token).
- **`presentation/`** — componentes, páginas, hooks de UI.

Código transversal en `src/lib/` (utilidades), `src/components/ui/` (shadcn), `src/layouts/`.

### Módulos actuales

- **`auth/`** — JWT, login, logout, AuthGuard, hook `usePermissions`, componente `<Can>` para gating de UI, página `/profile` (self-service).
- **`users/`** — CRUD usuarios, soft/hard delete, restore, change-password, paginación server-side.
- **`roles/`** — CRUD roles, picker de permisos agrupado por recurso.
- **`specialties/`** — CRUD simple de especialidades clínicas. Endpoint `assignable` para selectores.
- **`patients/`** — CRUD pacientes con cédula, email, dirección, lista dinámica de teléfonos y multi-select de seguros.
- **`doctors/`** — CRUD doctores con RIF condicional, especialidades multi-select y métodos de pago dinámicos.
- **`care-centers/`** — CRUD centros de atención con RIF siempre obligatorio, especialidades y métodos de pago.
- **`banks/`** — sólo lectura: catálogo de bancos venezolanos para selectores de pago móvil/transferencia.
- **`insurances/`** — CRUD seguros con name + description + lista dinámica de teléfonos. Endpoint `assignable` para `<InsuranceMultiSelect>`.
- **`pathologies/`** — CRUD simple de patologías. Endpoint `assignable`.
- **`service-types/`** — CRUD simple de tipos de servicio. Endpoint `assignable`.
- **`branches/`** — CRUD sucursales (name único + description + isActive). Endpoint `assignable` para `<BranchMultiSelect>`. Asignación M2M a usuarios; el Super Admin tiene acceso implícito a todas (no se replican filas en `user_branches`). Helper `getUserBranches(currentUser)` en `src/lib/auth/branches.ts` es la única forma correcta de leer las sucursales del usuario actual.
- **`orders/`** — Paso 1 implementado (registro). Wizard con stepper (5 pasos visibles, pasos 2-5 marcados "Próximamente"). Estados (`draft|in_progress|attended|report_issued|finalized|cancelled`) reemplazan `isActive`. Edición sólo en `draft`. Filtrado por sucursales del usuario (server-side). Última sucursal usada persistida en `localStorage` (`lastBranchId:${userId}`). Sub-recurso pagos (`POST /orders/:id/payments`) con tasa histórica guardada por pago. Componentes `<PatientSearchSelect>` + `<PatientCreateModal>` (patrón "selector + crear inline"), `<ProviderSearchSelect>`, `<OrderPaymentForm>`.

## HTTP

- Instancia única: `src/lib/api/client.ts` (`api`).
- Interceptor de request: añade `Authorization: Bearer <token>` si hay token.
- Interceptor de response: en 401 (excepto `/auth/login` y `/auth/register`) limpia el token y redirige a `/login`.
- `getHttpErrorMessage` unifica mensajes de error (`message` / `error` / `detail`).

## Autenticación (JWT)

### Flujo

1. `LoginPage` → `authApi.login({ email, password })` → backend `POST /auth/login`.
2. La respuesta trae `{ accessToken, user }`. El token se guarda en `localStorage` (clave `afmi_access_token`) vía `tokenStorage`.
3. `AuthGuard`:
   - Si no hay token o el token está vencido, limpia y redirige a `/login`.
   - Si hay token válido, llama a `GET /auth/me` y rellena `authStore` con `AuthUser` (incluye `roles` y `permissions` resueltos del backend).
4. `LogoutPage` (`/logout`) llama a `POST /auth/logout` (revoca el JWT en el backend) y limpia el almacenamiento local antes de redirigir a `/login`.

### Auto-logout por expiración

`src/modules/auth/infrastructure/jwt.ts` decodifica el JWT (sin librería externa) y expone:

- `getJwtExpiryMs(token)` — milisegundos absolutos del `exp`.
- `isJwtExpired(token, skewMs?)` — chequeo inmediato.

`AuthGuard` programa un `setTimeout` que se dispara al `exp` (con un skew de 5 s) y fuerza logout. La duración del JWT se controla 100 % en el backend (`JWT_EXPIRATION`, default 7 días); el front se adapta automáticamente.

### Permisos en la UI

```tsx
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';

<Can permission={PERMISSIONS.USERS.CREATE}>
  <Button>Nuevo usuario</Button>
</Can>

// O imperativo:
const { has, isSuperAdmin } = usePermissions();
if (has('users.update')) { ... }
```

`isSuperAdmin: true` siempre devuelve `true` en `has(...)`. Para gates con varios permisos, `<Can anyOf={[...]}>` o `hasAny([...])`.

## Módulo de Usuarios (`/users`)

- Listado con búsqueda global (debounce 350 ms), sort por columna, paginación server-side.
- Toggle "Incluir eliminados" para ver soft-deleted.
- Crear / editar con asignación de roles (chips clickables) y validación de confirmación de contraseña al crear.
- Cambiar contraseña: ruta dedicada `/users/:id/change-password`. Si es el propio usuario pide la contraseña actual; si no, solo `newPassword` + confirmación.
- Toggle activar/desactivar.
- Eliminar: AlertDialog con dos acciones, "Mover a la papelera" (soft) y "Eliminar permanentemente" (hard, con doble confirmación).
- Badge especial para Super Admin; sus acciones destructivas y de toggle quedan deshabilitadas.

## Convenciones de tablas

Todas las tablas de la app deben seguir este patrón — **no hay controles de sort externos** (botones arriba/abajo de la tabla).

- Sort integrado en los headers vía `<SortableHeader column="..." activeColumn={...} direction={...} onSort={...}>`. Ícono triple-estado (sin sort / asc / desc).
- Filtros server-side: pasados como query params, persistidos en la URL (`useSearchParams`), debounced 300 ms para inputs de texto.
- Paginación server-side: `metadata.total` siempre representa entidades distintas (no filas del JOIN).
- Tabla de usuarios: filtros estado / rol multi-select / estado de borrado (gateado por permiso `users.hard-delete` o `users.restore`).
- Tabla de roles: filtro origen (`Sistema` / `Personalizados` / `Todos`) + estado de borrado.
- Reglas de fila en usuarios: la lógica de qué acciones están habilitadas vive en `getRowActionsState(row, currentUser)` en `src/modules/users/presentation/rowActions.ts`. Botones deshabilitados muestran tooltip explicando por qué.

## Validación de formularios

- Schemas Zod centralizados en `src/lib/validations/schemas.ts`: `loginSchema`, `profileSchema`, `createUserSchema`, `updateUserSchema`, `changeOwnPasswordSchema`, `adminChangePasswordSchema`, `roleSchema`, `specialtySchema`, `patientSchema` (sin `insuranceIds` — los seguros se derivan de contratistas), `doctorSchema`, `careCenterSchema`, `paymentMethodSchema`, `insuranceSchema` (con `email` y `fiscalAddress`), `pathologySchema`, `serviceTypeSchema`, `contractorSchema` (con `insuranceIds`), `orderSchema` (con `serviceTypeIds: array.min(1)` + `pathologyIds: array.optional()`).
- Conectados a React Hook Form via `zodResolver`. Modo de validación: `onBlur` consistente.
- Reglas reutilizables: `emailSchema`, **`optionalEmailSchema`**, `nameSchema(label)`, `phoneSchema`, `passwordSchema`, `cedulaSchema`, `rifSchema`, **`optionalRifSchema`**, `phoneNumberSchema`, `phoneItemSchema`, `phonesArraySchema`, `paymentMethodsArraySchema`. Mensajes en español.
- Reglas duras: nombre 1-150 chars solo letras/acentos/`ñ`; teléfono opcional pero exactamente 11 dígitos si presente; password 8-100 con mayúscula+minúscula+número+especial; cédula `V/E-XX.XXX.XXX`; RIF `J/G/V/E-XX.XXX.XXX-D`; teléfonos para owners 11 dígitos exactos.
- **Campos opcionales con UNIQUE en BE**: el FE espeja con `optionalEmailSchema` / `optionalRifSchema` (empty string passes; valida formato sólo si filled). Forms muestran el label como `Campo (opcional)` sin asterisco. En update, el FE envía `''` (string vacío) para limpiar y `undefined` para no tocar; el BE mapea `''` → `null` y skip uniqueness check si vacío.
- **Teléfonos opcionales**: `phonesArraySchema` ya no exige `.min(1)`. Forms inicializan `phones: []`. `<PhoneListInput>` por defecto `min = 0` y NO renderiza una fila vacía automática.
- Cross-validation con `superRefine`:
  - `doctorSchema` valida `isLegalEntity ↔ rif` (RIF requerido y formato si jurídica; ausente si natural).
  - `paymentMethodSchema` valida campos por tipo (`mobile_payment` exige bankCode + phoneNumber + idDocument; `bank_transfer` exige bankCode + accountNumber + accountHolderName + idDocument; `other` exige description ≥3 chars).

### Formatos venezolanos

`src/lib/validations/ve-formats.ts` exporta `CEDULA_REGEX`, `RIF_REGEX`, `PHONE_REGEX` + helpers `formatCedula`, `formatRif`, `formatPhoneDigits`. Espejados con `afmi-backend/src/shared/validators/ve-formats.ts`.

### Componentes reutilizables de input venezolano

- `<CedulaInput>` (`src/components/ui/cedula-input.tsx`) — input con auto-formato `V-XX.XXX.XXX` mientras se tipea. Acepta `V`/`E`. Placeholder por defecto: `V-12.345.678`. **Usar siempre que el campo sea cédula** — no instanciar `<Input>` plano con regex local.
- `<RifInput>` (`src/components/ui/rif-input.tsx`) — auto-formato `J-XX.XXX.XXX-D`. Acepta `J/G/V/E`. Misma regla de uso obligatorio.
- `<PhoneListInput>` (`src/components/ui/phone-list-input.tsx`) — lista dinámica de teléfonos con `add`/`remove`. Por defecto min=1, max=10. Cada item: número 11 dígitos + label opcional. Errores per-item + arrayError. **Patient/Doctor/CareCenter** lo consumen vía `<Controller>`.
- `<SpecialtyMultiSelect>` (`src/components/ui/specialty-multi-select.tsx`) — multi-select con búsqueda. Carga `/specialties/assignable`. Especialidades ya asignadas que dejaron de ser asignables aparecen como chip punteado, **quitables pero no re-agregables**. Pasar `existing` para mantenerlas.
- `<InsuranceMultiSelect>` (`src/components/ui/insurance-multi-select.tsx`) — multi-select de seguros. Mismo patrón que `<SpecialtyMultiSelect>` (consume `/insurances/assignable`, soporta `existing` para chips stale). Convención general: cualquier relación N-a-M visible en formularios usa este patrón con endpoint `/<resource>/assignable`.
- `<PaymentMethodsInput>` (`src/components/ui/payment-methods-input.tsx`) — lista dinámica de métodos de pago. Type discriminator: `mobile_payment | bank_transfer | other`, cada uno renderiza fields propios. Carga `GET /banks` para `<Select>` de banco. Soporta `defaults` (cedula/rif/fullName/firstPhone): autocompleta al cambiar de tipo o agregar uno nuevo, **sin pisar lo ya tipeado** — el usuario puede sobreescribir manualmente.
- `<ServiceTypePricesInput>` (`src/modules/service-types/presentation/components/ServiceTypePricesInput.tsx`) — editor de precios por tipo de servicio. Renderiza una fila "Particular" + una por cada `Insurance` asignable, cada una con `<CurrencyAmountInput currencyPrefix="USD">` + `currencyPrefix="EUR"`. Helpers: `pricesToPayload(rows)` filtra filas vacías al guardar. **Reutilizar siempre que se editen precios per-seguro**.

### Módulos clínicos

- `specialties` — CRUD simple. Forms con `name` + `description` + `isActive`. List con icon-tile cyan-soft.
- `patients` — Form con `<CedulaInput>` + email **(opcional)** + nombres + birthDate + dirección + `<PhoneListInput>` (opcional) + `<ContractorMultiSelect>` + estado. **Sin `<InsuranceMultiSelect>`** — los seguros del paciente se derivan dinámicamente de los contratistas asignados (helper `patientInsurancesFromContractors(p)` en `src/modules/patients/domain/models/patient.ts`). List muestra primeros 2 seguros derivados como badges + filtro Select por seguro (server-side cruza `patient_contractors` con `contractor_insurances`).
- `doctors` — Form con `<CedulaInput>` + email **(opcional)** + nombres + `<FormSwitch>` `isLegalEntity` + `<RifInput>` condicional + `<PhoneListInput>` (opcional) + `<SpecialtyMultiSelect>` + `<PaymentMethodsInput>` (defaults desde cedula/rif/nombre/primer teléfono) + estado. List con badge "Jurídica" y filtro `entityType` server-side.
- `care-centers` — Form con `businessName` + email **(opcional)** + `<RifInput>` **(opcional)** + `<PhoneListInput>` (opcional) + `<SpecialtyMultiSelect>` + `<PaymentMethodsInput>` + estado.
- `banks` — gateway sólo lectura. Único consumidor actual: `<PaymentMethodsInput>`.
- `insurances` — Form con `name` + `description` + email **(opcional)** + `fiscalAddress` (textarea, opcional) + `<PhoneListInput>` (opcional) + estado. **Asociado a contratistas, no a pacientes**. List con icon Shield. Sidebar bajo "Catálogos".
- `contractors` — Form con `name` + `description` + `<InsuranceMultiSelect>` + estado. Los pacientes con este contratista heredan estos seguros visualmente. Sidebar bajo "Catálogos".
- `pathologies` — CRUD simple paralelo a `specialties` (icon Activity). Sidebar bajo "Catálogos".
- `service-types` — CRUD simple **+ precios** vía `<ServiceTypePricesInput>` (Particular + 1 fila por seguro asignable, USD + EUR). Sidebar bajo "Catálogos".
- `orders` — ver sección dedicada abajo.
- **Replace-all en update**: el FE envía siempre el array completo de phones / paymentMethods / prices. En edit los items existentes preservan `id` (campo opcional en el schema); los nuevos van sin id. El backend hace diff por id (o delete-and-insert según el recurso).

### Módulo de Órdenes (`/orders`) — pricing + UX

- **Service types y patologías M2M**: `<OrderForm>` renderiza chips toggle inline (no `*MultiSelect` separado). `serviceTypeIds` (≥1, requerido) y `pathologyIds` (0..N, opcional). El BE devuelve `serviceTypes: ServiceType[]` y `pathologies: Pathology[]` en el detalle.
- **Auto-pricing desde `ServiceType.prices`**:
  - `type === 'insurance'` → `priceAmount` se calcula como suma de los precios `(USD|EUR)` que cada `ServiceType` tiene definidos para el `Insurance` seleccionado. El `<CurrencyAmountInput>` se renderiza `disabled` (label "Monto (fijo)").
  - `type ∈ {cash, credit, cashea}` → suma prefilada de los precios "Particular" (insuranceId IS NULL) de cada ST. Editable; `lastAppliedSumRef` (useRef) permite que la edición manual del usuario persista hasta que cambie selección/moneda.
  - El form muestra el desglose por ST en una mini-tabla (label + monto USD/EUR), con label "Sin precio definido" en `text-warning` cuando falta el precio para esa combinación + nota a pie de la sección.
  - El gateway `serviceTypeGateway.listAssignable()` devuelve los `prices` eager para que el cálculo viva en cliente sin round-trips.
- **Diferencia en Bs en pagos**: además de `Diferencia` en moneda de la orden, se calcula `diffBs = diff × currentRate.amountBs` y se renderiza debajo del badge ("Faltan/Excede Bs. X,XX (tasa Y Bs/USD)"). Si no hay tasa activa se muestra notice italic muted.
- **Errores per-pago**: `<OrderForm>` mapea `errors.payments` (RHF) al shape `PaymentItemErrors[]` que `<OrderPaymentForm>` ya consume per-fila para mostrar borde rojo + mensaje inline en cada campo (banco, referencia, monto, etc.).
- **`orderNumber`**: número auto-incremental simple (sin formato `ORD-YYYY-NNNNNN`). El backend lo controla con la env `ORDER_NUMBER_START` (idempotente, `OnModuleInit` bumpea `orders_seq`).

## Notificaciones (`notify`)

- `src/lib/notifications/toast.ts` expone `notify.success/error/warning/info` y `notify.fromError(err, fallback)`. **Único punto de entrada** — los componentes nunca importan `toast` de sonner directamente.
- `<Toaster richColors closeButton position="top-right" />` se monta en `App.tsx`.
- Errores de red (sin `response`) se notifican automáticamente desde el interceptor de Axios.
- Disparados en login, logout, todos los CRUD de usuarios y roles, asignación de permisos, cambio de contraseña, actualización de perfil.

### Toast de errores de validación de formulario

`src/lib/notifications/formErrors.ts` expone `notifyFormErrors(errors, opts?)` y `COMMON_LABELS` (mapa path → label visible para todos los campos del sistema: auth, person, doctor/care-center, order, payments, prices, etc.).

**Convención obligatoria**: todo `<form>` usa la firma:

```tsx
<form onSubmit={handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))}>
```

- El helper recorre recursivamente `FieldErrors` (objetos + arrays anidados como `payments.0.bankCode`).
- Emite un único toast con bullet list (max 5 items + "…y N más"). Description con `whiteSpace: pre-wrap`, duration 7s.
- Per-form override de labels: `notifyFormErrors(errs, { labels: { foo: 'Campo Foo' } })` — se mergea sobre `COMMON_LABELS`.
- Aplicado en **todos los forms del sistema** (orders, patients, doctors, care-centers, insurances, contractors, specialties, pathologies, service-types, exchange-rates, branches, users, roles, login, profile, password).

## Roles del sistema

- `Role.isSystem` viene del backend. Cuando es `true`:
  - En `RoleList`, el rol muestra badge "Sistema" y los botones de editar/eliminar/deshabilitar quedan deshabilitados con tooltip.
  - En `RoleEdit`, los inputs y el `PermissionsPicker` se ven en read-only y el switch "Habilitado" queda fijado en `true` (con tooltip "Los roles del sistema no se pueden deshabilitar").

## Habilitar/Deshabilitar

- Etiquetas de UI: **"Habilitado" / "Deshabilitado"** (vinculadas a `isActive`). En código y modelos se mantiene `isActive`. La traducción vive sólo en la presentación.
- Toggle de usuario y rol abre un AlertDialog de confirmación con texto contextual ("¿Habilitar usuario?" / "¿Deshabilitar rol?") antes de pegarle al endpoint.
- El JWT calcula los permisos efectivos ignorando roles con `isActive = false` o en papelera, así que un rol deshabilitado deja de conceder sus permisos sin necesidad de quitarlo del usuario.

## Selector de roles en formularios de usuario

- `roleGateway.listAssignable()` consume `GET /roles/assignable` y devuelve sólo roles `isActive = true` y no eliminados.
- Roles ya asignados que dejaron de ser asignables (deshabilitados o en papelera) aparecen como badge punteado "Rol deshabilitado/papelera" — quitables, no re-agregables desde el selector.

## i18n del catálogo de permisos

- `Permission` tiene `label` (título corto), `description` (descripción larga) y `group` (sección). Las claves técnicas (`users.list`, etc.) viven sólo en backend.
- `PermissionsPicker` agrupa por `group` (alfabético) y ordena dentro: `list → view → create → update → change-password → toggle-active → assign-permissions → soft-delete → hard-delete → restore`. Nunca muestra la clave técnica.

## `<FormSwitch />`

`src/components/ui/form-switch.tsx` — wrapper sobre `Switch` con label, descripción opcional, mensaje de error inline y tooltip opcional. **Para cualquier campo booleano editable en formularios usar `<FormSwitch />` en lugar de checkboxes.** Aplicado a `isActive`/`isSuperAdmin` en User y a `isActive` en Role. Cuando el campo está deshabilitado por regla de negocio (p.ej. rol del sistema), pasar `disabled` y `tooltip` para feedback contextual.

## Mi perfil (`/profile`)

Página self-service accesible desde el avatar del Navbar (dropdown "Mi perfil"). Dos secciones:

- **Datos personales** → `PATCH /auth/me` (`firstName`, `lastName`, `email`, `phoneNumber`). Botón "Guardar cambios" deshabilitado si no hay diff. Tras guardar, refresca el `authStore` con la respuesta del backend.
- **Cambiar contraseña** → `PATCH /auth/me/password` (`currentPassword`, `newPassword`, `confirmNewPassword`). Los tres campos usan `<PasswordInput>` (toggle de ojo). El backend valida que `newPassword !== currentPassword`. No desloguea al usuario tras éxito.

> Estos endpoints toman el `userId` del JWT, **no requieren permisos RBAC**. Para administrar a otros usuarios usar el módulo `/users`.

## UX y componentes globales

- `src/components/ui/password-input.tsx` (`PasswordInput`) — input password con toggle `Eye/EyeOff` (Lucide). Usado en login, alta de usuario, cambio de password admin y `/profile`.
- `src/index.css` aplica `cursor: pointer` global a `button`, `[role="button"]`, `[role="menuitem"]`, checkboxes/radios y switches habilitados — no es necesario repetir la utility por componente.
- Navbar: el avatar del usuario abre un dropdown (`shadcn/ui` `DropdownMenu`) con el nombre + email, "Mi perfil" y "Cerrar sesión" (accesible por teclado, cierre por click-fuera/Escape).

## Sistema de estilos AFMI

Sistema visual unificado clínico-moderno: azul profundo + cian. Reemplaza el tema neutro de shadcn por la paleta AFMI. Todas las pantallas siguen estos lineamientos.

### Tokens (en `src/index.css`)

Brand:

- `--brand-blue`, `--brand-blue-strong`, `--brand-blue-soft` (primary).
- `--brand-cyan`, `--brand-cyan-strong`, `--brand-cyan-soft` (accent).
- Estado: `--success` / `--warning` / `--destructive` con variantes `*-soft`.

Mapping shadcn:

- `--primary` → `--brand-blue`, `--ring` → `--brand-blue`.
- `--accent` → `--brand-cyan-soft`, `--accent-foreground` → `--brand-blue-strong`.
- `--sidebar-accent` → `--brand-blue-soft`, `--sidebar-accent-foreground` → `--brand-blue-strong`.

Expuestos vía `@theme inline` como utilities Tailwind: `bg-brand-blue`, `bg-brand-blue-soft`, `bg-brand-cyan`, `bg-brand-cyan-soft`, `bg-success(-soft)`, `bg-warning(-soft)`, `bg-destructive-soft`, etc.

### Tipografía

Inter Variable. Escala:

| Uso | Tailwind |
| --- | -------- |
| Page header | `text-[26px] font-bold tracking-[-0.02em]` |
| Section title (Card / FormSection) | `text-[15px] font-semibold` |
| Body | `text-sm` |
| Caption / hint | `text-xs text-muted-foreground` |
| Overline (column headers, KPI labels) | `text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground` |

Radio base `--radius: 0.625rem`. Cards/modales `rounded-xl`, login card `rounded-2xl`. Inputs/botones `rounded-md`. Badges/pills de estado `rounded-full`. Sombras: `shadow-xs` (cards), `shadow-md` (toasts/dropdowns), `shadow-lg` (modales/login).

### Layout

- Fondo de aplicación (fuera de cards): `oklch(0.985 0.003 250)` — aplicado en `DashboardLayout`.
- Sidebar: `w-64` `bg-sidebar`, items con barra cian a la izquierda en estado activo, footer con avatar gradient + logout. Secciones `Principal` / `Administración` con etiquetas `text-[10px] uppercase tracking-[0.08em]`.
- Navbar: `h-16 bg-card border-b`. Variantes vía prop:
  - `breadcrumbs` (default) — derivadas de `pathname` con `PATH_LABELS` map. Search 320px + bell + avatar.
  - `search` — search 480px + acción primaria.
  - `compact` — botón Volver + título + Cancelar/Guardar.

### Patrón de listados

Page header (h1 26px + subtítulo con count + acciones) + Card-style container (`bg-card rounded-xl border shadow-xs overflow-hidden`) que envuelve:

1. `<DataTableToolbar>` — search 320px max, slot `filters` (Selects, dropdowns multi), slot `actions`, "Limpiar filtros" cuando `hasActiveFilters`.
2. `<Table>` con `TableHeader` `bg-[oklch(0.985_0.003_250)]` + `text-[11px] uppercase tracking-[0.06em]`. Filas `py-3.5 px-4`, hover soft-bg. Avatar gradient (`from-brand-cyan to-brand-blue`) o icon-tile (`bg-brand-blue-soft`) en la primera columna. Estado como pill con dot (`bg-success-soft text-success`, `bg-warning-soft text-warning`, `bg-destructive-soft text-destructive`).
3. `<DataTablePagination>` — footer `bg-muted/40 border-t` con "Mostrando X–Y de Z" y window numérico (max 7 visible: `1 … current-1 current current+1 … last`).

Loading → `<SkeletonTableRows>`. Empty → `<EmptyState>` con copy contextual (filtros activos vs vacío inicial).

### Patrón de formularios

- Page header con botón "Volver" (`ChevronLeft`) + h1 + Cancelar/Guardar a la derecha.
- Cuerpo: una o varias `<FormSection title description>` (cards `rounded-xl border shadow-xs` con header + body + footer opcional). Usar `<FormGrid>` (2-col responsive `gap-x-5 gap-y-[18px]`) dentro de cada section. Campos full-width con `sm:col-span-2`.
- Labels `text-sm font-medium`. Asterisco rojo (`<span className="text-destructive">*</span>`) si requerido.
- Inputs altura 38–40px (`h-9` o `h-10`), `rounded-md`, focus-ring azul (heredado de `--ring`).
- Errores inline con icono `AlertTriangle` + `text-xs text-destructive`. Borde rojo + ring rojo soft cuando inválido.
- Hint `text-xs text-muted-foreground` debajo del campo.
- Booleanos siempre con `<FormSwitch />`, nunca checkboxes.
- Pie del form: `<span className="text-destructive">*</span> Campos obligatorios`.

### Modales (AlertDialog)

- `rounded-xl shadow-lg`. Header con icon-tile 40×40 coloreado por intención: `bg-destructive-soft text-destructive` (eliminar), `bg-warning-soft text-warning` (deshabilitar), `bg-success-soft text-success` (habilitar). Texto bold mencionando la entidad por nombre. Footer con Cancel + acción coloreada (`variant="destructive"` para eliminar/deshabilitar, `default` para habilitar).

### Login

- Stage gradiente 135° + dos radial-gradients ambient (cyan abajo-izq, azul arriba-der) blureados.
- Card 420px max-w, `rounded-2xl shadow-lg`, `p-9`.
- Brand block: mark 56×56 con gradient cyan→blue + box-shadow azul soft. H1 22px + subtítulo 13px muted.
- Email/password con icono left (`Mail` / `Lock`) y toggle Eye en password.
- Submit `size="lg" w-full h-11`.

### Empty state y skeleton

- `<EmptyState>` (`src/components/ui/empty-state.tsx`) — icon container 56×56 `rounded-2xl` con tinte (`brand-blue-soft` o `brand-cyan-soft`) + título + descripción + slot `action`. Usar como contenido cuando una lista paginada devuelve vacío.
- `<Skeleton>` y `<SkeletonTableRows rows columns>` (`src/components/ui/skeleton.tsx`) — placeholder con animación shimmer (`@keyframes skeleton` 1.5s) declarada en `index.css`. Usar en tablas durante loading.

### Componentes compartidos del sistema de estilos

- `src/components/ui/data-table-toolbar.tsx` (`DataTableToolbar`).
- `src/components/ui/data-table-pagination.tsx` (`DataTablePagination`).
- `src/components/ui/form-section.tsx` (`FormSection`, `FormGrid`).
- `src/components/ui/empty-state.tsx` (`EmptyState`).
- `src/components/ui/skeleton.tsx` (`Skeleton`, `SkeletonTableRows`).

## Módulo de Roles (`/roles`)

- Listado con búsqueda, sort por nombre, paginación, soft/hard delete + restore.
- Crear / editar con `PermissionsPicker`: agrupa permisos por recurso, checkbox por recurso (con estado indeterminado), conteo seleccionados/total.
- Asignación de permisos en página de edición vía `PATCH /roles/:id/permissions`.
- El rol "Super Admin" aparece bloqueado para renombrar/eliminar y su listado de permisos es solo lectura.

## Scripts

| Comando | Descripción |
| ------- | ----------- |
| `npm run dev` | Servidor de desarrollo Vite |
| `npm run build` | `tsc -b && vite build` |
| `npm run preview` | Previsualizar `dist/` |
| `npm run lint` | ESLint |

## Estructura

```text
src/
├── App.tsx
├── main.tsx
├── layouts/                    # DashboardLayout, Navbar, Sidebar
├── components/ui/              # shadcn/ui
├── lib/api/                    # Axios, config, manejo de errores
└── modules/
    ├── auth/
    │   ├── domain/            # AuthUser, permissions catalog, store
    │   ├── infrastructure/     # tokenStorage, authApi, jwt utils
    │   └── presentation/       # AuthGuard, hooks, <Can>, pages
    ├── users/
    │   ├── domain/             # User, DTOs, store
    │   ├── infrastructure/     # userGateway
    │   └── presentation/       # List, Create, Edit, ChangePassword
    └── roles/
        ├── domain/             # Role, Permission, store
        ├── infrastructure/     # roleGateway, permissionGateway
        └── presentation/       # List, Create, Edit, PermissionsPicker
```

## Convenciones para extender

- **Nuevo módulo** = nueva carpeta `src/modules/<nombre>/` con `domain` / `infrastructure` / `presentation`.
- **No crear instancias nuevas de Axios**; reusar `import { api } from '@/lib/api'`.
- **Token JWT** vive en `localStorage`. Si en el futuro se migra a `httpOnly cookie`, los puntos de cambio son `tokenStorage.ts` y `client.ts`.
- **Gating de UI** vía `<Can>` o `usePermissions()`. No duplicar lógica de `isSuperAdmin`.
- **Mensajes de UI** en español; nombres de identificadores (variables, métodos, archivos) en inglés.
