// Piezas compartidas de sourcing: estados de oferta y el editor de ofertas
// (proveedor ↔ referencia ↔ pedido de un cliente). Se usa en Pedidos, Proveedores y Referencias.

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Lang } from "../i18n";
import { supabase } from "../auth";
import { pedidoCode, tr, type Tr } from "./format";
import { deleteOferta, saveOferta, type EstadoOferta, type Moneda, type Oferta } from "./pedidos-data";

export const ESTADOS_OFERTA: { value: EstadoOferta; label: Tr; tone: string }[] = [
  { value: "por_contactar", label: ["Por contactar", "To contact"], tone: "muted" },
  { value: "contactado", label: ["Esperando respuesta", "Awaiting reply"], tone: "info" },
  { value: "respondido", label: ["Respondido", "Replied"], tone: "warn" },
  { value: "oferta", label: ["Con oferta", "Quoted"], tone: "ok" },
  { value: "descartado", label: ["Descartado", "Discarded"], tone: "bad" },
];
export const MONEDAS: Moneda[] = ["EUR", "USD", "GBP", "JPY", "CNY"];

export function EstadoPill({ estado, lang }: { estado: string; lang: Lang }) {
  const e = ESTADOS_OFERTA.find((x) => x.value === estado) ?? ESTADOS_OFERTA[0];
  return <span className={"pill pill--" + e.tone}>{tr(e.label, lang)}</span>;
}

const C = {
  title: ["Proveedor de la referencia", "Supplier for the part"] as Tr,
  edit: ["Editar oferta", "Edit offer"] as Tr,
  ref: ["Referencia", "Part"] as Tr,
  pickRef: ["— Elige una referencia —", "— Pick a part —"] as Tr,
  pedido: ["Pedido del cliente (opcional)", "Client order (optional)"] as Tr,
  noPedido: ["— Sin pedido, solo catálogo —", "— No order, catalogue only —"] as Tr,
  supplier: ["Proveedor", "Supplier"] as Tr,
  newSupplier: ["— Proveedor nuevo —", "— New supplier —"] as Tr,
  name: ["Nombre del proveedor", "Supplier name"] as Tr,
  email: ["Correo", "Email"] as Tr,
  web: ["Web / enlace", "Website / link"] as Tr,
  country: ["País", "Country"] as Tr,
  estado: ["Estado", "Status"] as Tr,
  price: ["Precio por unidad", "Unit price"] as Tr,
  currency: ["Moneda", "Currency"] as Tr,
  avail: ["Disponibilidad / stock", "Availability / stock"] as Tr,
  chosen: ["Proveedor elegido para este pedido", "Chosen supplier for this order"] as Tr,
  notes: ["Observaciones", "Notes"] as Tr,
  save: ["Guardar", "Save"] as Tr,
  saving: ["Guardando…", "Saving…"] as Tr,
  cancel: ["Cancelar", "Cancel"] as Tr,
  close: ["Cerrar", "Close"] as Tr,
  del: ["Quitar", "Remove"] as Tr,
  delQ: ["¿Quitar este proveedor de la referencia?", "Remove this supplier from the part?"] as Tr,
  yes: ["Sí, quitar", "Yes, remove"] as Tr,
  errReq: ["Elige la referencia y el proveedor.", "Pick the part and the supplier."] as Tr,
  errSave: ["No se pudo guardar. Inténtalo de nuevo.", "Could not save. Try again."] as Tr,
};

