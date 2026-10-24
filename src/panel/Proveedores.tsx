import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Lang } from "../i18n";
import { supabase } from "../auth";
import { moneyCur, num, text, tr, type Tr } from "./format";
import { Drawer, EstadoPill, OfferEditor } from "./sourcing";
import type { Oferta } from "./pedidos-data";

const C = {
  eyebrow: ["Red de suministro", "Supply network"] as Tr,
  title: ["Proveedores", "Suppliers"] as Tr,
  intro: ["Empresas que nos venden componentes. Entra en una para ver sus datos y qué chips nos ofrece.", "Companies that sell us components. Open one to see their details and which chips they offer."] as Tr,
  newSup: ["Nuevo proveedor", "New supplier"] as Tr,
  search: ["Buscar proveedor…", "Search supplier…"] as Tr,
  count: (n: number): Tr => [n === 1 ? "1 proveedor" : n + " proveedores", n === 1 ? "1 supplier" : n + " suppliers"],
  loading: ["Cargando…", "Loading…"] as Tr,
  empty: ["Todavía no hay proveedores.", "No suppliers yet."] as Tr,
  noMatch: ["Ningún proveedor coincide.", "No supplier matches."] as Tr,
  refs: ["ref.", "parts"] as Tr,
  clients: ["clientes", "clients"] as Tr,
  replied: ["respondidos", "replied"] as Tr,
  back: ["Proveedores", "Suppliers"] as Tr,
  supplier: ["Proveedor", "Supplier"] as Tr,
  edit: ["Editar", "Edit"] as Tr,
  del: ["Borrar", "Delete"] as Tr,
  delQ: ["¿Borrar este proveedor y sus ofertas?", "Delete this supplier and its offers?"] as Tr,
  yes: ["Sí, borrar", "Yes, delete"] as Tr,
  cancel: ["Cancelar", "Cancel"] as Tr,
  write: ["Escribir", "Email"] as Tr,
  open: ["Abrir web", "Open site"] as Tr,
  chips: ["Chips que ofrece", "Chips they offer"] as Tr,
  assign: ["Asignar referencia", "Assign part"] as Tr,
  noChips: ["Este proveedor aún no tiene referencias asignadas.", "This supplier has no parts assigned yet."] as Tr,
  colRef: ["Referencia", "Part"] as Tr,
  colClient: ["Cliente", "Client"] as Tr,
  colUnits: ["Unidades", "Units"] as Tr,
  colPrice: ["Precio", "Price"] as Tr,
  colAvail: ["Disponibilidad", "Availability"] as Tr,
  colState: ["Estado", "Status"] as Tr,
  colNotes: ["Observaciones", "Notes"] as Tr,
  catalogue: ["Catálogo", "Catalogue"] as Tr,
  goClient: ["Ver pedido", "View order"] as Tr,
  // ficha
  fName: ["Nombre", "Name"] as Tr,
  fType: ["Tipo", "Type"] as Tr,
  fCountry: ["País", "Country"] as Tr,
  fContact: ["Persona de contacto", "Contact person"] as Tr,
  fEmail: ["Correo", "Email"] as Tr,
  fPhone: ["Teléfono", "Phone"] as Tr,
  fWeb: ["Web", "Website"] as Tr,
  fRating: ["Valoración", "Rating"] as Tr,
  fNotes: ["Notas", "Notes"] as Tr,
  save: ["Guardar", "Save"] as Tr,
  saving: ["Guardando…", "Saving…"] as Tr,
  errReq: ["Falta el nombre.", "The name is missing."] as Tr,
  errSave: ["No se pudo guardar.", "Could not save."] as Tr,
};

const TIPOS: { value: string; label: Tr }[] = [
  { value: "fabricante", label: ["Fabricante", "Manufacturer"] },
  { value: "distribuidor", label: ["Distribuidor", "Distributor"] },
  { value: "broker", label: ["Broker", "Broker"] },
];
const tipoLabel = (v: string, lang: Lang) => tr(TIPOS.find((t) => t.value === v)?.label ?? [v, v], lang);
const webHref = (w: string) => (w.startsWith("http") ? w : "https://" + w);

