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

Necesita `.env.supabase.local` con `SUPABASE_URL` y `SUPABASE_SECRET_KEY` (nunca se sube a git).

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

## Ajustes del diseño

En `src/config.ts`: **foto** (`laboratorio`, `chip`, `placa`) y **lado** (`izquierda`, `derecha`).
Para probarlos: `http://localhost:5180/?foto=chip&lado=derecha`

## Producción

```bash
npm run build
```

Genera `dist/`, que se puede servir como sitio estático (con `VITE_SUPABASE_URL` y
`VITE_SUPABASE_PUBLISHABLE_KEY` definidas al compilar). La página lleva `noindex, nofollow`.
