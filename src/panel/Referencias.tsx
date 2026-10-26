import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Lang } from "../i18n";
import { supabase } from "../auth";
import { moneyCur, num, text, tr, type Tr } from "./format";
import { Drawer, EstadoPill, OfferEditor } from "./sourcing";
import { ContactBtn, ContactDrawer } from "./contact";
import type { Oferta } from "./pedidos-data";

const C = {
  eyebrow: ["Catálogo", "Catalogue"] as Tr,
  title: ["Referencias", "Parts"] as Tr,
  intro: ["Cada chip que movemos. Entra en una para ver y asignar sus proveedores.", "Every chip we handle. Open one to see and assign its suppliers."] as Tr,
  newRef: ["Nueva referencia", "New part"] as Tr,
  search: ["Buscar MPN, fabricante…", "Search MPN, manufacturer…"] as Tr,
  count: (n: number): Tr => [n === 1 ? "1 referencia" : n + " referencias", n === 1 ? "1 part" : n + " parts"],
  loading: ["Cargando…", "Loading…"] as Tr,
  empty: ["Todavía no hay referencias.", "No parts yet."] as Tr,
  noMatch: ["Ninguna referencia coincide.", "No part matches."] as Tr,
  colMpn: ["MPN", "MPN"] as Tr,
  colMaker: ["Fabricante", "Manufacturer"] as Tr,
  colDesc: ["Descripción", "Description"] as Tr,
  colSup: ["Proveedores", "Suppliers"] as Tr,
  colClients: ["Clientes", "Clients"] as Tr,
  colBest: ["Mejor precio", "Best price"] as Tr,
  noSup: ["Sin proveedor", "No supplier"] as Tr,
  back: ["Referencias", "Parts"] as Tr,
  part: ["Referencia", "Part"] as Tr,
  edit: ["Editar", "Edit"] as Tr,
  del: ["Borrar", "Delete"] as Tr,
  yes: ["Sí, borrar", "Yes, delete"] as Tr,
  cancel: ["Cancelar", "Cancel"] as Tr,
  suppliers: ["Proveedores de esta referencia", "Suppliers for this part"] as Tr,
  assign: ["Asignar proveedor", "Assign supplier"] as Tr,
  none: ["Aún no tiene proveedores. Asigna uno para saber quién la vende.", "No suppliers yet. Assign one to know who sells it."] as Tr,
  colProv: ["Proveedor", "Supplier"] as Tr,
  colClient: ["Cliente", "Client"] as Tr,
  colPrice: ["Precio", "Price"] as Tr,
  colAvail: ["Disponibilidad y plazo", "Availability & lead time"] as Tr,
  colState: ["Estado", "Status"] as Tr,
  catalogue: ["Catálogo", "Catalogue"] as Tr,
  chosen: ["elegido", "chosen"] as Tr,
  // ficha
  fPkg: ["Encapsulado", "Package"] as Tr,
  fStock: ["Stock (uds.)", "Stock (units)"] as Tr,
  fLoc: ["Ubicación", "Location"] as Tr,
  fNotes: ["Notas", "Notes"] as Tr,
  save: ["Guardar", "Save"] as Tr,
  saving: ["Guardando…", "Saving…"] as Tr,
  errReq: ["Falta el MPN.", "The MPN is missing."] as Tr,
  errSave: ["No se pudo guardar (¿MPN repetido?).", "Could not save (duplicate MPN?)."] as Tr,
};

type Ref = {
  id: string; mpn: string; fabricante: string | null; descripcion: string | null; encapsulado: string | null;
  stock: number | null; ubicacion: string | null; notas: string | null;
};
type RefResumen = Ref & { ofertas: { id: string; proveedor_id: string | null; estado: string; precio: number | null; moneda: string; pedido: { cliente_id: string } | null }[] };
type OfertaFull = Oferta & {
  prov: { id: string; nombre: string; pais: string | null; email: string | null } | null;
  pedido: { id: string; cliente_id: string; unidades: string | null; cliente: { nombre: string } | null } | null;
};

const ORDER = ["oferta", "respondido", "contactado", "por_contactar", "descartado"];

export default function Referencias({ lang, isAdmin, openId, onOpen, onOpenProv, onOpenClient, onChanged }: {
  lang: Lang; isAdmin: boolean; openId: string | null; onOpen: (id: string | null) => void;
  onOpenProv: (id: string) => void; onOpenClient: (id: string) => void; onChanged: () => void;
}) {
  return openId && openId !== "nuevo" ? (
    <RefDetail key={openId} lang={lang} isAdmin={isAdmin} id={openId} onBack={() => onOpen(null)} onOpenProv={onOpenProv} onOpenClient={onOpenClient} onChanged={onChanged} />
  ) : (
    <RefList lang={lang} startNew={openId === "nuevo"} onOpen={onOpen} onChanged={onChanged} />
  );
}

