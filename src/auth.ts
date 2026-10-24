// Acceso con Supabase Auth (proyecto "chipsfinder").
// - No hay registro público: las cuentas las crea un administrador (scripts/usuarios.mjs).
// - Solo @chipsfinder.es: se comprueba aquí y, sobre todo, en la base de datos.
// - "Mantener la sesión" guarda la sesión en localStorage; si no, en sessionStorage
//   (se borra al cerrar el navegador).

import { createClient, type AuthError, type Session } from "@supabase/supabase-js";
import { ALLOWED_DOMAIN } from "./config";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
if (!url || !key) {
  throw new Error("Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY (mira .env.example).");
}

const REMEMBER_KEY = "chf-remember";

function remembering(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return true;
  }
}

function setRemembering(v: boolean) {
  try {
    localStorage.setItem(REMEMBER_KEY, v ? "1" : "0");
  } catch {
    /* almacenamiento bloqueado */
  }
}

// Guarda la sesión donde toque según "Mantener la sesión en este equipo".
const sessionStore = {
  getItem(k: string) {
    try {
      return localStorage.getItem(k) ?? sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem(k: string, v: string) {
    try {
      if (remembering()) {
        localStorage.setItem(k, v);
        sessionStorage.removeItem(k);
      } else {
        sessionStorage.setItem(k, v);
        localStorage.removeItem(k);
      }
    } catch {
      /* almacenamiento bloqueado */
    }
  },
  removeItem(k: string) {
    try {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    } catch {
      /* almacenamiento bloqueado */
    }
  },
};

export const supabase = createClient(url, key, {
  auth: {
    storage: sessionStore,
    storageKey: "chf-auth",
    persistSession: true,
    autoRefreshToken: true,
    // Los enlaces de los correos traen ?token_hash=…&type=…; los procesamos nosotros.
    detectSessionInUrl: false,
  },
});

export type LoginError = "empty" | "domain" | "short";

/** Errores que vienen del servidor, traducidos en i18n.ts */
export type ServerError =
  | "credentials"
  | "banned"
  | "rate"
  | "network"
  | "weak"
  | "same"
  | "mismatch"
  | "link"
  | "sso"
  | "unknown";

const domainRe = new RegExp("@" + ALLOWED_DOMAIN.replace(/\./g, "\\.") + "$");

export function isTeamEmail(email: string): boolean {
  return domainRe.test(email.trim().toLowerCase());
}

export function validateLogin(email: string, password: string): LoginError | null {
  const e = email.trim().toLowerCase();
  if (!e || !password) return "empty";
  if (!domainRe.test(e)) return "domain";
  if (password.length < 8) return "short";
  return null;
}

function mapError(err: AuthError | Error | null | undefined): ServerError {
  if (!err) return "unknown";
  const code = (err as AuthError).code ?? "";
  const status = (err as AuthError).status ?? 0;
  const msg = (err.message || "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "credentials";
  if (code === "user_banned" || msg.includes("banned")) return "banned";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || status === 429) return "rate";
  if (code === "weak_password") return "weak";
  if (code === "same_password") return "same";
  if (code === "otp_expired" || code === "flow_state_expired" || msg.includes("expired") || msg.includes("invalid")) return "link";
  if (err.name === "AuthRetryableFetchError" || msg.includes("failed to fetch") || msg.includes("network")) return "network";
  return "unknown";
}

export type Result = { ok: true } | { ok: false; error: ServerError };

export async function signIn(email: string, password: string, remember: boolean): Promise<Result> {
  setRemembering(remember);
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  return error ? { ok: false, error: mapError(error) } : { ok: true };
}

export const ssoEnabled = import.meta.env.VITE_SSO_MICROSOFT === "1";

export async function signInWithMicrosoft(): Promise<Result> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: { scopes: "email", redirectTo: window.location.origin },
  });
  return error ? { ok: false, error: "sso" } : { ok: true };
}

/** Siempre responde igual exista o no la cuenta (no revela quién tiene acceso). */
export async function requestPasswordReset(email: string): Promise<Result> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: window.location.origin,
  });
  if (error && mapError(error) === "rate") return { ok: false, error: "rate" };
  if (error && mapError(error) === "network") return { ok: false, error: "network" };
  return { ok: true };
}

export type LinkType = "recovery" | "invite";

/** Lee ?token_hash=…&type=… de los correos de invitación / recuperación. */
export function readEmailLink(): { tokenHash: string; type: LinkType } | null {
  const q = new URLSearchParams(window.location.search);
  const tokenHash = q.get("token_hash");
  const type = q.get("type");
  if (!tokenHash || (type !== "recovery" && type !== "invite")) return null;
  return { tokenHash, type };
}

export function clearEmailLink() {
  const u = new URL(window.location.href);
  u.searchParams.delete("token_hash");
  u.searchParams.delete("type");
  window.history.replaceState(null, "", u.pathname + u.search + u.hash);
}

export async function verifyEmailLink(tokenHash: string, type: LinkType): Promise<Result> {
  // El enlace del correo abre una sesión temporal solo para poner la contraseña.
  const prev = remembering();
  setRemembering(false);
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) setRemembering(prev);
  return error ? { ok: false, error: mapError(error) === "network" ? "network" : "link" } : { ok: true };
}

export async function setNewPassword(password: string, remember: boolean): Promise<Result> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: mapError(error) };
  // A partir de aquí la sesión se guarda según "Mantener la sesión".
  setRemembering(remember);
  const { data } = await supabase.auth.getSession();
  if (data.session) await supabase.auth.setSession(data.session);
  return { ok: true };
}

/** Hay una sesión guardada en este navegador (aún sin comprobar con el servidor). */
export function hasStoredSession(): boolean {
  return !!sessionStore.getItem("chf-auth");
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export function roleOf(session: Session | null): string {
  const role = (session?.user.app_metadata as { role?: unknown } | undefined)?.role;
  return typeof role === "string" && role ? role.toUpperCase() : "";
}
