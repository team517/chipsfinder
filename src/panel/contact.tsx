// "Contactar" a un proveedor: prepara el correo (plantilla al instante o IA), en español o inglés,
// con botón de traducir, y lo envía desde el Gmail conectado. Después la oferta pasa a "Contactado".

import { useEffect, useMemo, useState } from "react";
import type { Lang } from "../i18n";
import { supabase } from "../auth";
import { tr, type Tr } from "./format";
import { Drawer } from "./sourcing";
import { mailAi, mailSend } from "./mail-data";

type L = "es" | "en";
export type ContactPart = { mpn: string | null; fabricante?: string | null; descripcion?: string | null; unidades?: string | null };
export type ContactTarget = { ofertaId: string; estado: string; proveedor: string; email: string | null; pais: string | null };

const QUESTIONS: { key: string; label: Tr; es: string; en: string; on: boolean }[] = [
  { key: "stock", label: ["Stock", "Stock"], es: "Stock disponible (cantidad en almacén)", en: "Stock availability (quantity on hand)", on: true },
  { key: "lead", label: ["Plazo de entrega", "Lead time"], es: "Plazo de entrega (lead time)", en: "Lead time", on: true },
  { key: "price", label: ["Precio por unidad", "Unit price"], es: "Precio por unidad (y escalado por cantidad, si lo hay)", en: "Unit price (and price breaks, if any)", on: true },
  { key: "warranty", label: ["Garantía", "Warranty"], es: "Garantía y trazabilidad (origen del fabricante / canal autorizado, certificado de conformidad)", en: "Warranty and traceability (manufacturer origin / authorised channel, certificate of conformance)", on: true },
  { key: "datecode", label: ["Date code", "Date code"], es: "Date code y estado del material (nuevo, original, embalaje de fábrica)", en: "Date code and condition (new, original, factory packaging)", on: true },
  { key: "moq", label: ["MOQ", "MOQ"], es: "Cantidad mínima de pedido (MOQ)", en: "Minimum order quantity (MOQ)", on: false },
  { key: "terms", label: ["Condiciones", "Terms"], es: "Condiciones de pago, envío e Incoterms; validez de la oferta", en: "Payment and shipping terms, Incoterms and offer validity", on: false },
];

const C = {
  title: ["Contactar proveedor", "Contact supplier"] as Tr,
  to: ["Para", "To"] as Tr,
  subject: ["Asunto", "Subject"] as Tr,
  body: ["Mensaje", "Message"] as Tr,
  ask: ["Qué le preguntamos", "What we ask"] as Tr,
  lang: ["Idioma", "Language"] as Tr,
  ai: ["Redactar con IA", "Write with AI"] as Tr,
  aiBusy: ["Redactando…", "Writing…"] as Tr,
  translate: (to: L): Tr => [to === "en" ? "Traducir al inglés" : "Traducir al español", to === "en" ? "Translate to English" : "Translate to Spanish"],
  translating: ["Traduciendo…", "Translating…"] as Tr,
  send: ["Enviar correo", "Send email"] as Tr,
  sending: ["Enviando…", "Sending…"] as Tr,
  cancel: ["Cancelar", "Cancel"] as Tr,
  sent: ["Enviado. Queda como «Esperando respuesta».", "Sent. Now “Awaiting reply”."] as Tr,
  noKey: ["La IA aún no tiene clave configurada; uso la plantilla de ChipsFinder.", "AI has no key yet; using the ChipsFinder template."] as Tr,
  noKeyTr: ["Sin clave de IA: he rehecho el correo en el otro idioma con la plantilla (tus cambios a mano se pierden).", "No AI key: the email was rebuilt in the other language from the template (manual edits are lost)."] as Tr,
  aiErr: ["La IA no respondió. Inténtalo otra vez.", "AI did not respond. Try again."] as Tr,
  errTo: ["Falta el correo del proveedor.", "The supplier email is missing."] as Tr,
  errSend: ["No se pudo enviar. ¿Está conectado el Gmail en Unibox?", "Could not send. Is Gmail connected in Unibox?"] as Tr,
};

