# ChipsFinder · Acceso interno

Pantalla de acceso del panel interno del equipo ChipsFinder, implementada a partir del diseño
`ChipsFinder Login.dc.html` de Claude Design, con cuentas reales en Supabase.

- Vite + React 18 + TypeScript + Supabase Auth.
- Vistas: iniciar sesión, recuperar acceso, crear / cambiar contraseña (desde el correo) y sesión iniciada.
- Español / inglés (se recuerda en el navegador).
- Fotos y logo servidos desde `public/`.

## Arrancar

```bash
npm install
cp .env.example .env.local   # y rellena la clave publicable
npm run dev
```

Abre http://localhost:5180

## Cuentas (Supabase, proyecto `chipsfinder` · `vwybcwidffcnpcjlehxv`)

- **No hay registro público**: solo un administrador da de alta cuentas.
- **Solo `@chipsfinder.es`**: lo comprueba la pantalla y, además, la base de datos
  (`supabase/migrations/…_solo_chipsfinder.sql`) rechaza cualquier otro correo, aunque se cree
  desde el panel de Supabase.
- Contraseña mínima de 8 caracteres.
- "Mantener la sesión en este equipo": si está desmarcado, la sesión se borra al cerrar el navegador.
- Una cuenta desactivada se expulsa en cuanto se recarga la página.
- El permiso que se ve en "Sesión iniciada" sale de `app_metadata.role` (`ADMIN` o `EQUIPO`).

### Dar de alta y gestionar cuentas

Lo normal es hacerlo **desde el panel**: un administrador entra en **Equipo** y pulsa "Nuevo acceso"
(elige rol y si crea una contraseña temporal o envía invitación). Allí también puede cambiar el rol,
desactivar/reactivar o borrar cuentas. Nadie puede desactivarse, borrarse ni quitarse el rol a sí mismo.

Esto lo hace la función de servidor `supabase/functions/team` (usa la clave secreta, que nunca llega
al navegador, y solo responde a administradores @chipsfinder.es). Se despliega con:

```bash
supabase functions deploy team --project-ref vwybcwidffcnpcjlehxv --use-api
```

Cada persona cambia **su propia contraseña** en **Mi cuenta** (pulsando su correo abajo a la izquierda).

También se puede dar de alta por terminal, con `.env.supabase.local` (nunca se sube a git):

```bash
node scripts/usuarios.mjs invitar nombre@chipsfinder.es          # le llega un correo para crear su contraseña
node scripts/usuarios.mjs crear nombre@chipsfinder.es --admin    # crea la cuenta con contraseña temporal
node scripts/usuarios.mjs listar
node scripts/usuarios.mjs desactivar nombre@chipsfinder.es       # ya no puede entrar
node scripts/usuarios.mjs activar nombre@chipsfinder.es
node scripts/usuarios.mjs admin nombre@chipsfinder.es
```

También se puede invitar desde el panel de Supabase (Authentication → Users → Invite user).

### Correos (invitación y recuperar contraseña)

Las plantillas están en `supabase/templates/` (en español, con el estilo de ChipsFinder) y sus
enlaces llevan a `SITE_URL/?token_hash=…&type=invite|recovery`.

**Importante:** el envío de correo que trae Supabase de serie solo entrega a los miembros de la
organización de Supabase y como mucho unos pocos por hora. Para que lleguen a las cuentas
@chipsfinder.es hay que configurar un SMTP propio (p. ej. `no-reply@chipsfinder.es`) en
Supabase → Authentication → Emails → SMTP Settings, o en `[auth.email.smtp]` de
`supabase/config.toml` y `supabase config push`. Mientras tanto, usa `crear` (contraseña temporal).

### Cambiar ajustes de Auth

Se guardan en `supabase/config.toml` (sección `[auth]`) y se aplican con:

```bash
supabase config push
```

Al publicar la web en su dirección definitiva, cambia `site_url` y `additional_redirect_urls`
por esa dirección y vuelve a hacer `supabase config push`.

### Entrar con Microsoft

El botón está oculto hasta configurar el proveedor "Azure" en Supabase. Después pon
`VITE_SSO_MICROSOFT=1` en `.env.local`.

## Panel interno (`/panel`)

Al iniciar sesión se ve "Sesión iniciada · Cargando el panel…" y se entra al panel:

| Sección | Qué guarda | Tabla |
| --- | --- | --- |
| 00 Inicio | Resumen: pedidos abiertos, lotes por revisar, referencias y stock, clientes; últimos pedidos y lotes pendientes | — |
| 01 Pedidos | Peticiones de clientes (PED-0001…), referencia, cantidad, precio objetivo, estado | `pedidos` |
| 02 Lotes | Material que entra: proveedor, date code, inspección (pendiente / en inspección / aprobado / rechazado) | `lotes` |
| 03 Referencias | Catálogo: MPN, fabricante, encapsulado, stock, precio, ubicación | `referencias` |
| 04 Proveedores | Fabricantes, distribuidores y brokers, con valoración | `proveedores` |
| 05 Clientes | Empresas, contacto y número de pedidos | `clientes` |
| 06 Equipo (solo admin) | Dar de alta accesos, cambiar el rol, activar/desactivar y borrar cuentas | Supabase Auth |
| Mi cuenta | Cada persona cambia su propia contraseña | Supabase Auth |

- Cada sección tiene buscador, filtros por estado y una ficha lateral para crear y editar.
- Leer, crear y editar: cualquier cuenta @chipsfinder.es. **Borrar: solo administradores.**
  Lo controla la base de datos (RLS), no solo la pantalla.
- No se puede borrar un cliente que tiene pedidos.
- Cada registro tiene su propia dirección (`/panel/pedidos/<id>`), que se puede compartir con el equipo.
- En móvil el menú se abre con "Menú" y las tablas pasan a tarjetas.
- Tablas y permisos: `supabase/migrations/20261024130000_panel.sql`.

Al publicarlo, el servidor tiene que devolver `index.html` para cualquier ruta `/panel/...`
(lo normal en una app de una sola página).

## Ajustes del diseño

En `src/config.ts`: **foto** (`laboratorio`, `chip`, `placa`) y **lado** (`izquierda`, `derecha`).
Para probarlos: `http://localhost:5180/?foto=chip&lado=derecha`

## Producción

```bash
npm run build
```

Genera `dist/`, que se puede servir como sitio estático (con `VITE_SUPABASE_URL` y
`VITE_SUPABASE_PUBLISHABLE_KEY` definidas al compilar). La página lleva `noindex, nofollow`.
