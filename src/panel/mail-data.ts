// Datos del Unibox: estado de la conexión, acciones (conectar/sincronizar/enviar)
// y lectura de los correos guardados (con RLS del equipo).

import { supabase } from "../auth";

export type MailStatus = { connected: boolean; address: string | null; last_sync: string | null; last_error: string | null };

export type Adjunto = { filename: string; contentType: string; size: number };

export type Mensaje = {
  id: string;
  folder: string;
  message_id: string | null;
  thread_id: string | null;
  in_reply_to: string | null;
  referencias: string | null;
  from_email: string | null;
  from_name: string | null;
  to_email: string | null;
  cc: string | null;
  subject: string | null;
  fecha: string | null;
  snippet: string | null;
  body_html: string | null;
  body_text: string | null;
  adjuntos: Adjunto[];
  seen: boolean;
  direction: "in" | "out";
  cliente_id: string | null;
  cliente?: { nombre: string } | null;
};

export type Thread = {
  thread_id: string;
  subject: string;
  last: Mensaje;
  count: number;
  unseen: number;
  cliente_id: string | null;
  cliente_nombre: string | null;
  party_email: string;
  party_name: string;
  ids: string[];
};

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string; detail?: string };

async function call<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}): Promise<Ok<T> | Err> {
  try {
    const { data, error } = await supabase.functions.invoke("mail", { body: { action, ...payload } });
    if (error) {
      let code = "network", detail: string | undefined;
      try {
        const b = await (error as { context?: Response }).context?.json?.();
        if (b?.error) { code = b.error; detail = b.detail; }
      } catch { /* vacío */ }
      return { ok: false, error: code, detail };
    }
    if (data && data.ok === false) return { ok: false, error: data.error ?? "unknown", detail: data.detail };
    return { ok: true, ...(data as T) };
  } catch {
    return { ok: false, error: "network" };
  }
}

export const mailStatus = () => call<MailStatus>("status");
export const mailConnect = (address: string, app_password: string) => call("connect", { address, app_password });
export const mailDisconnect = () => call("disconnect");
export const mailSync = (limit = 40) => call<{ nuevos: number; pending: number }>("sync", { limit });
/** Borra correos (en Gmail van a la Papelera). */
export const mailDelete = (ids: string[]) => call<{ deleted: number }>("delete", { ids });

export const mailSend = (p: {
  to: string; subject: string; html: string; text?: string;
  inReplyTo?: string; references?: string; threadId?: string; clienteId?: string;
}) => call<{ messageId: string }>("send", p);

function partyOf(m: Mensaje): { email: string; name: string } {
  if (m.direction === "out") return { email: m.to_email ?? "", name: m.to_email ?? "" };
  return { email: m.from_email ?? "", name: m.from_name || m.from_email || "" };
}

export async function fetchThreads(): Promise<{ ok: boolean; threads: Thread[] }> {
  const { data, error } = await supabase
    .from("mensajes")
    .select("*, cliente:clientes(nombre)")
    .order("fecha", { ascending: false })
    .limit(600);
  if (error) return { ok: false, threads: [] };
  const msgs = (data ?? []) as unknown as Mensaje[];
  const map = new Map<string, Thread>();
  for (const m of msgs) {
    const key = m.thread_id || m.id;
    let t = map.get(key);
    if (!t) {
      const p = partyOf(m);
      t = {
        thread_id: key, subject: m.subject || "(sin asunto)", last: m, count: 0, unseen: 0,
        cliente_id: m.cliente_id, cliente_nombre: m.cliente?.nombre ?? null,
        party_email: p.email, party_name: p.name, ids: [],
      };
      map.set(key, t);
    }
    t.ids.push(m.id);
    t.count += 1;
    if (!m.seen && m.direction === "in") t.unseen += 1;
    if (m.cliente_id && !t.cliente_id) { t.cliente_id = m.cliente_id; t.cliente_nombre = m.cliente?.nombre ?? null; }
    // el "último" ya es el primero por orden desc; actualiza party con el correo entrante más reciente
    if (m.direction === "in" && (!t.party_email || t.last.direction === "out")) {
      const p = partyOf(m);
      t.party_email = p.email; t.party_name = p.name;
    }
  }
  return { ok: true, threads: [...map.values()] };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchThread(threadId: string): Promise<{ ok: boolean; mensajes: Mensaje[] }> {
  // El id del hilo suele ser un Message-ID ("<abc@mail.gmail.com>"): se filtra con eq,
  // que escapa bien esos caracteres (un .or() con ellos daba error 400).
  const byThread = await supabase
    .from("mensajes")
    .select("*, cliente:clientes(nombre)")
    .eq("thread_id", threadId)
    .order("fecha", { ascending: true })
    .limit(500);
  if (byThread.error) return { ok: false, mensajes: [] };
  let rows = (byThread.data ?? []) as unknown as Mensaje[];
  // Correos sin hilo: el "hilo" es el propio mensaje
  if (rows.length === 0 && UUID_RE.test(threadId)) {
    const byId = await supabase.from("mensajes").select("*, cliente:clientes(nombre)").eq("id", threadId).limit(1);
    if (byId.error) return { ok: false, mensajes: [] };
    rows = (byId.data ?? []) as unknown as Mensaje[];
  }
  return { ok: true, mensajes: rows };
}

export async function markThreadSeen(threadId: string) {
  await supabase.from("mensajes").update({ seen: true }).eq("thread_id", threadId).eq("direction", "in").eq("seen", false);
  if (UUID_RE.test(threadId)) await supabase.from("mensajes").update({ seen: true }).eq("id", threadId).eq("seen", false);
}

/** Redacta o traduce un correo con IA (en el servidor). error "no_key" si no hay clave configurada. */
export const mailAi = (p: Record<string, unknown>) => call<{ subject: string; body: string }>("ai", p);

const GENERIC = ["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "qq.com", "163.com", "126.com", "aol.com", "gmx.com", "gmx.de", "proton.me", "protonmail.com"];

/** Hilo del Unibox con la respuesta de un proveedor: el guardado en la oferta o su último correo recibido. */
export async function findReplyThread(o: { respuesta_thread?: string | null; email?: string | null; provEmail?: string | null }): Promise<string | null> {
  if (o.respuesta_thread) return o.respuesta_thread;
  const email = (o.provEmail || o.email || "").trim().toLowerCase();
  if (!email) return null;
  const pick = async (pattern: string) => {
    const { data } = await supabase.from("mensajes").select("thread_id, message_id").eq("direction", "in").ilike("from_email", pattern).order("fecha", { ascending: false }).limit(1);
    const m = (data ?? [])[0] as { thread_id: string | null; message_id: string | null } | undefined;
    return m ? m.thread_id || m.message_id : null;
  };
  const exact = await pick(email);
  if (exact) return exact;
  const dom = email.split("@")[1];
  return dom && !GENERIC.includes(dom) ? pick("%@" + dom) : null;
}
