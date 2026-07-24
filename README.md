# SIM Manager

Aplicación web responsive (Mobile-first) para gestionar el inventario e instalación de tarjetas SIM.

## Funcionalidades

- **Dashboard**: tarjetas de resumen (total, instaladas, libres) y buscador maestro por número de SIM con historial de ubicaciones.
- **Instalaciones**: formulario rápido para instalar/retirar SIMs. Si la SIM no existe en el inventario maestro, se registra con etiqueta **Pendiente de Revisión**.
- **Inventario**: tabla paginada con filtros por estado y búsqueda.
- **Carga masiva**: ingreso de SIMs y planes desde texto copiado (pegar lista del proveedor).
- **Informes**: exportación a CSV del inventario completo, SIMs libres, instaladas e historial.
- **Usuarios y permisos**: autenticación con Supabase Auth, roles `super_admin`/`usuario` y permisos granulares.

## Stack

- [Next.js 13](https://nextjs.org/) (App Router)
- [React 18](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/) componentes
- [Supabase](https://supabase.com/) (PostgreSQL + Auth)
- [Vercel](https://vercel.com/) (despliegue gratuito)

## Estructura de la base de datos

Ver migraciones en [`supabase/migrations/`](supabase/migrations/):

1. `20260723202059_create_sim_inventory_schema.sql` — crea tablas `sims`, `locations`, `installations` y la función `register_installation`.
2. `20260723210555_add_auth_roles_permissions.sql` — añade autenticación, tabla `profiles`, roles y permisos.
3. `20260724000000_seed_data_from_excel.sql` — carga los 747 registros iniciales desde `Libro1.xlsx`.

### Tablas principales

| Tabla | Descripción |
|-------|-------------|
| `sims` | Inventario maestro de SIMs contratadas. |
| `locations` | Catálogo de ubicaciones (Bus / Sucursal). |
| `installations` | Historial de instalaciones y retiros. |
| `profiles` | Perfiles de usuario extendidos desde `auth.users`. |

## Requisitos previos

- Cuenta en [GitHub](https://github.com/)
- Cuenta en [Supabase](https://supabase.com/)
- Cuenta en [Vercel](https://vercel.com/)
- [Node.js](https://nodejs.org/) 18+ instalado en tu computadora
- [Git](https://git-scm.com/) instalado (opcional si usas GitHub Desktop)

## 1. Preparar el proyecto localmente

### 1.1 Instalar dependencias

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
npm install
```

### 1.2 Configurar variables de entorno

El archivo `.env` ya contiene las credenciales de Supabase. Si creas un proyecto nuevo en Supabase, reemplaza estos valores:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

> **Importante**: nunca subas el archivo `.env` a GitHub. Ya está incluido en `.gitignore`.

### 1.3 Probar localmente

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## 2. Crear base de datos en Supabase

1. Ve a [Supabase Dashboard](https://app.supabase.com/) y crea un nuevo proyecto.
2. Una vez creado, ve al **SQL Editor**.
3. Copia y pega el contenido de [`supabase/migrations/20260723202059_create_sim_inventory_schema.sql`](supabase/migrations/20260723202059_create_sim_inventory_schema.sql) y ejecútalo.
4. Copia y pega el contenido de [`supabase/migrations/20260723210555_add_auth_roles_permissions.sql`](supabase/migrations/20260723210555_add_auth_roles_permissions.sql) y ejecútalo.
5. Copia y pega el contenido de [`supabase/migrations/20260724000000_seed_data_from_excel.sql`](supabase/migrations/20260724000000_seed_data_from_excel.sql) y ejecútalo.

Esto creará las tablas, funciones, permisos y cargará los 747 registros de tu Excel.

## 3. Importar los datos de tu Excel (ya hecho)

Los datos de `Libro1.xlsx` ya fueron convertidos a SQL en:

```
supabase/migrations/20260724000000_seed_data_from_excel.sql
```

Solo debes ejecutar ese archivo en el SQL Editor de Supabase (paso 2.5).

### ¿Qué se migró?

- **Columna G (SIM CARD ACTUAL)** → tabla `sims` (inventario maestro).
- **Columna H (PLAN ACTUAL)** → campo `plan` de cada SIM.
- **Columna I (USADO O NO ?)** → campo `status` (`instalada` si tiene el mismo número de G, `libre` si está vacía).
- **Columna A (Bus)** y **B (Línea)** → tabla `locations` y registro de instalación.
- **Columna C (Imei)** → campo `imei` de la instalación.
- **Columna D (Sim)** → si es diferente a G, se guarda como nota en el historial.

Si en el futuro actualizas el Excel y quieres regenerar el SQL, ejecuta:

```bash
node scripts/generate-migration-sql.js
```

## 4. Subir el proyecto a GitHub

### Opción A: con Git en terminal

```bash
git init
git add .
git commit -m "Primer commit - SIM Manager"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/sim-manager.git
git push -u origin main
```

### Opción B: con GitHub Desktop

1. Abre GitHub Desktop.
2. **File → Add local repository** y selecciona la carpeta del proyecto.
3. Escribe un mensaje de commit y haz clic en **Commit to main**.
4. Haz clic en **Publish repository**.

> Asegúrate de que el archivo `.env` no se suba. Revisa `.gitignore`.

## 5. Desplegar en Vercel (gratis)

1. Ve a [vercel.com](https://vercel.com/) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **Add New Project**.
3. Selecciona el repositorio `sim-manager`.
4. En la pantalla de configuración:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./` (dejar por defecto)
   - **Build Command**: `next build`
   - **Output Directory**: `.next`
5. Agrega las variables de entorno:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Haz clic en **Deploy**.

Vercel te dará una URL como `https://sim-manager-tuusuario.vercel.app`.

## 6. Primer uso

1. Abre la URL de Vercel.
2. Ve a **Crear cuenta** y regístrate con tu correo.
3. El **primer usuario registrado se convierte automáticamente en super administrador**.
4. Inicia sesión y comienza a usar la app.

## Scripts útiles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia servidor de desarrollo |
| `npm run build` | Compila para producción |
| `npm run typecheck` | Revisa tipos de TypeScript |
| `node scripts/generate-migration-sql.js` | Regenera SQL desde `Libro1.xlsx` |

## Notas importantes

- La aplicación requiere inicio de sesión. No permite acceso anónimo.
- El primer usuario que se registra obtiene todos los permisos.
- Las SIMs marcadas como **Pendiente de Revisión** aparecen en el inventario con etiqueta naranja. Puedes actualizar su plan desde la carga masiva.
- El historial de instalaciones se conserva incluso si una SIM es eliminada del maestro.

## Soporte

Si tienes problemas con el despliegue, revisa:

- Que las variables de entorno en Vercel coincidan con tu proyecto de Supabase.
- Que las migraciones SQL se hayan ejecutado sin errores.
- Que el repositorio de GitHub esté público o que Vercel tenga acceso.