function RefList({ lang, startNew, onOpen, onChanged }: { lang: Lang; startNew: boolean; onOpen: (id: string | null) => void; onChanged: () => void }) {
  const [rows, setRows] = useState<RefResumen[] | null>(null);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(startNew);

  const load = useCallback(async () => {
    const { data } = await supabase.from("referencias").select("*, ofertas(id, proveedor_id, estado, precio, moneda, pedido:pedidos(cliente_id))").order("mpn").limit(5000);
    setRows((data ?? []) as unknown as RefResumen[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !n || [r.mpn, r.fabricante, r.descripcion].some((v) => (v ?? "").toLowerCase().includes(n)));
  }, [rows, q]);

  return (
    <section className="page-sec">
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">02</span>{tr(C.eyebrow, lang)}</span>
          <h1 className="sec-title">{tr(C.title, lang)}</h1>
          <p className="sec-intro">{tr(C.intro, lang)}</p>
        </div>
        <button type="button" className="btn btn--primary btn--new" onClick={() => setCreating(true)}><span aria-hidden="true">+</span> {tr(C.newRef, lang)}</button>
      </header>

      <div className="toolbar">
        <label className="search">
          <span className="sr-only">{tr(C.search, lang)}</span>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(C.search, lang)} className="search__input" />
        </label>
        {rows && <span className="toolbar__count">{tr(C.count(filtered.length), lang)}</span>}
      </div>

      {rows === null ? (
        <div className="state">{tr(C.loading, lang)}</div>
      ) : rows.length === 0 ? (
        <div className="state state--empty"><span className="state__code">02</span><p className="state__text">{tr(C.empty, lang)}</p></div>
      ) : filtered.length === 0 ? (
        <div className="state">{tr(C.noMatch, lang)}</div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{tr(C.colMpn, lang)}</th>
                <th className="is-optional">{tr(C.colDesc, lang)}</th>
                <th>{tr(C.colSup, lang)}</th>
                <th className="is-optional">{tr(C.colClients, lang)}</th>
                <th className="is-right">{tr(C.colBest, lang)}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const live = r.ofertas.filter((o) => o.estado !== "descartado");
                const sups = new Set(live.map((o) => o.proveedor_id).filter(Boolean)).size;
                const clients = new Set(r.ofertas.map((o) => o.pedido?.cliente_id).filter(Boolean)).size;
                const priced = live.filter((o) => o.precio != null && o.moneda === "EUR").sort((a, b) => Number(a.precio) - Number(b.precio));
                const best = priced[0] ?? live.find((o) => o.precio != null);
                return (
                  <tr key={r.id} tabIndex={0} onClick={() => onOpen(r.id)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(r.id); }}>
                    <td data-label={tr(C.colMpn, lang)} className="is-strong">
                      <span className="ref-mpn">{r.mpn}</span>
                      <span className="ref-desc">{text(r.fabricante)}</span>
                    </td>
                    <td data-label={tr(C.colDesc, lang)} className="is-optional">{text(r.descripcion)}</td>
                    <td data-label={tr(C.colSup, lang)}>{sups ? num(sups, lang) : <span className="pill pill--warn">{tr(C.noSup, lang)}</span>}</td>
                    <td data-label={tr(C.colClients, lang)} className="is-optional">{clients ? num(clients, lang) : "—"}</td>
                    <td data-label={tr(C.colBest, lang)} className="is-right is-mono">{best ? moneyCur(best.precio, best.moneda, lang) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && <RefDrawer lang={lang} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); onChanged(); onOpen(id); }} />}
    </section>
  );
}

