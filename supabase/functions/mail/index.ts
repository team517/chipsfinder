// Unibox de ChipsFinder: conecta con Gmail por IMAP (recibir) y SMTP (enviar).
// La contraseña de aplicación vive solo aquí (service_role), nunca llega al navegador.
//
// Acciones (POST { action, ... }):
//   status                                   → { connected, address, last_sync, last_error }
//   connect { address, app_password }        → guarda y prueba la conexión (admin)
//   disconnect                               → borra la configuración (admin)
//   sync { limit? }                          → trae correos nuevos y los guarda
//   send { to, subject, html, text?, inReplyTo?, references?, threadId?, clienteId? }

import { createClient, type User } from "jsr:@supabase/supabase-js@2";
import { ImapFlow } from "npm:imapflow@1.0.171";
import { simpleParser } from "npm:mailparser@3.7.2";
import nodemailer from "npm:nodemailer@6.9.16";

const DOMAIN = "@chipsfinder.es";
const SENT_FOLDER = "[Gmail]/Sent Mail";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const ok = (d: Record<string, unknown> = {}) => json({ ok: true, ...d });
const fail = (error: string, extra: Record<string, unknown> = {}) => json({ ok: false, error, ...extra });

const isTeam = (u: User | null | undefined) => !!u && (u.email ?? "").toLowerCase().endsWith(DOMAIN);
const isAdmin = (u: User | null | undefined) => isTeam(u) && (u.app_metadata as { role?: string } | undefined)?.role === "admin";
const domainOf = (email: string | null | undefined) => {
  const m = (email ?? "").split("@")[1];
  return m ? m.toLowerCase().trim() : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("method");

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return fail("auth");
  const asUser = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: me, error: meErr } = await asUser.auth.getUser();
  if (meErr || !me.user || !isTeam(me.user)) return fail("forbidden");

  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const action = String(body.action ?? "");

  async function getConfig(): Promise<{ address: string; app_password: string } | null> {
    const { data } = await db.from("mail_config").select("address, app_password").eq("id", 1).maybeSingle();
    return data ?? null;
  }

  try {
    switch (action) {
      case "status": {
        const { data } = await db.from("mail_config").select("address, last_sync, last_error").eq("id", 1).maybeSingle();
        return ok({ connected: !!data, address: data?.address ?? null, last_sync: data?.last_sync ?? null, last_error: data?.last_error ?? null });
      }

      case "connect": {
        if (!isAdmin(me.user)) return fail("forbidden");
        const address = String(body.address ?? "").trim().toLowerCase();
        const app_password = String(body.app_password ?? "").replace(/\s+/g, "");
        if (!address || !app_password) return fail("empty");
        await db.from("mail_config").upsert({ id: 1, address, app_password, updated_by: me.user.id, updated_at: new Date().toISOString(), last_error: null });
        // Probar IMAP y SMTP
        const test = await testConnection(address, app_password);
        if (!test.ok) {
          await db.from("mail_config").update({ last_error: test.error }).eq("id", 1);
          return fail("connect", { detail: test.error });
        }
        return ok({ address });
      }

      case "disconnect": {
        if (!isAdmin(me.user)) return fail("forbidden");
        await db.from("mail_config").delete().eq("id", 1);
        return ok();
      }

      case "sync": {
        const cfg = await getConfig();
        if (!cfg) return fail("not_connected");
        const limit = Math.min(Number(body.limit ?? 60) || 60, 200);
        const res = await sync(db, cfg.address, cfg.app_password, limit);
        await db.from("mail_config").update({ last_sync: new Date().toISOString(), last_error: res.ok ? null : res.error }).eq("id", 1);
        return res.ok ? ok({ nuevos: res.nuevos }) : fail("sync", { detail: res.error });
      }

      case "send": {
        const cfg = await getConfig();
        if (!cfg) return fail("not_connected");
        const to = String(body.to ?? "").trim();
        const subject = String(body.subject ?? "").trim();
        const html = typeof body.html === "string" ? body.html : "";
        const text = typeof body.text === "string" ? body.text : undefined;
        if (!to || (!html && !text)) return fail("empty");
        const transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: cfg.address, pass: cfg.app_password } });
        const info = await transport.sendMail({
          from: cfg.address,
          to,
          subject,
          html: html || undefined,
          text,
          inReplyTo: typeof body.inReplyTo === "string" ? body.inReplyTo : undefined,
          references: typeof body.references === "string" ? body.references : undefined,
        });
        const threadId = (typeof body.threadId === "string" && body.threadId) || (typeof body.inReplyTo === "string" && body.inReplyTo) || info.messageId;
        await db.from("mensajes").insert({
          folder: "sent", direction: "out", message_id: info.messageId, thread_id: threadId,
          in_reply_to: typeof body.inReplyTo === "string" ? body.inReplyTo : null,
          referencias: typeof body.references === "string" ? body.references : null,
          from_email: cfg.address, to_email: to, subject, fecha: new Date().toISOString(),
          snippet: (text || html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 200),
          body_html: html || null, body_text: text || null, seen: true,
          cliente_id: typeof body.clienteId === "string" ? body.clienteId : null,
        });
        return ok({ messageId: info.messageId });
      }

      default:
        return fail("action");
    }
  } catch (e) {
    return fail("unknown", { detail: String((e as { message?: string })?.message ?? e).slice(0, 300) });
  }
});

