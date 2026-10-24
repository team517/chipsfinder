#!/usr/bin/env node
// Gestión de cuentas del panel interno de ChipsFinder (solo administradores).
// Usa la clave secreta de Supabase de .env.supabase.local: nunca la pongas en el navegador.
//
//   node scripts/usuarios.mjs invitar nombre@chipsfinder.es [--admin]   → le llega un correo para crear su contraseña
//   node scripts/usuarios.mjs crear nombre@chipsfinder.es [--admin]     → crea la cuenta con una contraseña temporal
//   node scripts/usuarios.mjs listar
//   node scripts/usuarios.mjs admin nombre@chipsfinder.es               → le da permisos de administrador
//   node scripts/usuarios.mjs quitar-admin nombre@chipsfinder.es
//   node scripts/usuarios.mjs desactivar nombre@chipsfinder.es          → ya no puede entrar (la cuenta se conserva)
//   node scripts/usuarios.mjs activar nombre@chipsfinder.es

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(file) {
  try {
    for (const line of readFileSync(join(root, file), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch {
    /* el archivo es opcional */
  }
}
loadEnv(".env.supabase.local");
loadEnv(".env.local");

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const SITE_URL = process.env.SITE_URL || "http://localhost:5180";
const DOMAIN = "@chipsfinder.es";

if (!URL_ || !SECRET) {
  console.error("Falta SUPABASE_URL / SUPABASE_SECRET_KEY en .env.supabase.local");
  process.exit(1);
}

const admin = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;

const [cmd, rawEmail, ...flags] = process.argv.slice(2);
const email = (rawEmail || "").trim().toLowerCase();
const asAdmin = flags.includes("--admin");

function fail(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

function needEmail() {
  if (!email) fail("Falta el correo.");
  if (!email.endsWith(DOMAIN)) fail("Solo se admiten cuentas " + DOMAIN);
}

async function allUsers() {
  const out = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) fail(error.message);
    out.push(...data.users);
    if (data.users.length < 200) return out;
  }
}

async function findUser() {
  const u = (await allUsers()).find((x) => (x.email || "").toLowerCase() === email);
  if (!u) fail("No existe ninguna cuenta " + email);
  return u;
}

const roleMeta = (u, role) => ({ app_metadata: { ...(u?.app_metadata || {}), role } });

switch (cmd) {
  case "invitar": {
    needEmail();
    const { data, error } = await admin.inviteUserByEmail(email, { redirectTo: SITE_URL });
    if (error) fail(error.message);
    if (asAdmin) await admin.updateUserById(data.user.id, roleMeta(data.user, "admin"));
    console.log("✓ Invitación enviada a " + email + (asAdmin ? " (administrador)" : ""));
    break;
  }
  case "crear": {
    needEmail();
    const password = randomBytes(9).toString("base64url");
    const { data, error } = await admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: asAdmin ? { role: "admin" } : {},
    });
    if (error) fail(error.message);
    console.log("✓ Cuenta creada: " + data.user.email + (asAdmin ? " (administrador)" : ""));
    console.log("  Contraseña temporal: " + password);
    console.log("  Pásasela por un canal seguro; puede cambiarla con «¿La olvidaste?».");
    break;
  }
  case "listar": {
    const users = await allUsers();
    if (!users.length) console.log("No hay cuentas.");
    for (const u of users.sort((a, b) => (a.email || "").localeCompare(b.email || ""))) {
      const banned = u.banned_until && new Date(u.banned_until) > new Date();
      const state = banned ? "DESACTIVADA" : u.last_sign_in_at ? "activa" : "sin estrenar";
      const role = u.app_metadata?.role === "admin" ? "admin" : "equipo";
      const last = u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("es-ES") : "—";
      console.log(`${(u.email || "").padEnd(36)} ${role.padEnd(7)} ${state.padEnd(12)} último acceso: ${last}`);
    }
    break;
  }
  case "admin":
  case "quitar-admin": {
    needEmail();
    const u = await findUser();
    const { error } = await admin.updateUserById(u.id, roleMeta(u, cmd === "admin" ? "admin" : null));
    if (error) fail(error.message);
    console.log("✓ " + email + (cmd === "admin" ? " ahora es administrador" : " ya no es administrador"));
    break;
  }
  case "desactivar":
  case "activar": {
    needEmail();
    const u = await findUser();
    const { error } = await admin.updateUserById(u.id, { ban_duration: cmd === "desactivar" ? "876000h" : "none" });
    if (error) fail(error.message);
    console.log("✓ " + email + (cmd === "desactivar" ? " desactivada: ya no puede entrar" : " activada de nuevo"));
    break;
  }
  default:
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 13).join("\n").replace(/^\/\/ ?/gm, ""));
}