type Prov = {
  id: string; nombre: string; tipo: string; pais: string | null; contacto: string | null; email: string | null;
  telefono: string | null; web: string | null; valoracion: number | null; notas: string | null;
};
type ProvResumen = Prov & { ofertas: { id: string; estado: string; referencia_id: string | null; pedido: { cliente_id: string } | null }[] };
type OfertaFull = Oferta & {
  referencia: { id: string; mpn: string; fabricante: string | null; descripcion: string | null } | null;
  pedido: { id: string; cliente_id: string; unidades: string | null; cliente: { nombre: string } | null } | null;
};

export default function Proveedores({ lang, isAdmin, openId, onOpen, onOpenClient, onChanged }: {
  lang: Lang; isAdmin: boolean; openId: string | null; onOpen: (id: string | null) => void; onOpenClient: (id: string) => void; onChanged: () => void;
}) {
  return openId && openId !== "nuevo" ? (
    <ProvDetail key={openId} lang={lang} isAdmin={isAdmin} id={openId} onBack={() => onOpen(null)} onOpenClient={onOpenClient} onChanged={onChanged} />
  ) : (
    <ProvGrid lang={lang} startNew={openId === "nuevo"} onOpen={onOpen} onChanged={onChanged} />
  );
}

function ProvGrid({ lang, startNew, onOpen, onChanged }: { lang: Lang; startNew: boolean; onOpen: (id: string | null) => void; onChanged: () => void }) {
  const [rows, setRows] = useState<ProvResumen[] | null>(null);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(startNew);

  const load = useCallback(async () => {
    const { data } = await supabase.from("proveedores").select("*, ofertas(id, estado, referencia_id, pedido:pedidos(cliente_id))").order("nombre").limit(5000);
    setRows((data ?? []) as unknown as ProvResumen[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !n || [r.nombre, r.email, r.pais, r.contacto].some((v) => (v ?? "").toLowerCase().includes(n)));
  }, [rows, q]);

  return (
    <section className="page-sec">
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">03</span>{tr(C.eyebrow, lang)}</span>
          <h1 className="sec-title">{tr(C.title, lang)}</h1>
          <p className="sec-intro">{tr(C.intro, lang)}</p>
        </div>
        <button type="button" className="btn btn--primary btn--new" onClick={() => setCreating(true)}><span aria-hidden="true">+</span> {tr(C.newSup, lang)}</button>
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
        <div className="state state--empty"><span className="state__code">03</span><p className="state__text">{tr(C.empty, lang)}</p></div>
      ) : filtered.length === 0 ? (
        <div className="state">{tr(C.noMatch, lang)}</div>
      ) : (
        <div className="client-grid">
          {filtered.map((p) => {
            const refs = new Set(p.ofertas.map((o) => o.referencia_id).filter(Boolean)).size;
            const clients = new Set(p.ofertas.map((o) => o.pedido?.cliente_id).filter(Boolean)).size;
            const replied = p.ofertas.filter((o) => o.estado === "respondido" || o.estado === "oferta").length;
            return (
              <button key={p.id} type="button" className="client-card" onClick={() => onOpen(p.id)}>
                <div className="client-card__top">
                  <span className="client-card__avatar" aria-hidden="true">{p.nombre.slice(0, 1).toUpperCase()}</span>
                  <span className="client-card__name">{p.nombre}</span>
                  <span className="pill pill--muted">{tipoLabel(p.tipo, lang)}</span>
                </div>
                <span className="client-card__meta">{[p.pais, p.email, p.contacto].filter(Boolean).join(" · ") || "—"}</span>
                <div className="client-card__stats">
                  <span className="cstat"><b>{num(refs, lang)}</b> {tr(C.refs, lang)}</span>
                  <span className="cstat"><b>{num(clients, lang)}</b> {tr(C.clients, lang)}</span>
                  {replied > 0 && <span className="cstat cstat--open"><b>{num(replied, lang)}</b> {tr(C.replied, lang)}</span>}
                  <span className="client-card__arrow" aria-hidden="true">→</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {creating && <ProvDrawer lang={lang} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); onChanged(); onOpen(id); }} />}
    </section>
  );
}

function ProvDetail({ lang, isAdmin, id, onBack, onOpenClient, onChanged }: {
  lang: Lang; isAdmin: boolean; id: string; onBack: () => void; onOpenClient: (id: string) => void; onChanged: () => void;
}) {
  const [prov, setProv] = useState<Prov | null>(null);
  const [ofertas, setOfertas] = useState<OfertaFull[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [offer, setOffer] = useState<OfertaFull | "new" | null>(null);
  const [askDel, setAskDel] = useState(false);

  const load = useCallback(async () => {
    const [p, o] = await Promise.all([
      supabase.from("proveedores").select("*").eq("id", id).single(),
      supabase.from("ofertas").select("*, referencia:referencias(id, mpn, fabricante, descripcion), pedido:pedidos(id, cliente_id, unidades, cliente:clientes(nombre))").eq("proveedor_id", id).limit(2000),
    ]);
    setProv((p.data ?? null) as Prov | null);
    const list = ((o.data ?? []) as unknown as OfertaFull[]).sort((a, b) => (a.referencia?.mpn ?? "").localeCompare(b.referencia?.mpn ?? ""));
    setOfertas(list);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!prov || ofertas === null) return <div className="state" style={{ marginTop: 24 }}>{tr(C.loading, lang)}</div>;

  return (
    <section className="page-sec">
      <button type="button" className="backlink" onClick={onBack}>← {tr(C.back, lang)}</button>
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">03</span>{tr(C.supplier, lang)} · {tipoLabel(prov.tipo, lang)}</span>
          <h1 className="sec-title">{prov.nombre}</h1>
          <p className="sec-intro">{[prov.pais, prov.contacto].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="item-detail__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>{tr(C.edit, lang)}</button>
          {isAdmin && (askDel ? (
            <span className="delconfirm">
              <button type="button" className="btn btn--danger btn--sm" onClick={async () => { await supabase.from("proveedores").delete().eq("id", id); onChanged(); onBack(); }}>{tr(C.yes, lang)}</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAskDel(false)}>{tr(C.cancel, lang)}</button>
            </span>
          ) : (
            <button type="button" className="btn btn--ghost btn--sm btn--del" onClick={() => setAskDel(true)}>{tr(C.del, lang)}</button>
          ))}
        </div>
      </header>

      <div className="contact-strip">
        {prov.email ? <a className="contact-chip" href={"mailto:" + prov.email}>✉ {prov.email}</a> : <span className="contact-chip is-empty">✉ —</span>}
        {prov.web && <a className="contact-chip" href={webHref(prov.web)} target="_blank" rel="noopener noreferrer">↗ {prov.web.replace(/^https?:\/\//, "")}</a>}
        {prov.telefono && <a className="contact-chip" href={"tel:" + prov.telefono}>☎ {prov.telefono}</a>}
        {prov.valoracion && <span className="contact-chip">{"●".repeat(prov.valoracion)}{"○".repeat(5 - prov.valoracion)}</span>}
      </div>
      {prov.notas && <p className="item__notes"><span className="note__tag">INT</span> {prov.notas}</p>}

      <div className="offers offers--card">
        <div className="offers__head">
          <span className="offers__title">{tr(C.chips, lang)} · {ofertas.length}</span>
          <button type="button" className="linkbtn" onClick={() => setOffer("new")}>+ {tr(C.assign, lang)}</button>
        </div>
        {ofertas.length === 0 ? (
          <p className="offers__empty">{tr(C.noChips, lang)}</p>
        ) : (
          <div className="table-wrap table-wrap--flat">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{tr(C.colRef, lang)}</th>
                  <th>{tr(C.colClient, lang)}</th>
                  <th className="is-optional">{tr(C.colUnits, lang)}</th>
                  <th className="is-right">{tr(C.colPrice, lang)}</th>
                  <th className="is-optional">{tr(C.colAvail, lang)}</th>
                  <th>{tr(C.colState, lang)}</th>
                </tr>
              </thead>
              <tbody>
                {ofertas.map((o) => (
                  <tr key={o.id} tabIndex={0} onClick={() => setOffer(o)} onKeyDown={(e) => { if (e.key === "Enter") setOffer(o); }} title={o.notas ?? ""}>
                    <td data-label={tr(C.colRef, lang)} className="is-strong">
                      <span className="ref-mpn">{text(o.referencia?.mpn)}</span>
                      <span className="ref-desc">{[o.referencia?.fabricante, o.notas].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td data-label={tr(C.colClient, lang)}>
                      {o.pedido?.cliente ? (
                        <button type="button" className="linkbtn" onClick={(e) => { e.stopPropagation(); onOpenClient(o.pedido!.cliente_id); }}>{o.pedido.cliente.nombre} →</button>
                      ) : <span className="ref-desc">{tr(C.catalogue, lang)}</span>}
                    </td>
                    <td data-label={tr(C.colUnits, lang)} className="is-optional">{text(o.pedido?.unidades)}</td>
                    <td data-label={tr(C.colPrice, lang)} className="is-right is-mono">{moneyCur(o.precio, o.moneda, lang)}</td>
                    <td data-label={tr(C.colAvail, lang)} className="is-optional">{text(o.disponibilidad)}</td>
                    <td data-label={tr(C.colState, lang)}><EstadoPill estado={o.estado} lang={lang} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <ProvDrawer lang={lang} prov={prov} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); onChanged(); }} />}
      {offer && (
        <OfferEditor lang={lang} proveedorId={id} oferta={offer === "new" ? null : offer}
          onClose={() => setOffer(null)} onSaved={() => { setOffer(null); load(); onChanged(); }} />
      )}
    </section>
  );
}

function ProvDrawer({ lang, prov, onClose, onSaved }: { lang: Lang; prov?: Prov; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({
    nombre: prov?.nombre ?? "", tipo: prov?.tipo ?? "distribuidor", pais: prov?.pais ?? "", contacto: prov?.contacto ?? "",
    email: prov?.email ?? "", telefono: prov?.telefono ?? "", web: prov?.web ?? "", valoracion: prov?.valoracion ? String(prov.valoracion) : "", notas: prov?.notas ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<"req" | "save" | null>(null);
  const set = (k: keyof typeof f, v: string) => { setF((s) => ({ ...s, [k]: v })); setErr(null); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!f.nombre.trim()) return setErr("req");
    setBusy(true);
    const row = {
      nombre: f.nombre.trim(), tipo: f.tipo, pais: f.pais.trim() || null, contacto: f.contacto.trim() || null,
      email: f.email.trim() || null, telefono: f.telefono.trim() || null, web: f.web.trim() || null,
      valoracion: f.valoracion ? Number(f.valoracion) : null, notas: f.notas.trim() || null,
    };
    const r = prov
      ? await supabase.from("proveedores").update(row).eq("id", prov.id).select("id").single()
      : await supabase.from("proveedores").insert(row).select("id").single();
    setBusy(false);
    if (r.error || !r.data) return setErr("save");
    onSaved((r.data as { id: string }).id);
  }

  const field = (k: keyof typeof f, label: Tr, opts: { type?: string; wide?: boolean } = {}) => (
    <div className={"fcell" + (opts.wide ? " fcell--wide" : "")}>
      <label className="field__label">{tr(label, lang)}</label>
      <input className="input input--sm" type={opts.type ?? "text"} value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <form onSubmit={submit} noValidate>
      <Drawer lang={lang} eyebrow="03" title={prov ? prov.nombre : tr(C.newSup, lang)} onClose={onClose}
        foot={<div className="drawer__foot"><span className="drawer__spacer" /><button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tr(C.cancel, lang)}</button><button type="submit" className={"btn btn--primary btn--sm" + (busy ? " btn--busy" : "")}>{busy && <span className="spinner" aria-hidden="true" />}{tr(busy ? C.saving : C.save, lang)}</button></div>}>
        <div className="drawer__body">
          <div className="fgrid">
            {field("nombre", C.fName, { wide: true })}
            <div className="fcell">
              <label className="field__label">{tr(C.fType, lang)}</label>
              <select className="input input--sm" value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>{TIPOS.map((t) => <option key={t.value} value={t.value}>{tr(t.label, lang)}</option>)}</select>
            </div>
            {field("pais", C.fCountry)}
            {field("contacto", C.fContact)}
            {field("telefono", C.fPhone, { type: "tel" })}
            {field("email", C.fEmail, { type: "email", wide: true })}
            {field("web", C.fWeb, { wide: true })}
            <div className="fcell">
              <label className="field__label">{tr(C.fRating, lang)}</label>
              <select className="input input--sm" value={f.valoracion} onChange={(e) => set("valoracion", e.target.value)}>
                <option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"●".repeat(n)}</option>)}
              </select>
            </div>
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
