# ChipsFinder · Acceso interno

Pantalla de acceso del panel interno del equipo ChipsFinder, implementada a partir del diseño
`ChipsFinder Login.dc.html` de Claude Design.

- Vite + React 18 + TypeScript, sin dependencias de UI.
- Tres vistas: iniciar sesión, recuperar acceso y sesión iniciada.
- Español / inglés (se recuerda en el navegador).
- Fotos y logo servidos desde `public/` (no depende de Unsplash).

## Arrancar

```bash
npm install
npm run dev
```

Abre http://localhost:5180

## Ajustes del diseño

En `src/config.ts`:

- **foto**: `laboratorio` (por defecto), `chip` o `placa`
- **lado**: `izquierda` (por defecto) o `derecha`

Para probarlos sin tocar código: `http://localhost:5180/?foto=chip&lado=derecha`

## Acceso real

El acceso todavía es una simulación, igual que en el diseño: valida que el correo sea
`@chipsfinder.es` y que la contraseña tenga al menos 8 caracteres, y tras 1,3 s muestra
"Sesión iniciada". Para conectarlo a un sistema de cuentas real (Supabase, Microsoft Entra,
API propia…) solo hay que cambiar las funciones de `src/auth.ts`.

## Producción

```bash
npm run build
```

Genera `dist/`, que se puede servir como sitio estático. La página lleva
`noindex, nofollow` para que no aparezca en buscadores.
