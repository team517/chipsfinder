// Capa de acceso. Hoy es una simulación (como en el diseño): valida el formato
// y responde "OK" tras 1,3 s. Para conectarlo a un sistema real (Supabase,
// Microsoft Entra, API propia…) basta con cambiar estas tres funciones.

import { ALLOWED_DOMAIN } from "./config";

export type LoginError = "empty" | "domain" | "short";

const domainRe = new RegExp("@" + ALLOWED_DOMAIN.replace(/\./g, "\\.") + "$");

export function validateLogin(email: string, password: string): LoginError | null {
  const e = email.trim().toLowerCase();
  if (!e || !password) return "empty";
  if (!domainRe.test(e)) return "domain";
  if (password.length < 8) return "short";
  return null;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function signIn(_email: string, _password: string, _remember: boolean): Promise<void> {
  await wait(1300);
}

export async function signInWithMicrosoft(): Promise<void> {
  // En el diseño el SSO entra directamente.
}

export async function requestPasswordReset(_email: string): Promise<void> {
  // En el diseño se muestra el aviso al momento.
}