async function testConnection(address: string, pass: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: address, pass }, logger: false });
    await client.connect();
    await client.logout();
  } catch (e) {
    return { ok: false, error: "IMAP: " + String((e as { message?: string })?.message ?? e).slice(0, 160) };
  }
  try {
    const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: address, pass } });
    await t.verify();
  } catch (e) {
    return { ok: false, error: "SMTP: " + String((e as { message?: string })?.message ?? e).slice(0, 160) };
  }
  return { ok: true };
}

type DB = ReturnType<typeof createClient>;

async function sync(db: DB, address: string, pass: string, limit: number): Promise<{ ok: true; nuevos: number } | { ok: false; error: string }> {
  // Clientes para identificar por dominio
  const { data: clientes } = await db.from("clientes").select("id, email, dominio");
  const byDomain = new Map<string, string>();
  for (const c of (clientes ?? []) as { id: string; email: string | null; dominio: string | null }[]) {
    const d = (c.dominio && c.dominio.toLowerCase().replace(/^@/, "").trim()) || domainOf(c.email);
    if (d) byDomain.set(d, c.id);
  }

  let client: ImapFlow;
  try {
    client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: address, pass }, logger: false });
    await client.connect();
  } catch (e) {
    return { ok: false, error: "IMAP: " + String((e as { message?: string })?.message ?? e).slice(0, 160) };
  }

  let nuevos = 0;
  try {
    for (const [mailbox, folder, direction] of [["INBOX", "inbox", "in"], [SENT_FOLDER, "sent", "out"]] as const) {
      let lock;
      try {
        lock = await client.getMailboxLock(mailbox);
      } catch {
        continue; // la carpeta puede no existir
      }
      try {
        const total = (client.mailbox && typeof client.mailbox === "object" ? (client.mailbox as { exists?: number }).exists : 0) ?? 0;
        if (!total) continue;
        const start = Math.max(1, total - limit + 1);

        // Qué uids ya tenemos en esta carpeta
        const { data: existentes } = await db.from("mensajes").select("uid").eq("folder", folder).not("uid", "is", null);
        const have = new Set((existentes ?? []).map((r: { uid: number }) => Number(r.uid)));

        for await (const msg of client.fetch(`${start}:*`, { uid: true, source: true, internalDate: true })) {
          const uid = Number(msg.uid);
          if (have.has(uid)) continue;
          let parsed;
          try {
            parsed = await simpleParser(msg.source as Buffer);
          } catch {
            continue;
          }
          const row = buildRow(parsed, uid, folder, direction, byDomain);
          // Si ya existe por message_id (p. ej. un enviado desde la app), actualiza en vez de duplicar
          if (row.message_id) {
            const { data: prev } = await db.from("mensajes").select("id").eq("message_id", row.message_id).limit(1);
            if (prev && prev.length) {
              await db.from("mensajes").update({ uid, folder }).eq("id", (prev[0] as { id: string }).id);
              continue;
            }
          }
          const { error } = await db.from("mensajes").insert(row);
          if (!error) nuevos++;
        }
      } finally {
        lock.release();
      }
    }
    await client.logout();
  } catch (e) {
    try { await client.logout(); } catch { /* ya cerrado */ }
    return { ok: false, error: String((e as { message?: string })?.message ?? e).slice(0, 200) };
  }
  return { ok: true, nuevos };
}

// deno-lint-ignore no-explicit-any
function buildRow(parsed: any, uid: number, folder: string, direction: string, byDomain: Map<string, string>) {
  const fromAddr = parsed.from?.value?.[0] ?? {};
  const toAddr = parsed.to?.value?.[0] ?? {};
  const fromEmail = (fromAddr.address ?? "").toLowerCase();
  const toEmail = (toAddr.address ?? "").toLowerCase();
  const refs: string[] = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [];
  const threadId = refs[0] || parsed.inReplyTo || parsed.messageId || null;

  // Imágenes incrustadas (cid:) → data URI para que se vean sin pedir nada fuera
  let html: string | null = typeof parsed.html === "string" ? parsed.html : parsed.textAsHtml ?? null;
  const adjuntos: { filename: string; contentType: string; size: number }[] = [];
  for (const a of (parsed.attachments ?? []) as { filename?: string; contentType?: string; size?: number; cid?: string; related?: boolean; content?: Uint8Array }[]) {
    const inline = a.related && a.cid && html && (a.size ?? 0) < 2_000_000 && a.content;
    if (inline) {
      const b64 = btoa(String.fromCharCode(...a.content!));
      const dataUri = `data:${a.contentType};base64,${b64}`;
      html = html!.split(`cid:${a.cid}`).join(dataUri).split(`cid:<${a.cid}>`).join(dataUri);
    } else {
      adjuntos.push({ filename: a.filename ?? "adjunto", contentType: a.contentType ?? "application/octet-stream", size: a.size ?? 0 });
    }
  }
  if (html && html.length > 3_000_000) html = html.slice(0, 3_000_000);

  const domain = direction === "in" ? domainOf(fromEmail) : domainOf(toEmail);
  const cliente_id = domain ? byDomain.get(domain) ?? null : null;

  return {
    folder, uid, direction,
    message_id: parsed.messageId ?? null,
    thread_id: threadId,
    in_reply_to: parsed.inReplyTo ?? null,
    referencias: refs.join(" ") || null,
    from_email: fromEmail || null,
    from_name: fromAddr.name ?? null,
    to_email: toEmail || null,
    cc: parsed.cc?.text ?? null,
    subject: parsed.subject ?? null,
    fecha: (parsed.date ?? new Date()).toISOString(),
    snippet: (parsed.text ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null,
    body_html: html,
    body_text: parsed.text ?? null,
    adjuntos: adjuntos,
    seen: direction === "out",
    cliente_id,
  };
}