function signature(email: string, l: L) {
  const local = email.split("@")[0] ?? "";
  const name = !local || local === "team" ? (l === "es" ? "Equipo de compras" : "Sourcing Team") : local.replace(/[._-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  return `${name}\nChipsFinder\n${email || "team@chipsfinder.es"} · www.chipsfinder.es`;
}

function template(l: L, supplier: string, part: ContactPart, qs: string[], sig: string) {
  const lines = (arr: (string | null | false | undefined)[]) => arr.filter(Boolean).join("\n");
  const mpn = part.mpn ?? "—";
  const qtyShort = (part.unidades ?? "").trim();
  const details = lines([
    `• ${l === "es" ? "Referencia" : "Part number"}: ${mpn}`,
    part.fabricante && `• ${l === "es" ? "Fabricante" : "Manufacturer"}: ${part.fabricante}`,
    part.descripcion && part.descripcion !== mpn && !part.descripcion.startsWith(mpn + " (") && `• ${l === "es" ? "Descripción" : "Description"}: ${part.descripcion}`,
    qtyShort && `• ${l === "es" ? "Cantidad" : "Quantity"}: ${l === "es" ? qtyShort : qtyShort.replace(/uds?\./g, "pcs").replace(/mín\./g, "min.").replace(/ y /g, " / ")}`,
  ]);
  const asks = qs.map((q, i) => `${i + 1}. ${q}`).join("\n");
  if (l === "es") {
    return {
      subject: `Solicitud de oferta – ${mpn}${qtyShort ? " – " + qtyShort : ""}`,
      body: `Estimado equipo de ${supplier}:\n\nEspero que se encuentren bien. Estamos buscando el siguiente componente para uno de nuestros clientes y nos gustaría recibir su mejor oferta:\n\n${details}\n\n${asks ? "¿Podrían indicarnos, por favor?\n" + asks + "\n\n" : ""}Muchas gracias de antemano. Quedamos atentos a su respuesta.\n\nUn saludo,\n\n${sig}`,
    };
  }
  const qtyEn = qtyShort.replace(/uds?\./g, "pcs").replace(/mín\./g, "min.").replace(/ y /g, " / ");
  return {
    subject: `RFQ – ${mpn}${qtyEn ? " – " + qtyEn : ""}`,
    body: `Dear ${supplier} team,\n\nI hope you are doing well. We are currently sourcing the following part for one of our customers and would appreciate your best offer:\n\n${details}\n\n${asks ? "Could you please confirm:\n" + asks + "\n\n" : ""}Thank you in advance. We look forward to hearing from you.\n\nBest regards,\n\n${sig}`,
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toHtml = (text: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1f2328">${text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;

export function ContactDrawer({ lang, target, part, onClose, onSent }: {
  lang: Lang; target: ContactTarget; part: ContactPart; onClose: () => void; onSent: () => void;
}) {
  const [l, setL] = useState<L>(/espa/i.test(target.pais ?? "") ? "es" : "en");
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(QUESTIONS.map((q) => [q.key, q.on])));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(target.email ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [auto, setAuto] = useState(true); // el texto sigue siendo la plantilla (sin tocar a mano)
  const [busy, setBusy] = useState<null | "ai" | "tr" | "send">(null);
  const [note, setNote] = useState<{ tone: "info" | "error" | "ok"; text: Tr } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setFrom(data.session?.user.email ?? ""));
  }, []);

  const qs = useMemo(() => QUESTIONS.filter((q) => on[q.key]), [on]);
  const build = (lng: L) => template(lng, target.proveedor, part, qs.map((q) => q[lng]), signature(from, lng));

  // Mientras no se edite a mano, la plantilla se rehace al cambiar idioma o preguntas
  useEffect(() => {
    if (!auto) return;
    const t = build(l);
    setSubject(t.subject);
    setBody(t.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, l, qs, from]);

  async function writeAi() {
    setBusy("ai"); setNote(null);
    const r = await mailAi({
      task: "rfq", lang: l, supplier: target.proveedor,
      part: { part_number: part.mpn, manufacturer: part.fabricante, description: part.descripcion, quantity: part.unidades },
      questions: qs.map((q) => q[l]), signature: signature(from, l),
    });
    setBusy(null);
    if (r.ok) { setSubject(r.subject || subject); setBody(r.body); setAuto(false); }
    else setNote({ tone: r.error === "no_key" ? "info" : "error", text: r.error === "no_key" ? C.noKey : C.aiErr });
  }

  async function translate() {
    const next: L = l === "es" ? "en" : "es";
    if (auto) { setL(next); return; }
    setBusy("tr"); setNote(null);
    const r = await mailAi({ task: "translate", lang: next, subject, body });
    setBusy(null);
    if (r.ok) { setSubject(r.subject || subject); setBody(r.body); setL(next); return; }
    if (r.error === "no_key") { setL(next); setAuto(true); setNote({ tone: "info", text: C.noKeyTr }); return; }
    setNote({ tone: "error", text: C.aiErr });
  }

  async function send() {
    if (busy) return;
    if (!to.trim()) return setNote({ tone: "error", text: C.errTo });
    setBusy("send"); setNote(null);
    const r = await mailSend({ to: to.trim(), subject, html: toHtml(body), text: body });
    if (!r.ok) { setBusy(null); return setNote({ tone: "error", text: C.errSend }); }
    if (target.estado === "por_contactar" || target.estado === "contactado") await supabase.from("ofertas").update({ estado: "contactado" }).eq("id", target.ofertaId);
    setBusy(null);
    setNote({ tone: "ok", text: C.sent });
    setTimeout(onSent, 900);
  }

  return (
    <Drawer lang={lang} eyebrow={"✉ " + (part.mpn ?? "")} title={tr(C.title, lang) + " · " + target.proveedor} onClose={onClose}
      foot={
        <div className="drawer__foot">
          <span className="drawer__spacer" />
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tr(C.cancel, lang)}</button>
          <button type="button" className={"btn btn--primary btn--sm" + (busy === "send" ? " btn--busy" : "")} onClick={send} disabled={!!busy}>
            {busy === "send" && <span className="spinner" aria-hidden="true" />}{tr(busy === "send" ? C.sending : C.send, lang)}
          </button>
        </div>
      }>
      <div className="drawer__body">
        <div className="fgrid">
          <div className="fcell fcell--wide">
            <label className="field__label">{tr(C.to, lang)}</label>
            <input className="input input--sm" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="sales@…" />
          </div>
          <div className="fcell fcell--wide">
            <label className="field__label">{tr(C.ask, lang)}</label>
            <div className="qchips">
              {QUESTIONS.map((q) => (
                <button key={q.key} type="button" className={"qchip" + (on[q.key] ? " is-on" : "")} aria-pressed={on[q.key]}
                  onClick={() => setOn((s) => ({ ...s, [q.key]: !s[q.key] }))}>{on[q.key] ? "✓ " : "+ "}{tr(q.label, lang)}</button>
              ))}
            </div>
          </div>
          <div className="fcell fcell--wide contact-tools">
            <div className="langs langs--sm" role="group" aria-label={tr(C.lang, lang)}>
              {(["es", "en"] as const).map((code) => (
                <button key={code} type="button" className="langs__btn" aria-pressed={l === code} disabled={!!busy}
                  onClick={() => { if (code === l) return; if (auto) setL(code); else translate(); }}>{code}</button>
              ))}
            </div>
            <button type="button" className="chipbtn" onClick={translate} disabled={!!busy}>⇄ {tr(busy === "tr" ? C.translating : C.translate(l === "es" ? "en" : "es"), lang)}</button>
            <button type="button" className="chipbtn" onClick={writeAi} disabled={!!busy}>✦ {tr(busy === "ai" ? C.aiBusy : C.ai, lang)}</button>
          </div>
          <div className="fcell fcell--wide">
            <label className="field__label">{tr(C.subject, lang)}</label>
            <input className="input input--sm" value={subject} onChange={(e) => { setSubject(e.target.value); setAuto(false); }} />
          </div>
          <div className="fcell fcell--wide">
            <label className="field__label">{tr(C.body, lang)}</label>
            <textarea className="input input--sm input--area contact-body" rows={18} value={body} onChange={(e) => { setBody(e.target.value); setAuto(false); }} />
          </div>
        </div>
        {note && (
          <div className={"note" + (note.tone === "error" ? " note--error" : note.tone === "ok" ? " note--ok" : "")} role="status">
            <span className="note__tag">{note.tone === "error" ? "ERR" : note.tone === "ok" ? "OK" : "INFO"}</span>
            <span className="note__text">{tr(note.text, lang)}</span>
          </div>
        )}
      </div>
    </Drawer>
  );
}

/** Botón pequeño "Contactar" para las filas de proveedores. */
export function ContactBtn({ lang, onClick }: { lang: Lang; onClick: () => void }) {
  return (
    <button type="button" className="chipbtn chipbtn--contact" onClick={(e) => { e.stopPropagation(); onClick(); }}>
      ✉ {lang === "es" ? "Contactar" : "Contact"}
    </button>
  );
}
