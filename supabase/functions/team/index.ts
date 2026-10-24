// Gestión de accesos del equipo ChipsFinder.
// Se ejecuta en Supabase (Edge Function), con la clave secreta que NUNCA llega al navegador.
// Solo responde a administradores con cuenta @chipsfinder.es; el resto recibe "forbidden".
//
// Acciones (POST { action, ... }):
//   list                              → lista de cuentas
//   create { email, role, mode }      → crea una cuenta (mode "password" o "invite")
//   set_role { id, role }             → "admin" | "team"
//   set_active { id, active }         → activar / desactivar (no se puede entrar)
//   delete { id }                     → borra la cuenta

import { createClient, type User } from "jsr:@supabase/supabase-js@2";

const DOMAIN = "@chipsfinder.es";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const ok = (data: Record<string, unknown> = {}) => json({ ok: true, ...data });
const fail = (error: string, extra: Record<string, unknown> = {}) => json({ ok: false, error, ...extra });

function tempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 14);
}

const isAdminUser = (u: User | null | undefined) =>
  !!u &&
  (u.email ?? "").toLowerCase().endsWith(DOMAIN) &&
  (u.app_metadata as { role?: string } | undefined)?.role === "admin";

type Shape = {
  id: string;
  email: string;
  role: "admin" | "team";
  active: boolean;
  lastSignIn: string | null;
  createdAt: string;
};

const shape = (u: User): Shape => {
  const banned = (u as { banned_until?: string }).banned_until;
  const active = !(banned && new Date(banned) > new Date());
  return {
    id: u.id,
    email: u.email ?? "",
    role: (u.app_metadata as { role?: string } | undefined)?.role === "admin" ? "admin" : "team",
    active,
    lastSignIn: u.last_sign_in_at ?? null,
    createdAt: u.created_at,
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("method");

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Quién llama (su propio token)
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return fail("auth");
  const asUser = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: me, error: meErr } = await asUser.auth.getUser();
  if (meErr || !me.user) return fail("auth");
  if (!isAdminUser(me.user)) return fail("forbidden");
  const callerId = me.user.id;

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* sin cuerpo */
  }
  const action = String(body.action ?? "");

  const allUsers = async (): Promise<User[]> => {
    const out: User[] = [];
    for (let page = 1; ; page++) {
      const { data, error } = await admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      out.push(...data.users);
      if (data.users.length < 200) return out;
    }
  };

  try {
    switch (action) {
      case "list": {
        const users = (await allUsers()).map(shape).sort((a, b) => a.email.localeCompare(b.email));
        return ok({ users, me: callerId });
      }

      case "create": {
        const email = String(body.email ?? "").trim().toLowerCase();
        const role = body.role === "admin" ? "admin" : "team";
        const mode = body.mode === "invite" ? "invite" : "password";
        if (!email) return fail("empty");
        if (!email.endsWith(DOMAIN)) return fail("domain");
        if (!/^[^@\s]+@chipsfinder\.es$/.test(email)) return fail("bademail");
        const app_metadata = role === "admin" ? { role: "admin" } : {};

        if (mode === "invite") {
          const redirectTo = typeof body.redirectTo === "string" ? body.redirectTo : undefined;
          const { data, error } = await admin.inviteUserByEmail(email, { redirectTo });
          if (error) return fail(mapAdminError(error));
          if (role === "admin" && data.user) await admin.updateUserById(data.user.id, { app_metadata });
          return ok({ mode: "invite", email });
        }

        const password = tempPassword();
        const { error } = await admin.createUser({ email, password, email_confirm: true, app_metadata });
        if (error) return fail(mapAdminError(error));
        return ok({ mode: "password", email, password });
      }

      case "set_role": {
        const id = String(body.id ?? "");
        const role = body.role === "admin" ? "admin" : "team";
        if (!id) return fail("empty");
        if (id === callerId && role !== "admin") return fail("self");
        const target = await admin.getUserById(id);
        const prev = (target.data.user?.app_metadata ?? {}) as Record<string, unknown>;
        const { error } = await admin.updateUserById(id, {
          app_metadata: { ...prev, role: role === "admin" ? "admin" : null },
        });
        if (error) return fail(mapAdminError(error));
        return ok();
      }

      case "set_active": {
        const id = String(body.id ?? "");
        const active = body.active !== false;
        if (!id) return fail("empty");
        if (id === callerId && !active) return fail("self");
        const { error } = await admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
        if (error) return fail(mapAdminError(error));
        return ok();
      }

      case "delete": {
        const id = String(body.id ?? "");
        if (!id) return fail("empty");
        if (id === callerId) return fail("self");
        const { error } = await admin.deleteUser(id);
        if (error) return fail(mapAdminError(error));
        return ok();
      }

      default:
        return fail("action");
    }
  } catch (e) {
    return fail(mapAdminError(e));
  }
});

function mapAdminError(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message?.toLowerCase() ?? "";
  if (msg.includes("already been registered") || msg.includes("already exists")) return "exists";
  if (msg.includes("@chipsfinder.es") || msg.includes("database error")) return "domain";
  if (msg.includes("rate") || msg.includes("too many")) return "rate";
  return "unknown";
}
