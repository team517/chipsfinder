import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Lang } from "../i18n";
import { tr, type Tr } from "./format";
import {
  fetchThread,
  fetchThreads,
  mailConnect,
  mailDelete,
  mailDisconnect,
  mailSend,
  mailStatus,
  mailSync,
  markThreadSeen,
  type Mensaje,
  type Thread,
} from "./mail-data";

const C = {
  eyebrow: ["Correo del equipo", "Team inbox"] as Tr,
  title: ["Unibox", "Unibox"] as Tr,
  intro: ["Todos los correos en un sitio. Responde en el mismo hilo; cada conversación se enlaza con su cliente.", "All your email in one place. Reply in the same thread; each conversation links to its client."] as Tr,
  sync: ["Sincronizar", "Sync"] as Tr,
  syncing: ["Importando…", "Importing…"] as Tr,
  importAll: ["Importar todo", "Import all"] as Tr,
  forward: ["Reenviar", "Forward"] as Tr,
  fwdTitle: ["Reenviar correo", "Forward email"] as Tr,
  fwdTo: ["Para (correo)", "To (email)"] as Tr,
  fwdNote: ["Mensaje (opcional)", "Message (optional)"] as Tr,
  fwdOriginal: ["Se reenvía el correo original debajo.", "The original email is forwarded below."] as Tr,
  fwdErrTo: ["Escribe el correo del destinatario.", "Enter the recipient's email."] as Tr,
  lastSync: ["Última sincronización", "Last sync"] as Tr,
  never: ["nunca", "never"] as Tr,
  loading: ["Cargando…", "Loading…"] as Tr,
  noThreads: ["No hay correos todavía. Pulsa «Sincronizar» para traerlos de Gmail.", "No email yet. Press “Sync” to pull it from Gmail."] as Tr,
  search: ["Buscar…", "Search…"] as Tr,
  unread: ["sin leer", "unread"] as Tr,
  pickThread: ["Elige una conversación", "Pick a conversation"] as Tr,
  reply: ["Responder", "Reply"] as Tr,
  replyPlaceholder: ["Escribe tu respuesta…", "Write your reply…"] as Tr,
  send: ["Enviar", "Send"] as Tr,
  sending: ["Enviando…", "Sending…"] as Tr,
  cancel: ["Cancelar", "Cancel"] as Tr,
  close: ["Cerrar", "Close"] as Tr,
  retry: ["Reintentar", "Retry"] as Tr,
  selectAll: ["Seleccionar todo", "Select all"] as Tr,
  selectOne: ["Seleccionar conversación", "Select conversation"] as Tr,
  nSelected: (n: number): Tr => [n === 1 ? "1 seleccionada" : n + " seleccionadas", n === 1 ? "1 selected" : n + " selected"],
  delSelected: ["Borrar selección", "Delete selection"] as Tr,
  delSelectedQ: (n: number): Tr => [
    "¿Borrar " + (n === 1 ? "1 conversación" : n + " conversaciones") + "? En Gmail irán a la Papelera.",
    "Delete " + (n === 1 ? "1 conversation" : n + " conversations") + "? In Gmail they go to Trash.",
  ],
  delThread: ["Borrar conversación", "Delete conversation"] as Tr,
  delMsg: ["Borrar", "Delete"] as Tr,
  delThreadQ: ["¿Borrar toda la conversación? En Gmail irá a la Papelera.", "Delete the whole conversation? In Gmail it goes to Trash."] as Tr,
  delMsgQ: ["¿Borrar este mensaje? En Gmail irá a la Papelera.", "Delete this message? In Gmail it goes to Trash."] as Tr,
  delYes: ["Sí, borrar", "Yes, delete"] as Tr,
  deleting: ["Borrando…", "Deleting…"] as Tr,
  delErr: ["No se pudo borrar. Inténtalo de nuevo.", "Could not delete. Try again."] as Tr,
  threadErr: ["No se pudo abrir esta conversación.", "Could not open this conversation."] as Tr,
  sent: ["Enviado", "Sent"] as Tr,
  sendErr: ["No se pudo enviar. Inténtalo de nuevo.", "Could not send. Try again."] as Tr,
  you: ["Tú", "You"] as Tr,
  attachments: ["Adjuntos", "Attachments"] as Tr,
  client: ["Cliente", "Client"] as Tr,
  noClient: ["Sin cliente", "No client"] as Tr,
  openClient: ["Ver cliente", "Open client"] as Tr,
  // conexión
  connectTitle: ["Conecta tu Gmail", "Connect your Gmail"] as Tr,
  connectIntro: ["Conecta el correo del equipo por IMAP/SMTP con una contraseña de aplicación de Gmail.", "Connect the team inbox via IMAP/SMTP with a Gmail app password."] as Tr,
  address: ["Correo de Gmail", "Gmail address"] as Tr,
  appPw: ["Contraseña de aplicación", "App password"] as Tr,
  appPwHint: ["16 caracteres, sin espacios. No es tu contraseña normal de Gmail.", "16 characters, no spaces. Not your normal Gmail password."] as Tr,
  connect: ["Conectar", "Connect"] as Tr,
  connecting: ["Conectando…", "Connecting…"] as Tr,
  disconnect: ["Desconectar", "Disconnect"] as Tr,
  connectedAs: ["Conectado como", "Connected as"] as Tr,
  adminOnly: ["Pide a un administrador que conecte el correo del equipo.", "Ask an administrator to connect the team inbox."] as Tr,
  howTitle: ["Cómo sacar la contraseña de aplicación", "How to get the app password"] as Tr,
  how: [
    ["Activa la verificación en dos pasos en tu cuenta de Google.", "Turn on 2-step verification in your Google account."],
    ["Entra en myaccount.google.com → Seguridad → Contraseñas de aplicaciones.", "Go to myaccount.google.com → Security → App passwords."],
    ["Crea una para «Correo» y copia los 16 caracteres aquí.", "Create one for “Mail” and paste the 16 characters here."],
  ] as Tr[],
  errEmpty: ["Rellena el correo y la contraseña de aplicación.", "Fill in the email and app password."] as Tr,
  errConnect: ["No se pudo conectar. Revisa el correo y la contraseña de aplicación.", "Could not connect. Check the email and app password."] as Tr,
  errForbidden: ["Solo un administrador puede conectar el correo.", "Only an administrator can connect the inbox."] as Tr,
};