export function Drawer({ title, eyebrow, lang, onClose, children, foot }: {
  title: string; eyebrow: string; lang: Lang; onClose: () => void; children: ReactNode; foot: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="drawer" role="dialog" aria-modal="true">
      <div className="drawer__scrim" onClick={onClose} />
      <div className="drawer__panel">
        <div className="drawer__head">
          <div>
            <span className="sec-eyebrow">{eyebrow}</span>
            <h2 className="drawer__title">{title}</h2>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label={tr(C.close, lang)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        {children}
        {foot}
      </div>
    </div>
  );
}

const numToForm = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
function toNum(s: string): number | null {
  const v = s.trim();
  if (!v) return null;
  const x = Number(v.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(x) ? x : NaN;
}

type Prov = { id: string; nombre: string; email: string | null; pais: string | null; web: string | null };
type Ref = { id: string; mpn: string; fabricante: string | null };
type Ped = { id: string; numero: number; referencia_id: string | null; unidades: string | null; cliente: { nombre: string } | null };

/**
 * Editor de una oferta. Lo que llega fijado (pedido, referencia o proveedor) no se pregunta.
 */
export function OfferEditor({ lang, oferta, pedidoId, referenciaId, proveedorId, onClose, onSaved }: {
  lang: Lang;
  oferta?: Oferta | null;
  pedidoId?: string | null;
  referenciaId?: string | null;
  proveedorId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [provs, setProvs] = useState<Prov[]>([]);
  const [refs, setRefs] = useState<Ref[]>([]);
  const [peds, setPeds] = useState<Ped[]>([]);
  const [refId, setRefId] = useState(oferta?.referencia_id ?? referenciaId ?? "");
  const [pedId, setPedId] = useState(oferta?.pedido_id ?? pedidoId ?? "");
  const [provId, setProvId] = useState(oferta?.proveedor_id ?? proveedorId ?? "");
  const [nombre, setNombre] = useState(oferta?.proveedor ?? "");
  const [email, setEmail] = useState(oferta?.email ?? "");
  const [web, setWeb] = useState(oferta?.enlace ?? "");
  const [pais, setPais] = useState(oferta?.pais ?? "");
  const [estado, setEstado] = useState<EstadoOferta>(oferta?.estado ?? "por_contactar");
  const [precio, setPrecio] = useState(numToForm(oferta?.precio));
  const [moneda, setMoneda] = useState<Moneda>(oferta?.moneda ?? "EUR");
  const [disp, setDisp] = useState(oferta?.disponibilidad ?? "");
  const [elegida, setElegida] = useState(oferta?.elegida ?? false);
  const [notas, setNotas] = useState(oferta?.notas ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<"req" | "save" | null>(null);
  const [askDel, setAskDel] = useState(false);

  const fixedPedido = !!pedidoId;
  const fixedRef = !!referenciaId || fixedPedido;
  const fixedProv = !!proveedorId;

  useEffect(() => {
    if (!fixedProv) supabase.from("proveedores").select("id, nombre, email, pais, web").order("nombre").limit(5000).then(({ data }) => setProvs((data ?? []) as Prov[]));
    if (!fixedRef) supabase.from("referencias").select("id, mpn, fabricante").order("mpn").limit(5000).then(({ data }) => setRefs((data ?? []) as Ref[]));
    if (!fixedPedido) supabase.from("pedidos").select("id, numero, referencia_id, unidades, cliente:clientes(nombre)").order("numero", { ascending: false }).limit(5000).then(({ data }) => setPeds((data ?? []) as unknown as Ped[]));
  }, [fixedProv, fixedRef, fixedPedido]);

  const pedsForRef = peds.filter((p) => !refId || p.referencia_id === refId);

  function pickProv(id: string) {
    setProvId(id === "__new" ? "" : id);
    setErr(null);
    const p = provs.find((x) => x.id === id);
    if (p) { setNombre(p.nombre); setEmail(p.email ?? ""); setPais(p.pais ?? ""); setWeb(p.web ?? ""); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const ref = referenciaId || refId || null;
    if (!fixedPedido && !ref) return setErr("req");
    if (!provId && !nombre.trim()) return setErr("req");
    const p = toNum(precio);
    if (Number.isNaN(p)) return setErr("req");
    setErr(null);
    setBusy(true);
    let snap = { nombre, email, web, pais };
    if (provId && (fixedProv || !nombre)) {
      const { data } = await supabase.from("proveedores").select("nombre, email, web, pais").eq("id", provId).single();
      if (data) snap = { nombre: data.nombre ?? "", email: data.email ?? "", web: data.web ?? "", pais: data.pais ?? "" };
    }
    const r = await saveOferta({
      pedido_id: (pedidoId || pedId || null) as string | null,
      referencia_id: ref,
      proveedor_id: provId || null,
      proveedor: snap.nombre, email: snap.email, enlace: snap.web, pais: snap.pais,
      estado, moneda, precio: p, disponibilidad: disp, elegida: elegida && !!(pedidoId || pedId), notas,
    }, oferta?.id);
    setBusy(false);
    if (!r.ok) return setErr("save");
    onSaved();
  }

  return (
    <form onSubmit={submit} noValidate>
      <Drawer lang={lang} eyebrow="◆" title={tr(oferta ? C.edit : C.title, lang)} onClose={onClose}
        foot={
          <div className="drawer__foot">
            {oferta && (askDel ? (
              <span className="delconfirm">
                {tr(C.delQ, lang)}
                <button type="button" className="btn btn--danger btn--sm" onClick={async () => { await deleteOferta(oferta.id); onSaved(); }}>{tr(C.yes, lang)}</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAskDel(false)}>{tr(C.cancel, lang)}</button>
              </span>
            ) : (
              <button type="button" className="btn btn--ghost btn--sm btn--del" onClick={() => setAskDel(true)}>{tr(C.del, lang)}</button>
            ))}
            <span className="drawer__spacer" />
            <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tr(C.cancel, lang)}</button>
            <button type="submit" className={"btn btn--primary btn--sm" + (busy ? " btn--busy" : "")} aria-busy={busy}>{busy && <span className="spinner" aria-hidden="true" />}{tr(busy ? C.saving : C.save, lang)}</button>
          </div>
        }>
        <div className="drawer__body">
          <div className="fgrid">
            {!fixedRef && (
              <div className="fcell fcell--wide">
                <label className="field__label">{tr(C.ref, lang)}<span className="req"> *</span></label>
                <select className="input input--sm is-mono" value={refId} onChange={(e) => { setRefId(e.target.value); setPedId(""); setErr(null); }}>
                  <option value="">{tr(C.pickRef, lang)}</option>
                  {refs.map((r) => <option key={r.id} value={r.id}>{r.mpn}{r.fabricante ? " · " + r.fabricante : ""}</option>)}
                </select>
              </div>
            )}
            {!fixedPedido && (
              <div className="fcell fcell--wide">
                <label className="field__label">{tr(C.pedido, lang)}</label>
                <select className="input input--sm" value={pedId} onChange={(e) => setPedId(e.target.value)}>
                  <option value="">{tr(C.noPedido, lang)}</option>
                  {pedsForRef.map((p) => <option key={p.id} value={p.id}>{pedidoCode(p.numero)} · {p.cliente?.nombre ?? "—"}{p.unidades ? " · " + p.unidades : ""}</option>)}
                </select>
              </div>
            )}
            {!fixedProv && (
              <>
                <div className="fcell fcell--wide">
                  <label className="field__label">{tr(C.supplier, lang)}<span className="req"> *</span></label>
                  <select className="input input--sm" value={provId || "__new"} onChange={(e) => pickProv(e.target.value)}>
                    <option value="__new">{tr(C.newSupplier, lang)}</option>
                    {provs.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                {!provId && (
                  <>
                    <div className="fcell"><label className="field__label">{tr(C.name, lang)}</label><input className="input input--sm" value={nombre} onChange={(e) => { setNombre(e.target.value); setErr(null); }} /></div>
                    <div className="fcell"><label className="field__label">{tr(C.country, lang)}</label><input className="input input--sm" value={pais} onChange={(e) => setPais(e.target.value)} /></div>
                    <div className="fcell"><label className="field__label">{tr(C.email, lang)}</label><input className="input input--sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                    <div className="fcell"><label className="field__label">{tr(C.web, lang)}</label><input className="input input--sm" value={web} onChange={(e) => setWeb(e.target.value)} placeholder="https://…" /></div>
                  </>
                )}
              </>
            )}
            <div className="fcell">
              <label className="field__label">{tr(C.estado, lang)}</label>
              <select className="input input--sm" value={estado} onChange={(e) => setEstado(e.target.value as EstadoOferta)}>
                {ESTADOS_OFERTA.map((s) => <option key={s.value} value={s.value}>{tr(s.label, lang)}</option>)}
              </select>
            </div>
            <div className="fcell">
              <label className="field__label">{tr(C.avail, lang)}</label>
              <input className="input input--sm" value={disp} onChange={(e) => setDisp(e.target.value)} placeholder="4.810 uds." />
            </div>
            <div className="fcell">
              <label className="field__label">{tr(C.price, lang)}</label>
              <input className="input input--sm" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0,00" />
            </div>
            <div className="fcell">
              <label className="field__label">{tr(C.currency, lang)}</label>
              <select className="input input--sm" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
                {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {(pedidoId || pedId) && (
              <div className="fcell fcell--wide">
                <button type="button" className="remember" role="checkbox" aria-checked={elegida} onClick={() => setElegida((v) => !v)}>
                  <span className="remember__box" aria-hidden="true">{elegida ? "✓" : ""}</span>{tr(C.chosen, lang)}
                </button>
              </div>
            )}
            <div className="fcell fcell--wide">
              <label className="field__label">{tr(C.notes, lang)}</label>
              <textarea className="input input--sm input--area" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </div>
          {err && <div className="note note--error" role="alert"><span className="note__tag">ERR</span><span className="note__text">{tr(err === "req" ? C.errReq : C.errSave, lang)}</span></div>}
        </div>
      </Drawer>
    </form>
  );
}
