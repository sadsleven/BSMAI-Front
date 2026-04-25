# AFMI Front

Frontend de la aplicación **AFMI**: interfaz de administración conectada a un **backend REST** (no usa Supabase ni BaaS). El estado de sesión se gestiona con **JWT** almacenado en el cliente; las peticiones HTTP usan **Axios** con una instancia centralizada, interceptores y contratos de rutas documentados abajo.

## Requisitos

- **Node.js** (LTS recomendado)
- **npm** (el repo incluye `package-lock.json`)

## Inicio rápido

```bash
npm install
cp .env.example .env
# Edita .env y asigna VITE_API_BASE_URL a la URL de tu API
npm run dev
```

- Desarrollo: [http://localhost:5173](http://localhost:5173) (Vite por defecto)
- Asegúrate de que el backend acepta CORS desde el origen del front si aplica

## Variables de entorno

Copia `.env.example` a `.env`. Vite solo expone al bundle las variables que empiezan por `VITE_`.

| Variable | Descripción |
| -------- | ----------- |
| `VITE_API_BASE_URL` | URL base del backend **sin barra final**. Incluye aquí prefijos de API si el servidor los usa (p. ej. `https://api.ejemplo.com` o `http://localhost:3000/api/v1`). Todas las rutas de Axios se resuelven contra este origen. |

```env
# .env.example
VITE_API_BASE_URL=http://localhost:3000
```

Si falta `VITE_API_BASE_URL`, la app lo advertirá en consola; conviene definirla antes de desplegar.

## Tecnologías

| Área | Stack |
| ---- | ----- |
| Runtime / build | [Vite](https://vitejs.dev/) 7, [TypeScript](https://www.typescriptlang.org/) 5.9 |
| UI | [React](https://react.dev/) 19, [React Router](https://reactrouter.com/) 7 |
| Estilos | [Tailwind CSS](https://tailwindcss.com/) 4, [tw-animate-css](https://github.com/jamiebuilds/tw-animate-css) |
| Componentes | [shadcn/ui](https://ui.shadcn.com/) (Radix, `class-variance-authority`, `clsx` / `tailwind-merge`) |
| Tablas | [@tanstack/react-table](https://tanstack.com/table) |
| Validación (disponible) | [Zod](https://zod.dev/) |
| Estado global | [Zustand](https://zustand-demo.pmnd.rs/) |
| HTTP | [Axios](https://axios-http.com/) (instancia en `src/lib/api/`) |
| Fuentes | Inter (`@fontsource-variable/inter`) |

## Arquitectura: módulos por feature

Cada **módulo** agrupa lógica por dominio bajo `src/modules/<nombre>/`, con capas similares:

- **`domain/`** — modelos, tipos y stores (Zustand) propios del dominio
- **`infrastructure/`** — acceso a datos: llamadas HTTP, mapeo DTO, almacenamiento (p. ej. token)
- **`presentation/`** — componentes, páginas y piezas de UI conectadas al enrutador

Convención: **nuevo feature** = nueva carpeta bajo `src/modules/<feature>/` siguiendo el mismo reparto, en lugar de mezclar lógica suelta en `src/`.

### `src/modules/auth/`

| Ruta | Rol |
| ---- | --- |
| `domain/models/authUser.ts` | Tipo `AuthUser` (usuario de sesión) |
| `domain/store/authStore.ts` | `user`, `isLoading`, `setUser`, `setLoading` |
| `infrastructure/tokenStorage.ts` | Lectura/escritura del JWT en `localStorage` (clave `afmi_access_token`) |
| `infrastructure/authApi.ts` | `POST /auth/login`, `GET /auth/me`, `logout()` (borra token) |
| `presentation/AuthGuard.tsx` | Comprueba token + `/auth/me`; redirige a `/login` si no hay sesión |
| `presentation/pages/LoginPage.tsx` | Formulario de login |

### `src/modules/users/`

| Ruta | Rol |
| ---- | --- |
| `domain/models/user.ts` | `User`, `CreateUserDto`, `UpdateUserDto` |
| `domain/store/userStore.ts` | Listado, CRUD vía gateway |
| `infrastructure/userGateway.ts` | REST: `GET/POST /users`, `GET/PATCH/DELETE /users/:id` |
| `presentation/pages/` | `UserList`, `UserCreate`, `UserEdit` |

Código compartido que no pertenece a un solo módulo: `src/lib/` (p. ej. `src/lib/api/`), `src/components/ui/`, `src/layouts/`.

## API HTTP con Axios

- **Instancia única**: `src/lib/api/client.ts` exporta `api` (reexportada desde `src/lib/api/index.ts`).
- **Base URL**: `VITE_API_BASE_URL` (ver `src/lib/api/config.ts`).
- **Cabeceras**: `Authorization: Bearer <token>` si existe token en almacenamiento; el token lo coloca un interceptor de petición.
- **Errores**: `getHttpErrorMessage` en `src/lib/api/httpError.ts` unifica mensajes a partir de cuerpos JSON típicos (`message`, `error`, `detail`).
- **Módulos de negocio** no deben crear otras instancias de Axios para el mismo backend; reutilicen `import { api } from '@/lib/api'`.

## Autenticación (JWT)

### Flujo de login

1. El usuario envía email y contraseña en `LoginPage` → `authApi.login()`.
2. `POST /auth/login` debe devolver al menos un JWT en uno de estos campos: `accessToken`, `access_token` o `token`.
3. Tras recibirlo, se guarda con `setAccessToken` en `localStorage`.
4. El usuario de sesión se obtiene: primero se intenta mapear un objeto de usuario de la propia respuesta; si no es posible, se hace `GET /auth/me` (ya con el `Authorization` actualizado).

### Sesión y rutas protegidas

- `AuthGuard` (envuelve el layout con dashboard):
  - Si **no** hay token → deja de cargar, `user` null, redirige a `/login`.
  - Si hay token → `GET /auth/me` y rellena `authStore` con un `AuthUser` válido.
- Si alguien con sesión abre `/login` y aún hay token, la pantalla de login redirige al inicio (ajustar si hace falta otra UX).

### Logout

- `authApi.logout()` borra el token del almacenamiento; el `Sidebar` también limpia el store y navega a `/login` con `replace: true`.

### 401 (no autorizado)

- Un interceptor de respuesta trata el **401** fuera de intentos de `POST /auth/login` o `POST /auth/register`: limpia el token y, si no estás ya en `/login`, fuerza `window.location` a `/login` (evita dejar el estado a medias con JWT inválido o caducado).

### Contrato REST esperado (resumen)

| Método | Ruta | Uso en el front |
| ------ | ---- | ----------------- |
| `POST` | `/auth/login` | Credenciales; respuesta con JWT (y preferiblemente usuario) |
| `GET`  | `/auth/me`    | Perfil bajo `Authorization: Bearer` |
| CRUD   | `/users` …     | Véase `userGateway` |

El gateway de usuarios acepta listas como array directo, `{ data: [] }` o `{ items: [] }`, e items sueltos con o sin envoltura `{ data: { … } }`, para alinear con respuestas habituales de APIs.

## Scripts

| Comando | Descripción |
| ------- | ----------- |
| `npm run dev` | Servidor de desarrollo Vite |
| `npm run build` | `tsc` + build de producción |
| `npm run preview` | Previsualizar el `dist` |
| `npm run lint`    | ESLint |

## Estructura de directorios (resumen)

```text
src/
├── App.tsx
├── main.tsx
├── layouts/                 # Layout del dashboard, navbar, sidebar
├── components/ui/            # shadcn / primitivos reutilizables
├── lib/
│   ├── api/                  # Axios, config, manejo de errores
│   └── utils.ts
├── modules/
│   ├── auth/                 # Login, guard, token, API de auth
│   └── users/                # CRUD usuarios vía REST
└── vite-env.d.ts            # Tipos de `import.meta.env`
```

## Guía para quien mantiene o extiende el proyecto

- **Mantener la estructura por módulos** (`domain` / `infrastructure` / `presentation`) y el uso de **un solo cliente** Axios.
- **Nuevos endpoints** del mismo backend: añadirlos en el `infrastructure` del módulo correspondiente o, si es transversal, detrás de `src/lib/api/` con funciones con nombre claro.
- **Auth**: no duplicar lógica de token; usar `tokenStorage` y `authApi`. El JWT vive en `localStorage` (clave `afmi_access_token`); si en el futuro se migra a cookies u otro esquema, el punto de cambio queda acotado a `tokenStorage` y al cliente Axios.
- **Rutas de React** están en `App.tsx`; las rutas anidadas del dashboard cuelgan del layout envuelto por `AuthGuard`.
- **Alias** `@/*` apunta a `src/*` (ver `tsconfig`).

Con esta base, un desarrollador o un agente de IA puede añadir módulos (p. ej. `reports`, `settings`) copiando el patrón existente y sin romper el contrato de autenticación descrito arriba.
