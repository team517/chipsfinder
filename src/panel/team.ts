// Cliente del panel para la función de servidor "team" (gestión de accesos).
// La función comprueba en el servidor que quien llama es administrador @chipsfinder.es.

import { supabase } from "../auth";

export type Role = "admin" | "team";

export type TeamUser = {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  lastSignIn: string | null;
  createdAt: string;
};

export type TeamErr =
  | "forbidden"
  | "auth"
  | "self"
  | "domain"
  | "bademail"
  | "empty"
  | "exists"
  | "rate"
  | "network"
  | "unknown";

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: TeamErr };

async function call<T = Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<Ok<T> | Err> {
  try {
    const { data, error } = await supabase.functions.invoke("team", { body: { action, ...payload } });
    if (error) {
      // La función siempre responde 200; si llega aquí es un fallo de red o del gateway.
      let code: TeamErr = "network";
      try {
        const body = await (error as { context?: Response }).context?.json?.();
        if (body?.error) code = body.error as TeamErr;
      } catch {
        /* sin cuerpo legible */
      }
      return { ok: false, error: code };
    }
    if (data && data.ok === false) return { ok: false, error: (data.error ?? "unknown") as TeamErr };
    return { ok: true, ...(data as T) };
  } catch {
    return { ok: false, error: "network" };
  }
}

export const listUsers = () => call<{ users: TeamUser[]; me: string }>("list");

export const createAccess = (email: string, role: Role, mode: "password" | "invite") =>
  call<{ mode: string; email: string; password?: string }>("create", {
    email,
    role,
    mode,
    redirectTo: window.location.origin,
  });

export const setRole = (id: string, role: Role) => call("set_role", { id, role });
export const setActive = (id: string, active: boolean) => call("set_active", { id, active });
export const deleteAccess = (id: string) => call("delete", { id });