function when(iso: string | null, lang: Lang): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString(lang === "es" ? "es-ES" : "en-GB", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(lang === "es" ? "es-ES" : "en-GB", { day: "2-digit", month: "short" });
}
const KB = (n: number) => (n < 1024 ? n + " B" : n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB");

export default function Unibox({ lang, isAdmin, onOpenClient }: { lang: Lang; isAdmin: boolean; onOpenClient: (id: string) => void }) {
  const [status, setStatus] = useState<{ connected: boolean; address: string | null; last_sync: string | null } | null>(null);

  const refresh = useCallback(async () => {
    const s = await mailStatus();
    if (s.ok) setStatus({ connected: s.connected, address: s.address, last_sync: s.last_sync });
    else setStatus({ connected: false, address: null, last_sync: null });
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  if (status === null) return <div className="state" style={{ marginTop: 24 }}>{tr(C.loading, lang)}</div>;
  if (!status.connected) return <Connect lang={lang} isAdmin={isAdmin} onConnected={refresh} />;
  return <Inbox lang={lang} isAdmin={isAdmin} status={status} onStatus={refresh} onOpenClient={onOpenClient} />;
}

/* ---------- Conectar Gmail ---------- */

function Connect({ lang, isAdmin, onConnected }: { lang: Lang; isAdmin: boolean; onConnected: () => void }) {
  const [address, setAddress] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!address.trim() || !pw.trim()) return setError("empty");
    setError(null);
    setBusy(true);
    const r = await mailConnect(address.trim(), pw);
    setBusy(false);
    if (!r.ok) return setError(r.error === "forbidden" ? "forbidden" : "connect");
    onConnected();
  }

  return (
    <section className="page-sec page-sec--narrow">
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">✉</span>{tr(C.eyebrow, lang)}</span>
          <h1 className="sec-title">{tr(C.title, lang)}</h1>
          <p className="sec-intro">{tr(C.intro, lang)}</p>
        </div>
      </header>

      {!isAdmin ? (
        <div className="card"><div className="note"><span className="note__tag">INT</span><span className="note__text">{tr(C.adminOnly, lang)}</span></div></div>
      ) : (
        <form className="card" onSubmit={submit} noValidate>
          <div className="card__head">
            <h2 className="board__title">{tr(C.connectTitle, lang)}</h2>
            <p className="fhint">{tr(C.connectIntro, lang)}</p>
          </div>
          <div className="fgrid">
            <div className="fcell fcell--wide">
              <label className="field__label" htmlFor="m-addr">{tr(C.address, lang)}</label>
              <input id="m-addr" className="input input--sm" type="email" autoComplete="off" value={address} onChange={(e) => { setAddress(e.target.value); setError(null); }} placeholder="equipo@gmail.com" />
            </div>
            <div className="fcell fcell--wide">
              <label className="field__label" htmlFor="m-pw">{tr(C.appPw, lang)}</label>
              <input id="m-pw" className="input input--sm is-mono" type="password" autoComplete="off" value={pw} onChange={(e) => { setPw(e.target.value); setError(null); }} placeholder="xxxx xxxx xxxx xxxx" />
              <span className="fhint">{tr(C.appPwHint, lang)}</span>
            </div>
          </div>
          {error && <div className="note note--error" role="alert"><span className="note__tag">ERR</span><span className="note__text">{tr(error === "forbidden" ? C.errForbidden : error === "empty" ? C.errEmpty : C.errConnect, lang)}</span></div>}
          <div className="card__foot">
            <button type="submit" className={"btn btn--primary btn--sm" + (busy ? " btn--busy" : "")} aria-busy={busy}>{busy && <span className="spinner" aria-hidden="true" />}{tr(busy ? C.connecting : C.connect, lang)}</button>
          </div>
          <details className="factors">
            <summary>{tr(C.howTitle, lang)}</summary>
            <ol style={{ margin: "10px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              {C.how.map((h, i) => <li key={i}>{tr(h, lang)}</li>)}
            </ol>
          </details>
        </form>
      )}
    </section>
  );
}

/* ---------- Bandeja ---------- */

function Inbox({ lang, isAdmin, status, onStatus, onOpenClient }: {
  lang: Lang; isAdmin: boolean; status: { address: string | null; last_sync: string | null }; onStatus: () => void; onOpenClient: (id: string) => void;
}) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [askBulk, setAskBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkErr, setBulkErr] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchThreads();
    setThreads(r.threads);
    // quitar de la selección lo que ya no existe
    setPicked((p) => new Set([...p].filter((id) => r.threads.some((t) => t.thread_id === id))));
  }, []);

  const togglePick = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function deletePicked() {
    if (bulkBusy || !threads) return;
    const ids = threads.filter((t) => picked.has(t.thread_id)).flatMap((t) => t.ids);
    if (!ids.length) return;
    setBulkBusy(true);
    setBulkErr(false);
    let okAll = true;
    for (let i = 0; i < ids.length; i += 400) {
      const r = await mailDelete(ids.slice(i, i + 400));
      if (!r.ok) okAll = false;
    }
    setBulkBusy(false);
    if (!okAll) setBulkErr(true);
    else setAskBulk(false);
    if (sel && picked.has(sel)) setSel(null);
    setPicked(new Set());
    await load();
    onStatus();
  }
  useEffect(() => {
    load();
  }, [load]);

  // El servidor sincroniza solo cada 2 minutos: refrescamos la lista cada minuto
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        load();
        onStatus();
      }
    }, 60_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // Primera sincronización si no hay nada
  useEffect(() => {
    if (threads && threads.length === 0 && !status.last_sync) void doSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads]);

  async function doSync() {
    if (syncing) return;
    setSyncing(true);
    setLeft(null);
    // Importa en lotes pequeños (la función tiene poca CPU por llamada) hasta traer TODO
    let fails = 0;
    for (let i = 0; i < 400; i++) {
      const r = await mailSync(5);
      if (!r.ok) {
        if (++fails >= 3) break;
        continue;
      }
      fails = 0;
      setLeft(r.pending ?? 0);
      if (i % 2 === 0 || !r.pending) await load();
      if (!r.pending || r.pending <= 0) break;
    }
    setSyncing(false);
    setLeft(null);
    await load();
    onStatus();
  }

  const filtered = (threads ?? []).filter((t) => {
    const n = q.trim().toLowerCase();
    return !n || t.subject.toLowerCase().includes(n) || t.party_email.toLowerCase().includes(n) || (t.cliente_nombre ?? "").toLowerCase().includes(n);
  });

  return (
    <section className="page-sec">
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">✉</span>{tr(C.eyebrow, lang)}</span>
          <h1 className="sec-title">{tr(C.title, lang)}</h1>
          <p className="sec-intro">{tr(C.connectedAs, lang)} <b>{status.address}</b> · {tr(C.lastSync, lang)}: {status.last_sync ? when(status.last_sync, lang) : tr(C.never, lang)}</p>
        </div>
        <div className="item-detail__actions">
          <button type="button" className={"btn btn--primary btn--sm" + (syncing ? " btn--busy" : "")} onClick={doSync} aria-busy={syncing}>{syncing && <span className="spinner" aria-hidden="true" />}{tr(syncing ? C.syncing : C.sync, lang)}{syncing && left ? " · " + left : ""}</button>
          {isAdmin && <button type="button" className="btn btn--ghost btn--sm" onClick={async () => { await mailDisconnect(); onStatus(); }}>{tr(C.disconnect, lang)}</button>}
        </div>
      </header>

      <div className="unibox">
        <div className={"unibox__list" + (sel ? " is-hidden-mobile" : "")}>
          <label className="search search--sm">
            <span className="sr-only">{tr(C.search, lang)}</span>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(C.search, lang)} className="search__input" />
          </label>
          {filtered.length > 0 && (
            <div className="selbar">
              <label className="selbar__all">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((t) => picked.has(t.thread_id))}
                  onChange={(e) => setPicked(e.target.checked ? new Set(filtered.map((t) => t.thread_id)) : new Set())}
                />
                {picked.size > 0 ? tr(C.nSelected(picked.size), lang) : tr(C.selectAll, lang)}
              </label>
              {picked.size > 0 && !askBulk && (
                <button type="button" className="chipbtn chipbtn--danger" onClick={() => { setAskBulk(true); setBulkErr(false); }}>{tr(C.delSelected, lang)}</button>
              )}
            </div>
          )}
          {askBulk && picked.size > 0 && (
            <div className="item__confirm">
              <span>{tr(C.delSelectedQ(picked.size), lang)}</span>
              <button type="button" className={"btn btn--danger btn--sm" + (bulkBusy ? " btn--busy" : "")} onClick={deletePicked} disabled={bulkBusy}>{tr(bulkBusy ? C.deleting : C.delYes, lang)}</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAskBulk(false)}>{tr(C.cancel, lang)}</button>
              {bulkErr && <span className="reply__err">{tr(C.delErr, lang)}</span>}
            </div>
          )}
          {threads === null ? (
            <div className="state">{tr(C.loading, lang)}</div>
          ) : filtered.length === 0 ? (
            <div className="state">{tr(C.noThreads, lang)}</div>
          ) : (
            <ul className="thread-list">
              {filtered.map((t) => (
                <li key={t.thread_id} className={"thread-li" + (picked.has(t.thread_id) ? " is-picked" : "")}>
                  <input
                    type="checkbox"
                    className="thread-li__check"
                    checked={picked.has(t.thread_id)}
                    onChange={() => togglePick(t.thread_id)}
                    aria-label={tr(C.selectOne, lang)}
                  />
                  <button type="button" className={"thread-row" + (sel === t.thread_id ? " is-active" : "") + (t.unseen ? " is-unseen" : "")} onClick={() => setSel(t.thread_id)}>
                    <div className="thread-row__top">
                      <span className="thread-row__who">{t.cliente_nombre || t.party_name || t.party_email}</span>
                      <span className="thread-row__when">{when(t.last.fecha, lang)}</span>
                    </div>
                    <span className="thread-row__subject">{t.subject}</span>
                    <span className="thread-row__snippet">{t.last.snippet}</span>
                    <div className="thread-row__tags">
                      {t.cliente_nombre && <span className="pill pill--accent">{t.cliente_nombre}</span>}
                      {t.unseen > 0 && <span className="pill pill--info">{t.unseen} {tr(C.unread, lang)}</span>}
                      {t.count > 1 && <span className="thread-row__count">{t.count}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={"unibox__view" + (sel ? "" : " is-empty")}>
          {sel ? (
            <ThreadView key={sel} lang={lang} threadId={sel} onBack={() => setSel(null)} onChanged={load} onOpenClient={onOpenClient} fromAddress={status.address ?? ""} />
          ) : (
            <div className="state state--empty"><span className="state__code">✉</span><p className="state__text">{tr(C.pickThread, lang)}</p></div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------- Un hilo ---------- */

function ThreadView({ lang, threadId, onBack, onChanged, onOpenClient, fromAddress }: {
  lang: Lang; threadId: string; onBack: () => void; onChanged: () => void; onOpenClient: (id: string) => void; fromAddress: string;
}) {
  const [msgs, setMsgs] = useState<Mensaje[] | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState(false);
  const [fwd, setFwd] = useState<Mensaje | null>(null);
  const [confirmDel, setConfirmDel] = useState<"thread" | string | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState(false);

  async function doDelete() {
    if (!msgs || !confirmDel || delBusy) return;
    const ids = confirmDel === "thread" ? msgs.map((m) => m.id) : [confirmDel];
    setDelBusy(true);
    setDelErr(false);
    const r = await mailDelete(ids);
    setDelBusy(false);
    if (!r.ok) return setDelErr(true);
    setConfirmDel(null);
    if (confirmDel === "thread" || ids.length >= msgs.length) {
      onChanged();
      onBack();
    } else {
      await load();
    }
  }

  const load = useCallback(async () => {
    const r = await fetchThread(threadId);
    setMsgs(r.mensajes);
    await markThreadSeen(threadId);
    onChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);
  useEffect(() => {
    load();
  }, [load]);

  if (msgs === null) return <div className="state">{tr(C.loading, lang)}</div>;
  if (msgs.length === 0) {
    return (
      <div className="thread">
        <div className="thread__head">
          <button type="button" className="backlink thread__back" onClick={onBack}>←</button>
          <div className="thread__headtext"><span className="thread__subject">—</span></div>
        </div>
        <div className="state">
          {tr(C.threadErr, lang)} <button type="button" className="linkbtn" onClick={load}>{tr(C.retry, lang)}</button>
        </div>
      </div>
    );
  }
  const head = msgs[0];
  const lastIn = [...msgs].reverse().find((m) => m.direction === "in") ?? msgs[msgs.length - 1];
  const cliente = msgs.find((m) => m.cliente_id);
  const party = lastIn.direction === "in" ? lastIn.from_email : lastIn.to_email;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (sending || !reply.trim()) return;
    setErr(false);
    setSending(true);
    const to = (lastIn.direction === "in" ? lastIn.from_email : lastIn.to_email) ?? "";
    const subj = (head.subject ?? "").replace(/^\s*re:\s*/i, "");
    const chain = [lastIn.referencias, lastIn.message_id].filter(Boolean).join(" ");
    const esc = reply.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const r = await mailSend({
      to, subject: "Re: " + subj, text: reply, html: "<div>" + esc.replace(/\n/g, "<br>") + "</div>",
      inReplyTo: lastIn.message_id ?? undefined, references: chain || undefined,
      threadId, clienteId: cliente?.cliente_id ?? undefined,
    });
    setSending(false);
    if (!r.ok) return setErr(true);
    setReply("");
    setSent(true);
    await load();
    setTimeout(() => setSent(false), 2500);
  }

  return (
    <div className="thread">
      <div className="thread__head">
        <button type="button" className="backlink thread__back" onClick={onBack}>←</button>
        <div className="thread__headtext">
          <span className="thread__subject">{head.subject || "(sin asunto)"}</span>
          <span className="thread__party">{party}</span>
        </div>
        {cliente?.cliente_id ? (
          <button type="button" className="pill pill--accent thread__client" onClick={() => onOpenClient(cliente.cliente_id!)}>{cliente.cliente?.nombre} · {tr(C.openClient, lang)} →</button>
        ) : (
          <span className="pill pill--muted">{tr(C.noClient, lang)}</span>
        )}
        <button type="button" className="iconbtn iconbtn--sm iconbtn--danger" onClick={() => { setConfirmDel("thread"); setDelErr(false); }} aria-label={tr(C.delThread, lang)} title={tr(C.delThread, lang)}>
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 4h10M6 4V3h4v1M5 4l.6 9h4.8L11 4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
        </button>
      </div>

      {confirmDel && (
        <div className="item__confirm thread__confirm">
          <span>{tr(confirmDel === "thread" ? C.delThreadQ : C.delMsgQ, lang)}</span>
          <button type="button" className={"btn btn--danger btn--sm" + (delBusy ? " btn--busy" : "")} onClick={doDelete} disabled={delBusy}>{tr(delBusy ? C.deleting : C.delYes, lang)}</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDel(null)}>{tr(C.cancel, lang)}</button>
          {delErr && <span className="reply__err">{tr(C.delErr, lang)}</span>}
        </div>
      )}

      <div className="thread__msgs">
        {msgs.map((m) => <Message key={m.id} m={m} lang={lang} mine={m.direction === "out"} fromAddress={fromAddress} onForward={() => setFwd(m)} onDelete={() => { setConfirmDel(m.id); setDelErr(false); }} />)}
      </div>

      {fwd && <ForwardModal lang={lang} original={fwd} clienteId={cliente?.cliente_id ?? undefined} onClose={() => setFwd(null)} onSent={() => { setFwd(null); load(); }} />}

      <form className="reply" onSubmit={send}>
        <textarea className="input reply__text" rows={3} value={reply} onChange={(e) => { setReply(e.target.value); setSent(false); }} placeholder={tr(C.replyPlaceholder, lang)} />
        <div className="reply__foot">
          {err && <span className="reply__err">{tr(C.sendErr, lang)}</span>}
          {sent && <span className="reply__ok">✓ {tr(C.sent, lang)}</span>}
          <span className="drawer__spacer" />
          <button type="submit" className={"btn btn--primary btn--sm" + (sending ? " btn--busy" : "")} disabled={!reply.trim()} aria-busy={sending}>{sending && <span className="spinner" aria-hidden="true" />}{tr(sending ? C.sending : C.send, lang)}</button>
        </div>
      </form>
    </div>
  );
}

function Message({ m, lang, mine, fromAddress, onForward, onDelete }: { m: Mensaje; lang: Lang; mine: boolean; fromAddress: string; onForward: () => void; onDelete: () => void }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const light = typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light";
  const ink = light ? "#1a1a1a" : "#e8e8e8";
  const quote = light ? "#666" : "#aaa";
  const link = light ? "#2b50c8" : "#8ea8ff";
  const html = m.body_html || (m.body_text ? "<pre style='white-space:pre-wrap;font-family:inherit'>" + m.body_text.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</pre>" : "<i>(sin contenido)</i>");
  // En modo oscuro el iframe debe declararse oscuro (si no, el navegador lo pinta blanco)
  // y se anulan los colores propios del correo para que todo se lea sobre negro.
  const darkFix = light
    ? ""
    : `body *{color:${ink}!important;background-color:transparent!important;border-color:#3a3a3a!important}body a,body a *{color:${link}!important}blockquote,blockquote *{color:${quote}!important}`;
  const doc = `<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="${light ? "light" : "dark"}"><base target="_blank"><style>:root{color-scheme:${light ? "light" : "dark"}}html,body{margin:0;padding:0;color:${ink};background:transparent;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;word-wrap:break-word;overflow-wrap:anywhere}a{color:${link}}img{max-width:100%;height:auto}blockquote{border-left:2px solid ${quote};margin:0;padding-left:12px;color:${quote}}*{max-width:100%}${darkFix}</style>${html}`;

  // El iframe crece hasta la altura real del correo y se reajusta cuando cargan las imágenes
  function fit() {
    try {
      const f = ref.current;
      const d = f?.contentDocument;
      if (f && d) f.style.height = Math.max(d.documentElement.scrollHeight, d.body?.scrollHeight ?? 0) + 4 + "px";
    } catch { /* opaco */ }
  }
  function onLoad() {
    fit();
    try {
      const d = ref.current?.contentDocument;
      if (!d) return;
      d.querySelectorAll("img").forEach((img) => img.addEventListener("load", fit));
      if (typeof ResizeObserver !== "undefined" && d.body) new ResizeObserver(fit).observe(d.body);
    } catch { /* opaco */ }
    setTimeout(fit, 300);
    setTimeout(fit, 1200);
  }

  return (
    <article className={"msg" + (mine ? " msg--mine" : "")}>
      <div className="msg__head">
        <span className="msg__from">{mine ? (lang === "es" ? "Tú" : "You") + " · " + fromAddress : m.from_name || m.from_email}</span>
        <span className="msg__when">{m.fecha ? new Date(m.fecha).toLocaleString(lang === "es" ? "es-ES" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</span>
        <button type="button" className="chipbtn msg__fwd" onClick={onForward} title={tr(C.forward, lang)}>↪ {tr(C.forward, lang)}</button>
        <button type="button" className="chipbtn chipbtn--danger msg__fwd" onClick={onDelete} title={tr(C.delMsg, lang)}>{tr(C.delMsg, lang)}</button>
      </div>
      <iframe ref={ref} className="msg__body" sandbox="allow-same-origin" srcDoc={doc} onLoad={onLoad} title={m.subject ?? "correo"} />
      {m.adjuntos.length > 0 && (
        <div className="msg__atts">
          <span className="msg__attk">{lang === "es" ? "Adjuntos" : "Attachments"}:</span>
          {m.adjuntos.map((a, i) => <span key={i} className="msg__att">📎 {a.filename} <small>{KB(a.size)}</small></span>)}
        </div>
      )}
    </article>
  );
}

function ForwardModal({ lang, original, clienteId, onClose, onSent }: {
  lang: Lang; original: Mensaje; clienteId?: string; onClose: () => void; onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<"to" | "send" | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    if (!to.trim()) return setErr("to");
    setErr(null);
    setSending(true);
    const subj = "Fwd: " + (original.subject ?? "").replace(/^\s*(re|fwd):\s*/i, "");
    const noteEsc = note.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
    const cab = `${lang === "es" ? "De" : "From"}: ${original.from_name || original.from_email || ""}<br>${lang === "es" ? "Asunto" : "Subject"}: ${original.subject ?? ""}<br>${lang === "es" ? "Fecha" : "Date"}: ${original.fecha ? new Date(original.fecha).toLocaleString() : ""}`;
    const html = `<div>${noteEsc}</div><hr><div style="color:#888;font-size:13px">---------- ${lang === "es" ? "Mensaje reenviado" : "Forwarded message"} ----------<br>${cab}</div><br>${original.body_html || (original.body_text ?? "")}`;
    const text = note + "\n\n---------- " + (lang === "es" ? "Mensaje reenviado" : "Forwarded message") + " ----------\n" + (original.body_text ?? "");
    const r = await mailSend({ to: to.trim(), subject: subj, html, text, clienteId });
    setSending(false);
    if (!r.ok) return setErr("send");
    onSent();
  }

  return (
    <div className="drawer" role="dialog" aria-modal="true">
      <div className="drawer__scrim" onClick={onClose} />
      <form className="drawer__panel" onSubmit={submit} noValidate>
        <div className="drawer__head">
          <div>
            <span className="sec-eyebrow"><span className="sec-eyebrow__code">✉</span>{tr(C.forward, lang)}</span>
            <h2 className="drawer__title">{tr(C.fwdTitle, lang)}</h2>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label={tr(C.close, lang)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="drawer__body">
          <div className="fgrid">
            <div className="fcell fcell--wide">
              <label className="field__label">{tr(C.fwdTo, lang)}</label>
              <input className="input input--sm" type="email" value={to} onChange={(e) => { setTo(e.target.value); setErr(null); }} placeholder="destinatario@correo.com" />
            </div>
            <div className="fcell fcell--wide">
              <label className="field__label">{tr(C.fwdNote, lang)}</label>
              <textarea className="input input--sm input--area" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              <span className="fhint">{tr(C.fwdOriginal, lang)} «{original.subject}»</span>
            </div>
          </div>
          {err && <div className="note note--error" role="alert"><span className="note__tag">ERR</span><span className="note__text">{tr(err === "to" ? C.fwdErrTo : C.sendErr, lang)}</span></div>}
        </div>
        <div className="drawer__foot">
          <span className="drawer__spacer" />
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tr(C.cancel, lang)}</button>
          <button type="submit" className={"btn btn--primary btn--sm" + (sending ? " btn--busy" : "")} aria-busy={sending}>{sending && <span className="spinner" aria-hidden="true" />}{tr(sending ? C.sending : C.send, lang)}</button>
        </div>
      </form>
    </div>
  );
}