function RefDetail({ lang, isAdmin, id, onBack, onOpenProv, onOpenClient, onChanged }: {
  lang: Lang; isAdmin: boolean; id: string; onBack: () => void; onOpenProv: (id: string) => void; onOpenClient: (id: string) => void; onChanged: () => void;
}) {
  const [ref, setRef] = useState<Ref | null>(null);
  const [ofertas, setOfertas] = useState<OfertaFull[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [offer, setOffer] = useState<OfertaFull | "new" | null>(null);
  const [contact, setContact] = useState<OfertaFull | null>(null);
  const [askDel, setAskDel] = useState(false);

  const load = useCallback(async () => {
    const [r, o] = await Promise.all([
      supabase.from("referencias").select("*").eq("id", id).single(),
      supabase.from("ofertas").select("*, prov:proveedores(id, nombre, pais, email), pedido:pedidos(id, cliente_id, unidades, cliente:clientes(nombre))").eq("referencia_id", id).limit(2000),
    ]);
    setRef((r.data ?? null) as Ref | null);
    const list = ((o.data ?? []) as unknown as OfertaFull[]).sort((a, b) => ORDER.indexOf(a.estado) - ORDER.indexOf(b.estado) || (a.prov?.nombre ?? a.proveedor ?? "").localeCompare(b.prov?.nombre ?? b.proveedor ?? ""));
    setOfertas(list);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!ref || ofertas === null) return <div className="state" style={{ marginTop: 24 }}>{tr(C.loading, lang)}</div>;

  return (
    <section className="page-sec">
      <button type="button" className="backlink" onClick={onBack}>← {tr(C.back, lang)}</button>
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">02</span>{tr(C.part, lang)}{ref.fabricante ? " · " + ref.fabricante : ""}</span>
          <h1 className="sec-title is-mono">{ref.mpn}</h1>
          <p className="sec-intro">{[ref.descripcion, ref.encapsulado, ref.stock != null ? num(ref.stock, lang) + " uds." : null, ref.ubicacion].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="item-detail__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>{tr(C.edit, lang)}</button>
          {isAdmin && (askDel ? (
            <span className="delconfirm">
              <button type="button" className="btn btn--danger btn--sm" onClick={async () => { await supabase.from("referencias").delete().eq("id", id); onChanged(); onBack(); }}>{tr(C.yes, lang)}</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAskDel(false)}>{tr(C.cancel, lang)}</button>
            </span>
          ) : (
            <button type="button" className="btn btn--ghost btn--sm btn--del" onClick={() => setAskDel(true)}>{tr(C.del, lang)}</button>
          ))}
        </div>
      </header>
      {ref.notas && <p className="item__notes"><span className="note__tag">INT</span> {ref.notas}</p>}

      <div className="offers offers--card">
        <div className="offers__head">
          <span className="offers__title">{tr(C.suppliers, lang)} · {ofertas.length}</span>
          <button type="button" className="linkbtn" onClick={() => setOffer("new")}>+ {tr(C.assign, lang)}</button>
        </div>
        {ofertas.length === 0 ? (
          <p className="offers__empty">{tr(C.none, lang)}</p>
        ) : (
          <div className="table-wrap table-wrap--flat">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{tr(C.colProv, lang)}</th>
                  <th>{tr(C.colClient, lang)}</th>
                  <th className="is-right">{tr(C.colPrice, lang)}</th>
                  <th className="is-optional">{tr(C.colAvail, lang)}</th>
                  <th>{tr(C.colState, lang)}</th>
                  <th aria-label="✉" />
                </tr>
              </thead>
              <tbody>
                {ofertas.map((o) => {
                  const pname = o.prov?.nombre ?? o.proveedor ?? "—";
                  return (
                    <tr key={o.id} tabIndex={0} onClick={() => setOffer(o)} onKeyDown={(e) => { if (e.key === "Enter") setOffer(o); }} title={o.notas ?? ""}>
                      <td data-label={tr(C.colProv, lang)} className="is-strong">
                        {o.proveedor_id ? (
                          <button type="button" className="linkbtn" onClick={(e) => { e.stopPropagation(); onOpenProv(o.proveedor_id!); }}>{pname} →</button>
                        ) : pname}
                        <span className="ref-desc">{[o.prov?.pais ?? o.pais, o.elegida ? "★ " + tr(C.chosen, lang) : null, o.notas].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td data-label={tr(C.colClient, lang)}>
                        {o.pedido?.cliente ? (
                          <button type="button" className="linkbtn" onClick={(e) => { e.stopPropagation(); onOpenClient(o.pedido!.cliente_id); }}>{o.pedido.cliente.nombre}{o.pedido.unidades ? " · " + o.pedido.unidades : ""}</button>
                        ) : <span className="ref-desc">{tr(C.catalogue, lang)}</span>}
                      </td>
                      <td data-label={tr(C.colPrice, lang)} className="is-right is-mono">{moneyCur(o.precio, o.moneda, lang)}</td>
                      <td data-label={tr(C.colAvail, lang)} className="is-optional">{text(o.disponibilidad)}{o.plazo && <span className="ref-desc lead">⏱ {o.plazo}</span>}</td>
                      <td data-label={tr(C.colState, lang)}><EstadoPill estado={o.estado} lang={lang} /></td>
                      <td className="is-right"><ContactBtn lang={lang} onClick={() => setContact(o)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {contact && (
        <ContactDrawer lang={lang} part={{ mpn: ref.mpn, fabricante: ref.fabricante, descripcion: ref.descripcion, unidades: contact.pedido?.unidades }}
          target={{ ofertaId: contact.id, estado: contact.estado, proveedor: contact.prov?.nombre ?? contact.proveedor ?? "", email: contact.prov?.email ?? contact.email, pais: contact.prov?.pais ?? contact.pais }}
          onClose={() => setContact(null)} onSent={() => { setContact(null); load(); onChanged(); }} />
      )}
      {editing && <RefDrawer lang={lang} ref0={ref} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); onChanged(); }} />}
      {offer && (
        <OfferEditor lang={lang} referenciaId={id} oferta={offer === "new" ? null : offer}
          onClose={() => setOffer(null)} onSaved={() => { setOffer(null); load(); onChanged(); }} />
      )}
    </section>
  );
}

function RefDrawer({ lang, ref0, onClose, onSaved }: { lang: Lang; ref0?: Ref; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({
    mpn: ref0?.mpn ?? "", fabricante: ref0?.fabricante ?? "", descripcion: ref0?.descripcion ?? "", encapsulado: ref0?.encapsulado ?? "",
    stock: ref0?.stock != null ? String(ref0.stock) : "", ubicacion: ref0?.ubicacion ?? "", notas: ref0?.notas ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<"req" | "save" | null>(null);
  const set = (k: keyof typeof f, v: string) => { setF((s) => ({ ...s, [k]: v })); setErr(null); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!f.mpn.trim()) return setErr("req");
    setBusy(true);
    const stock = f.stock.trim() ? Number(f.stock.replace(/\./g, "").replace(",", ".")) : null;
    const row = {
      mpn: f.mpn.trim(), fabricante: f.fabricante.trim() || null, descripcion: f.descripcion.trim() || null,
      encapsulado: f.encapsulado.trim() || null, stock: stock != null && Number.isFinite(stock) ? Math.round(stock) : null,
      ubicacion: f.ubicacion.trim() || null, notas: f.notas.trim() || null,
    };
    const r = ref0
      ? await supabase.from("referencias").update(row).eq("id", ref0.id).select("id").single()
      : await supabase.from("referencias").insert(row).select("id").single();
    setBusy(false);
    if (r.error || !r.data) return setErr("save");
    onSaved((r.data as { id: string }).id);
  }

  const field = (k: keyof typeof f, label: Tr, opts: { wide?: boolean; mono?: boolean; mode?: "numeric" } = {}) => (
    <div className={"fcell" + (opts.wide ? " fcell--wide" : "")}>
      <label className="field__label">{tr(label, lang)}</label>
      <input className={"input input--sm" + (opts.mono ? " is-mono" : "")} inputMode={opts.mode} value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <form onSubmit={submit} noValidate>
      <Drawer lang={lang} eyebrow="02" title={ref0 ? ref0.mpn : tr(C.newRef, lang)} onClose={onClose}
        foot={<div className="drawer__foot"><span className="drawer__spacer" /><button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tr(C.cancel, lang)}</button><button type="submit" className={"btn btn--primary btn--sm" + (busy ? " btn--busy" : "")}>{busy && <span className="spinner" aria-hidden="true" />}{tr(busy ? C.saving : C.save, lang)}</button></div>}>
        <div className="drawer__body">
          <div className="fgrid">
            {field("mpn", C.colMpn, { mono: true })}
            {field("fabricante", C.colMaker)}
            {field("descripcion", C.colDesc, { wide: true })}
            {field("encapsulado", C.fPkg, { mono: true })}
            {field("stock", C.fStock, { mode: "numeric" })}
            {field("ubicacion", C.fLoc)}
            <div className="fcell fcell--wide">
              <label className="field__label">{tr(C.fNotes, lang)}</label>
              <textarea className="input input--sm input--area" rows={3} value={f.notas} onChange={(e) => set("notas", e.target.value)} />
            </div>
          </div>
          {err && <div className="note note--error" role="alert"><span className="note__tag">ERR</span><span className="note__text">{tr(err === "req" ? C.errReq : C.errSave, lang)}</span></div>}
        </div>
      </Drawer>
    </form>
  );
}
