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
import { Buffer } from "node:buffer";

const DOMAIN = "@chipsfinder.es";
const SENT_FOLDER = "[Gmail]/Sent Mail";
const TIME_BUDGET_MS = 90_000; // cortar antes del límite de 150 s de la función
const FULL_MAX_BYTES = 3_000_000; // por encima, solo se baja el texto (sin adjuntos pesados)
const STEP_TIMEOUT_MS = 25_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

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
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const action = String(body.action ?? "");

  async function getConfig(): Promise<{ address: string; app_password: string } | null> {
    const { data } = await db.from("mail_config").select("address, app_password").eq("id", 1).maybeSingle();
    return data ?? null;
  }

  // Sincronización automática (pg_cron): solo puede pedir "sync", con el secreto del servidor
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) {
    if (action !== "sync") return fail("forbidden");
    const cfg = await getConfig();
    if (!cfg) return ok({ skipped: "not_connected" });
    const res = await sync(db, cfg.address, cfg.app_password, Math.min(Number(body.limit ?? 5) || 5, 8));
    await db.from("mail_config").update({ last_sync: new Date().toISOString(), last_error: res.ok ? null : res.error }).eq("id", 1);
    return res.ok ? ok({ nuevos: res.nuevos, pending: res.pending }) : fail("sync", { detail: res.error });
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return fail("auth");
  const asUser = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: me, error: meErr } = await asUser.auth.getUser();
  if (meErr || !me.user || !isTeam(me.user)) return fail("forbidden");

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
        const limit = Math.min(Number(body.limit ?? 5) || 5, 8);
        const res = await sync(db, cfg.address, cfg.app_password, limit);
        await db.from("mail_config").update({ last_sync: new Date().toISOString(), last_error: res.ok ? null : res.error }).eq("id", 1);
        return res.ok ? ok({ nuevos: res.nuevos, pending: res.pending }) : fail("sync", { detail: res.error });
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

      case "ai": {
        // Redacta (task "rfq") o traduce (task "translate") un correo a proveedor
        const lang = body.lang === "es" ? "es" : "en";
        const langName = lang === "es" ? "Spanish (Spain)" : "English";
        let system: string, user: string;
        if (body.task === "translate") {
          system = `You translate business emails into ${langName}. Keep the exact structure: greeting, paragraphs, bullet and numbered lists, line breaks, sign-off and the signature block (company, email, web stay unchanged; translate a generic team name like \"Sourcing Team\" ↔ \"Equipo de compras\"). Adapt units and number format (pcs ↔ uds., 1,000 ↔ 1.000). In Spanish use \"Solicitud de oferta\" for RFQ. Natural, professional tone. Reply only with JSON {"subject": string, "body": string}; body is plain text.`;
          user = JSON.stringify({ subject: String(body.subject ?? ""), body: String(body.body ?? "") });
        } else {
          const W = lang === "es"
            ? { greet: "Estimado equipo de <proveedor>:", qty: "1.000 uds. (mín.)", ask: "¿Podrían indicarnos, por favor?", bye: "Un saludo,", subj: "Solicitud de oferta – <MPN> – <cantidad> uds." }
            : { greet: "Dear <supplier> team,", qty: "1,000 pcs (min.)", ask: "Could you please confirm the following:", bye: "Best regards,", subj: "RFQ – <MPN> – <qty> pcs" };
          system = [
            "You write purchase enquiry (RFQ) emails for ChipsFinder, an electronic components sourcing company, to a supplier or distributor.",
            `Write the WHOLE email (subject and body) in ${langName}, even if the input data is in another language.`,
            "Structure, as plain text with blank lines between blocks:",
            `1) Greeting: "${W.greet}". 2) One short polite line and one line saying we are sourcing this part for a customer.`,
            `3) Part details as a bullet list with • (part number, manufacturer, description if given, quantity). Quantity format like "${W.qty}".`,
            `4) The line "${W.ask}" followed by a numbered list asking exactly the questions requested (in ${langName}).`,
            "5) A short closing line thanking them in advance and asking for their best offer.",
            `6) "${W.bye}" on its own line, a blank line, then the signature block exactly as provided (translate only a generic team name).`,
            "Never mention the name of our customer. Be concise, warm and professional. No markdown, no asterisks.",
            `Reply only with JSON {"subject": string, "body": string}. Subject like "${W.subj}".`,
          ].join("\n");
          user = JSON.stringify({
            supplier: String(body.supplier ?? ""), part: body.part ?? {}, questions: Array.isArray(body.questions) ? body.questions : [],
            signature: String(body.signature ?? "ChipsFinder"), extra_note: String(body.note ?? ""),
          });
        }
        const r = await llm(system, user);
        if (!r.ok) return fail(r.error);
        return ok({ subject: r.subject, body: r.body });
      }

      case "delete": {
        // Borra correos: en Gmail se mueven a la Papelera (así no vuelven con la sincronización)
        const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map(String).slice(0, 500) : [];
        if (!ids.length) return fail("empty");
        const { data: rows } = await db.from("mensajes").select("id, folder, uid").in("id", ids);
        const list = (rows ?? []) as { id: string; folder: string; uid: number | null }[];
        const conUid = list.filter((r) => r.uid != null);
        let okIds = list.filter((r) => r.uid == null).map((r) => r.id);
        if (conUid.length) {
          const cfg = await getConfig();
          if (!cfg) return fail("not_connected");
          const moved = await trashInGmail(cfg.address, cfg.app_password, conUid);
          if (!moved.ok) return fail("delete", { detail: moved.error });
          okIds = okIds.concat(moved.ids);
        }
        if (okIds.length) await db.from("mensajes").delete().in("id", okIds);
        return ok({ deleted: okIds.length });
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

// deno-lint-ignore no-explicit-any
type Meta = { uid: number; size?: number; envelope?: any; bodyStructure?: any; internalDate?: Date };

/** Todos los uids ya guardados de una carpeta (paginando: Supabase devuelve 1000 por consulta). */
async function storedUids(db: DB, folder: string): Promise<Set<number>> {
  const have = new Set<number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("mensajes").select("uid").eq("folder", folder).not("uid", "is", null).range(from, from + 999);
    if (error || !data) break;
    for (const r of data as { uid: number }[]) have.add(Number(r.uid));
    if (data.length < 1000) break;
  }
  return have;
}

