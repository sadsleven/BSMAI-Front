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

- Schemas Zod centralizados en `src/lib/validations/schemas.ts`: `loginSchema`, `profileSchema`, `createUserSchema`, `updateUserSchema`, `changeOwnPasswordSchema`, `adminChangePasswordSchema`, `roleSchema`.
- Conectados a React Hook Form via `zodResolver`. Modo de validación: `onBlur` consistente.
- Reglas reutilizables: `emailSchema`, `nameSchema(label)`, `phoneSchema`, `passwordSchema`. Mensajes en español.
- Reglas duras: nombre 1-150 chars solo letras/acentos/`ñ`; teléfono opcional pero exactamente 11 dígitos si presente; password 8-100 con mayúscula+minúscula+número+especial.

## Notificaciones (`notify`)

- `src/lib/notifications/toast.ts` expone `notify.success/error/warning/info` y `notify.fromError(err, fallback)`. **Único punto de entrada** — los componentes nunca importan `toast` de sonner directamente.
- `<Toaster richColors closeButton position="top-right" />` se monta en `App.tsx`.
- Errores de red (sin `response`) se notifican automáticamente desde el interceptor de Axios.
- Disparados en login, logout, todos los CRUD de usuarios y roles, asignación de permisos, cambio de contraseña, actualización de perfil.

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