async function saveRow(db: DB, row: Record<string, unknown>): Promise<boolean> {
  // Si ya existe por message_id (p. ej. un enviado desde la app), se enlaza en vez de duplicar
  if (row.message_id) {
    const { data: prev } = await db.from("mensajes").select("id").eq("message_id", row.message_id as string).limit(1);
    if (prev && prev.length) {
      await db.from("mensajes").update({ uid: row.uid, folder: row.folder }).eq("id", (prev[0] as { id: string }).id);
      return false;
    }
  }
  const { error } = await db.from("mensajes").insert(row);
  return !error;
}

async function sync(db: DB, address: string, pass: string, limit: number): Promise<{ ok: true; nuevos: number; pending: number } | { ok: false; error: string }> {
  const t0 = Date.now();
  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - t0);

  // Clientes para identificar por dominio
  const { data: clientes } = await db.from("clientes").select("id, email, dominio");
  const byDomain = new Map<string, string>();
  for (const c of (clientes ?? []) as { id: string; email: string | null; dominio: string | null }[]) {
    const d = (c.dominio && c.dominio.toLowerCase().replace(/^@/, "").trim()) || domainOf(c.email);
    if (d) byDomain.set(d, c.id);
  }

  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: address, pass }, logger: false });
  try {
    await withTimeout(client.connect(), STEP_TIMEOUT_MS);
  } catch (e) {
    try { client.close(); } catch { /* nada */ }
    return { ok: false, error: "IMAP: " + String((e as { message?: string })?.message ?? e).slice(0, 160) };
  }

  let nuevos = 0;
  let pending = 0;
  let stalled = false;
  try {
    // Carpeta de enviados real (en Gmail en español se llama "[Gmail]/Enviados")
    let sentPath = SENT_FOLDER;
    try {
      const boxes = (await withTimeout(client.list(), STEP_TIMEOUT_MS)) as { path: string; specialUse?: string }[];
      sentPath = boxes.find((b) => b.specialUse === "\\Sent")?.path ?? SENT_FOLDER;
    } catch { /* se usa el nombre por defecto */ }

    for (const [mailbox, folder, direction] of [["INBOX", "inbox", "in"], [sentPath, "sent", "out"]] as const) {
      if (timeLeft() < 15_000) { pending += 1; break; }
      let lock;
      try {
        lock = await withTimeout(client.getMailboxLock(mailbox), STEP_TIMEOUT_MS);
      } catch {
        continue; // la carpeta puede no existir
      }
      try {
        const allUids = (await withTimeout(client.search({ all: true }, { uid: true }), STEP_TIMEOUT_MS)) as number[] | false;
        if (!allUids || allUids.length === 0) continue;

        const have = await storedUids(db, folder);
        const missing = allUids.map(Number).filter((u) => !have.has(u)).sort((a, b) => b - a); // nuevos primero
        const batch = missing.slice(0, limit);
        pending += missing.length - batch.length;
        if (batch.length === 0) continue;

        // 1) Datos ligeros del lote (tamaño, cabeceras, estructura)
        const metas: Meta[] = [];
        for await (const m of client.fetch(batch.join(","), { uid: true, size: true, envelope: true, bodyStructure: true, internalDate: true }, { uid: true })) {
          metas.push(m as unknown as Meta);
        }
        metas.sort((a, b) => b.uid - a.uid);

        // 2) Contenido, uno a uno, sin pasarse de tiempo
        let done = 0;
        let bytes = 0;
        for (const m of metas) {
          if (timeLeft() < 12_000) break;
          // Tope de CPU por llamada: no más de ~2,5 MB de correo analizado
          if (done > 0 && bytes + (m.size ?? 0) > 2_500_000) break;
          bytes += Math.min(m.size ?? 0, FULL_MAX_BYTES);
          let row: Record<string, unknown>;
          try {
            if ((m.size ?? 0) <= FULL_MAX_BYTES) {
              const full = (await withTimeout(client.fetchOne(String(m.uid), { source: true }, { uid: true }), STEP_TIMEOUT_MS)) as { source?: Uint8Array };
              const parsed = await withTimeout(simpleParser(Buffer.from(full.source ?? new Uint8Array())), STEP_TIMEOUT_MS);
              row = buildRow(parsed, m.uid, folder, direction, byDomain);
            } else {
              row = await withTimeout(buildRowLarge(client, m, folder, direction, byDomain), STEP_TIMEOUT_MS);
            }
          } catch (e) {
            // Si un correo no se puede leer se guarda con sus cabeceras, para no reintentarlo siempre
            const msg = String((e as { message?: string })?.message ?? e);
            row = envelopeRow(m, folder, direction, byDomain);
            if (msg.includes("timeout")) {
              if (await saveRow(db, row)) nuevos++;
              done++;
              stalled = true; // la conexión puede haber quedado colgada: se sigue en la próxima vuelta
              break;
            }
          }
          if (await saveRow(db, row)) nuevos++;
          done++;
        }
        pending += metas.length - done;
      } finally {
        try { lock.release(); } catch { /* nada */ }
      }
      if (stalled) break;
    }
    try { await withTimeout(client.logout(), 5_000); } catch { try { client.close(); } catch { /* nada */ } }
  } catch (e) {
    try { client.close(); } catch { /* nada */ }
    return { ok: false, error: String((e as { message?: string })?.message ?? e).slice(0, 200) };
  }
  if (stalled && pending === 0) pending = 1;
  return { ok: true, nuevos, pending };
}

/** Mueve correos a la Papelera de Gmail. Devuelve los ids que se movieron bien. */
async function trashInGmail(address: string, pass: string, rows: { id: string; folder: string; uid: number | null }[]): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: address, pass }, logger: false });
  try {
    await withTimeout(client.connect(), STEP_TIMEOUT_MS);
  } catch (e) {
    try { client.close(); } catch { /* nada */ }
    return { ok: false, error: "IMAP: " + String((e as { message?: string })?.message ?? e).slice(0, 160) };
  }
  const done: string[] = [];
  try {
    const boxes = (await withTimeout(client.list(), STEP_TIMEOUT_MS)) as { path: string; specialUse?: string }[];
    const trash = boxes.find((b) => b.specialUse === "\\Trash")?.path ?? "[Gmail]/Trash";
    const sent = boxes.find((b) => b.specialUse === "\\Sent")?.path ?? SENT_FOLDER;
    for (const [folder, mailbox] of [["inbox", "INBOX"], ["sent", sent]] as const) {
      const group = rows.filter((r) => r.folder === folder && r.uid != null);
      if (!group.length) continue;
      const lock = await withTimeout(client.getMailboxLock(mailbox), STEP_TIMEOUT_MS);
      try {
        await withTimeout(client.messageMove(group.map((r) => r.uid).join(","), trash, { uid: true }), STEP_TIMEOUT_MS);
        done.push(...group.map((r) => r.id));
      } finally {
        try { lock.release(); } catch { /* nada */ }
      }
    }
    try { await withTimeout(client.logout(), 5_000); } catch { try { client.close(); } catch { /* nada */ } }
  } catch (e) {
    try { client.close(); } catch { /* nada */ }
    if (!done.length) return { ok: false, error: String((e as { message?: string })?.message ?? e).slice(0, 200) };
  }
  return { ok: true, ids: done };
}

// deno-lint-ignore no-explicit-any
function addr(list: any): { address: string; name: string | null } {
  const a = Array.isArray(list) ? list[0] : null;
  return { address: (a?.address ?? "").toLowerCase(), name: a?.name || null };
}

/** Fila solo con cabeceras (para correos que no se pueden leer enteros). */
function envelopeRow(m: Meta, folder: string, direction: string, byDomain: Map<string, string>) {
  const env = m.envelope ?? {};
  const from = addr(env.from);
  const to = addr(env.to);
  const domain = direction === "in" ? domainOf(from.address) : domainOf(to.address);
  return {
    folder, uid: m.uid, direction,
    message_id: env.messageId ?? null,
    thread_id: env.inReplyTo || env.messageId || null,
    in_reply_to: env.inReplyTo ?? null,
    referencias: null,
    from_email: from.address || null,
    from_name: from.name,
    to_email: to.address || null,
    cc: null,
    subject: env.subject ?? null,
    fecha: new Date(env.date ?? m.internalDate ?? Date.now()).toISOString(),
    snippet: null,
    body_html: null,
    body_text: "(No se pudo descargar el contenido de este correo. Ábrelo en Gmail.)",
    adjuntos: [],
    seen: direction === "out",
    cliente_id: domain ? byDomain.get(domain) ?? null : null,
  };
}

/** Correos grandes: solo se baja la parte de texto/HTML, los adjuntos se listan sin descargarlos. */
async function buildRowLarge(client: ImapFlow, m: Meta, folder: string, direction: string, byDomain: Map<string, string>) {
  const row = envelopeRow(m, folder, direction, byDomain) as Record<string, unknown>;
  let htmlPart: string | null = null;
  let textPart: string | null = null;
  const adjuntos: { filename: string; contentType: string; size: number }[] = [];
  // deno-lint-ignore no-explicit-any
  const walk = (n: any) => {
    if (!n) return;
    if (Array.isArray(n.childNodes) && n.childNodes.length) { n.childNodes.forEach(walk); return; }
    const filename = n.dispositionParameters?.filename || n.parameters?.name;
    const isAtt = n.disposition === "attachment" || !!filename;
    if (isAtt) adjuntos.push({ filename: filename ?? "adjunto", contentType: n.type ?? "application/octet-stream", size: n.size ?? 0 });
    else if (n.type === "text/html" && !htmlPart) htmlPart = n.part ?? "1";
    else if (n.type === "text/plain" && !textPart) textPart = n.part ?? "1";
  };
  walk(m.bodyStructure);

  async function read(part: string): Promise<string> {
    const { content } = await client.download(String(m.uid), part, { uid: true, maxBytes: 1_500_000 });
    const chunks: Uint8Array[] = [];
    for await (const c of content as AsyncIterable<Uint8Array>) chunks.push(c);
    return Buffer.concat(chunks).toString("utf8");
  }
  const html = htmlPart ? await read(htmlPart) : null;
  const text = textPart ? await read(textPart) : null;
  row.body_html = html;
  row.body_text = text ?? (html ? null : row.body_text);
  row.snippet = (text ?? (html ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 200) || null;
  row.adjuntos = adjuntos;
  return row;
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
      const b64 = Buffer.from(a.content!).toString("base64");
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

// ---------- IA para redactar / traducir (OpenAI o DeepSeek, la clave que haya) ----------
async function llm(system: string, user: string): Promise<{ ok: true; subject: string; body: string } | { ok: false; error: string }> {
  const openai = Deno.env.get("OPENAI_API_KEY");
  const deepseek = Deno.env.get("DEEPSEEK_API_KEY");
  const conf = openai
    ? { url: "https://api.openai.com/v1/chat/completions", key: openai, model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini" }
    : deepseek
      ? { url: "https://api.deepseek.com/chat/completions", key: deepseek, model: "deepseek-chat" }
      : null;
  if (!conf) return { ok: false, error: "no_key" };
  try {
    const res = await withTimeout(fetch(conf.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${conf.key}` },
      body: JSON.stringify({
        model: conf.model, temperature: 0.4, response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    }), 40_000);
    if (!res.ok) return { ok: false, error: "ai_" + res.status };
    const data = await res.json();
    const out = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
    const subject = String(out.subject ?? "").trim();
    const text = String(out.body ?? "").replace(/\r\n/g, "\n").trim();
    if (!text) return { ok: false, error: "ai_empty" };
    return { ok: true, subject, body: text };
  } catch {
    return { ok: false, error: "ai_error" };
  }
}
