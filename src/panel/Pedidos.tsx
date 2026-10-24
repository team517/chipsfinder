import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Lang } from "../i18n";
import { supabase } from "../auth";
import { PEDIDO_ESTADOS } from "./entities";
import { StatusPill } from "./EntityPage";
import { money, num, text, tr, type Tr } from "./format";
import {
  clienteNuevo,
  deleteOferta,
  deletePedido,
  fetchCliente,
  fetchClientesConPedidos,
  savePedido,
  saveOferta,
  setElegida,
  type Cliente,
  type ClienteResumen,
  type Oferta,
  type OfertaInput,
  type Pedido,
  type PedidoInput,
} from "./pedidos-data";

const C = {
  eyebrow: ["Pedidos entrantes", "Incoming orders"] as Tr,
  title: ["Pedidos", "Orders"] as Tr,
  intro: [
    "Cada cliente y lo que te ha pedido. Entra en uno para ver sus artículos, precios y proveedores.",
    "Each client and what they asked for. Open one to see their items, prices and suppliers.",
  ] as Tr,
  newOrder: ["Nuevo pedido", "New order"] as Tr,
  newItem: ["Nuevo artículo", "New item"] as Tr,
  search: ["Buscar cliente…", "Search client…"] as Tr,
  clients: (n: number): Tr => [n === 1 ? "1 cliente" : n + " clientes", n === 1 ? "1 client" : n + " clients"],
  loading: ["Cargando…", "Loading…"] as Tr,
  loadErr: ["No se pudo cargar.", "Could not load."] as Tr,
  retry: ["Reintentar", "Retry"] as Tr,
  empty: ["Todavía no hay pedidos. Crea el primero.", "No orders yet. Create the first one."] as Tr,
  noMatch: ["Ningún cliente coincide.", "No client matches."] as Tr,
  items: (n: number): Tr => [n === 1 ? "1 artículo" : n + " artículos", n === 1 ? "1 item" : n + " items"],
  offersN: (n: number): Tr => [n === 1 ? "1 oferta" : n + " ofertas", n === 1 ? "1 offer" : n + " offers"],
  openN: (n: number): Tr => [n + " abiertos", n + " open"],
  back: ["Pedidos", "Orders"] as Tr,
  client: ["Cliente", "Client"] as Tr,
  // Detalle artículo
  target: ["Objetivo cliente", "Client target"] as Tr,
  ourPrice: ["Precio que damos", "Our price"] as Tr,
  units: ["Unidades", "Units"] as Tr,
  margin: ["Margen", "Margin"] as Tr,
  perUnit: ["/ud.", "/unit"] as Tr,
  offers: ["Proveedores", "Suppliers"] as Tr,
  addOffer: ["Añadir proveedor", "Add supplier"] as Tr,
  noOffers: ["Aún no hay proveedores para este artículo.", "No suppliers for this item yet."] as Tr,
  chosen: ["Elegido", "Chosen"] as Tr,
  choose: ["Elegir", "Choose"] as Tr,
  availability: ["Disponibilidad", "Availability"] as Tr,
  write: ["Escribir", "Email"] as Tr,
  visit: ["Abrir", "Open"] as Tr,
  edit: ["Editar", "Edit"] as Tr,
  del: ["Borrar", "Delete"] as Tr,
  delItem: ["¿Borrar este artículo y sus proveedores?", "Delete this item and its suppliers?"] as Tr,
  delOffer: ["¿Borrar este proveedor?", "Delete this supplier?"] as Tr,
  yes: ["Sí, borrar", "Yes, delete"] as Tr,
  cancel: ["Cancelar", "Cancel"] as Tr,
  close: ["Cerrar", "Close"] as Tr,
  save: ["Guardar", "Save"] as Tr,
  saving: ["Guardando…", "Saving…"] as Tr,
  // Form artículo
  fFind: ["Referencia (MPN)", "Part (MPN)"] as Tr,
  fDesc: ["Descripción del artículo", "Item description"] as Tr,
  fUnits: ["Unidades", "Units"] as Tr,
  fUnitsHint: ["Tal cual lo pide el cliente: «150 y 200 uds.»", "As the client asks: “150 and 200 pcs”"] as Tr,
  fTarget: ["Objetivo del cliente (€/ud.)", "Client target (€/unit)"] as Tr,
  fOur: ["Precio que le damos (€/ud.)", "Our price (€/unit)"] as Tr,
  fStatus: ["Estado", "Status"] as Tr,
  fNotes: ["Observaciones", "Notes"] as Tr,
  pickClient: ["Cliente", "Client"] as Tr,
  newClient: ["➕ Cliente nuevo", "➕ New client"] as Tr,
  clientName: ["Nombre del cliente", "Client name"] as Tr,
  clientEmail: ["Correo del cliente", "Client email"] as Tr,
  // Form oferta
  oSupplier: ["Proveedor", "Supplier"] as Tr,
  oPick: ["— Proveedor nuevo —", "— New supplier —"] as Tr,
  oName: ["Nombre del proveedor", "Supplier name"] as Tr,
  oEmail: ["Correo", "Email"] as Tr,
  oWeb: ["Enlace / web", "Link / website"] as Tr,
  oCountry: ["País", "Country"] as Tr,
  oPrice: ["Precio del proveedor (€/ud.)", "Supplier price (€/unit)"] as Tr,
  oAvail: ["Disponibilidad", "Availability"] as Tr,
  oAvailHint: ["«Anuncia 8.163 uds.», «Bajo pedido…»", "“Lists 8,163 pcs”, “On order…”"] as Tr,
  oChosen: ["Marcar como proveedor elegido", "Mark as chosen supplier"] as Tr,
  reqErr: ["Rellena los campos obligatorios.", "Fill in the required fields."] as Tr,
  saveErr: ["No se pudo guardar. Inténtalo de nuevo.", "Could not save. Try again."] as Tr,
  req: ["*", "*"] as Tr,
};

const estadoOf = (v: string, lang: Lang) => {
  const o = PEDIDO_ESTADOS.find((e) => e.value === v);
  return o ? (lang === "es" ? o.label[0] : o.label[1]) : v;
};

export default function Pedidos({
  lang,
  isAdmin,
  clienteId,
  onOpen,
  onChanged,
}: {
  lang: Lang;
  isAdmin: boolean;
  clienteId: string | null;
  onOpen: (id: string | null) => void;
  onChanged: () => void;
}) {
  return clienteId ? (
    <ClientDetail key={clienteId} lang={lang} isAdmin={isAdmin} clienteId={clienteId} onBack={() => onOpen(null)} onChanged={onChanged} />
  ) : (
    <ClientsGrid lang={lang} onOpen={onOpen} onChanged={onChanged} />
  );
}

/* ---------------- Lista de clientes ---------------- */

function ClientsGrid({ lang, onOpen, onChanged }: { lang: Lang; onOpen: (id: string) => void; onChanged: () => void }) {
  const [rows, setRows] = useState<ClienteResumen[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setErr(false);
    const res = await fetchClientesConPedidos();
    if (!res.ok) return setErr(true), setRows([]);
    setRows(res.data);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !n || r.nombre.toLowerCase().includes(n) || (r.email ?? "").toLowerCase().includes(n));
  }, [rows, q]);

  return (
    <section className="page-sec">
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">01</span>{tr(C.eyebrow, lang)}</span>
          <h1 className="sec-title">{tr(C.title, lang)}</h1>
          <p className="sec-intro">{tr(C.intro, lang)}</p>
        </div>
        <button type="button" className="btn btn--primary btn--new" onClick={() => setCreating(true)}>
          <span aria-hidden="true">+</span> {tr(C.newOrder, lang)}
        </button>
      </header>

      <div className="toolbar">
        <label className="search">
          <span className="sr-only">{tr(C.search, lang)}</span>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(C.search, lang)} className="search__input" />
        </label>
        {rows && <span className="toolbar__count">{tr(C.clients(filtered.length), lang)}</span>}
      </div>

      {rows === null ? (
        <div className="state">{tr(C.loading, lang)}</div>
      ) : err ? (
        <div className="state"><span className="note__tag">ERR</span> {tr(C.loadErr, lang)} <button className="linkbtn" onClick={load}>{tr(C.retry, lang)}</button></div>
      ) : rows.length === 0 ? (
        <div className="state state--empty">
          <span className="state__code">01</span>
          <p className="state__text">{tr(C.empty, lang)}</p>
          <button type="button" className="btn btn--primary btn--new" onClick={() => setCreating(true)}><span aria-hidden="true">+</span> {tr(C.newOrder, lang)}</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="state">{tr(C.noMatch, lang)}</div>
      ) : (
        <div className="client-grid">
          {filtered.map((c) => (
            <button key={c.id} type="button" className="client-card" onClick={() => onOpen(c.id)}>
              <div className="client-card__top">
                <span className="client-card__avatar" aria-hidden="true">{c.nombre.slice(0, 1).toUpperCase()}</span>
                <span className="client-card__name">{c.nombre}</span>
                <span className="client-card__arrow" aria-hidden="true">→</span>
              </div>
              {(c.contacto || c.email || c.pais) && (
                <span className="client-card__meta">{[c.contacto, c.email, c.pais].filter(Boolean).join(" · ")}</span>
              )}
              <div className="client-card__stats">
                <span className="cstat"><b>{num(c.articulos, lang)}</b> {tr(C.items(c.articulos), lang).split(" ").slice(1).join(" ")}</span>
                <span className="cstat"><b>{num(c.ofertas, lang)}</b> {tr(C.offersN(c.ofertas), lang).split(" ").slice(1).join(" ")}</span>
                {c.abiertos > 0 && <span className="cstat cstat--open"><b>{num(c.abiertos, lang)}</b> {lang === "es" ? "abiertos" : "open"}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {creating && <ItemDrawer lang={lang} onClose={() => setCreating(false)} onSaved={(cid) => { setCreating(false); onChanged(); onOpen(cid); }} />}
    </section>
  );
}

/* ---------------- Detalle de un cliente ---------------- */

function ClientDetail({
  lang,
  isAdmin,
  clienteId,
  onBack,
  onChanged,
}: {
  lang: Lang;
  isAdmin: boolean;
  clienteId: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [err, setErr] = useState(false);
  const [itemDrawer, setItemDrawer] = useState<Pedido | "new" | null>(null);
  const [offerFor, setOfferFor] = useState<{ pedido: Pedido; oferta: Oferta | null } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(false);
    const res = await fetchCliente(clienteId);
    if (!res.ok) return setErr(true);
    setCliente(res.data.cliente);
    setPedidos(res.data.pedidos);
  }, [clienteId]);
  useEffect(() => {
    load();
  }, [load]);

  async function reload() {
    await load();
    onChanged();
  }

  if (err) return <div className="state" style={{ marginTop: 24 }}><span className="note__tag">ERR</span> {tr(C.loadErr, lang)} <button className="linkbtn" onClick={load}>{tr(C.retry, lang)}</button></div>;
  if (!cliente || pedidos === null) return <div className="state" style={{ marginTop: 24 }}>{tr(C.loading, lang)}</div>;

  return (
    <section className="page-sec">
      <button type="button" className="backlink" onClick={onBack}>← {tr(C.back, lang)}</button>

      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">01</span>{tr(C.client, lang)}</span>
          <h1 className="sec-title">{cliente.nombre}</h1>
          {(cliente.contacto || cliente.email || cliente.pais || cliente.sector) && (
            <p className="sec-intro">{[cliente.contacto, cliente.email, cliente.sector, cliente.pais].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        <button type="button" className="btn btn--primary btn--new" onClick={() => setItemDrawer("new")}>
          <span aria-hidden="true">+</span> {tr(C.newItem, lang)}
        </button>
      </header>

      {pedidos.length === 0 ? (
        <div className="state state--empty">
          <span className="state__code">01</span>
          <p className="state__text">{lang === "es" ? "Este cliente aún no tiene artículos." : "This client has no items yet."}</p>
          <button type="button" className="btn btn--primary btn--new" onClick={() => setItemDrawer("new")}><span aria-hidden="true">+</span> {tr(C.newItem, lang)}</button>
        </div>
      ) : (
        <div className="items">
          {pedidos.map((p) => (
            <ItemCard key={p.id} lang={lang} isAdmin={isAdmin} pedido={p}
              onEdit={() => setItemDrawer(p)}
              onDelete={() => setConfirmDel(p.id)}
              onAddOffer={() => setOfferFor({ pedido: p, oferta: null })}
              onEditOffer={(o) => setOfferFor({ pedido: p, oferta: o })}
              onChoose={async (o) => { await setElegida(p.id, o.id); reload(); }}
              onDeleteOffer={async (o) => { await deleteOferta(o.id); reload(); }}
              confirmDel={confirmDel === p.id}
              onConfirmDel={async () => { await deletePedido(p.id); setConfirmDel(null); reload(); }}
              onCancelDel={() => setConfirmDel(null)}
            />
          ))}
        </div>
      )}

      {itemDrawer && (
        <ItemDrawer lang={lang} fixedCliente={cliente} pedido={itemDrawer === "new" ? undefined : itemDrawer}
          onClose={() => setItemDrawer(null)} onSaved={() => { setItemDrawer(null); reload(); }} />
      )}
      {offerFor && (
        <OfferDrawer lang={lang} pedido={offerFor.pedido} oferta={offerFor.oferta}
          onClose={() => setOfferFor(null)} onSaved={() => { setOfferFor(null); reload(); }} />
      )}
    </section>
  );
}

function ItemCard({
  lang, isAdmin, pedido, onEdit, onDelete, onAddOffer, onEditOffer, onChoose, onDeleteOffer, confirmDel, onConfirmDel, onCancelDel,
}: {
  lang: Lang; isAdmin: boolean; pedido: Pedido;
  onEdit: () => void; onDelete: () => void; onAddOffer: () => void; onEditOffer: (o: Oferta) => void;
  onChoose: (o: Oferta) => void; onDeleteOffer: (o: Oferta) => void;
  confirmDel: boolean; onConfirmDel: () => void; onCancelDel: () => void;
}) {
  const margin = (o: Oferta) =>
    pedido.precio_cliente != null && o.precio != null ? pedido.precio_cliente - o.precio : null;

  return (
    <article className="item">
      <div className="item__head">
        <div className="item__id">
          <span className="item__mpn">{text(pedido.mpn)}</span>
          {pedido.descripcion && <span className="item__desc">{pedido.descripcion}</span>}
        </div>
        <div className="item__headright">
          <StatusPill options={PEDIDO_ESTADOS} value={pedido.estado} lang={lang} />
          <button type="button" className="iconbtn iconbtn--sm" onClick={onEdit} aria-label={tr(C.edit, lang)} title={tr(C.edit, lang)}>
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
          </button>
          {isAdmin && (
            <button type="button" className="iconbtn iconbtn--sm iconbtn--danger" onClick={onDelete} aria-label={tr(C.del, lang)} title={tr(C.del, lang)}>
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 4h10M6 4V3h4v1M5 4l.6 9h4.8L11 4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
            </button>
          )}
        </div>
      </div>

      {confirmDel && (
        <div className="item__confirm">
          <span>{tr(C.delItem, lang)}</span>
          <button type="button" className="btn btn--danger btn--sm" onClick={onConfirmDel}>{tr(C.yes, lang)}</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCancelDel}>{tr(C.cancel, lang)}</button>
        </div>
      )}

      <div className="item__facts">
        <div className="fact"><span className="fact__k">{tr(C.units, lang)}</span><span className="fact__v">{text(pedido.unidades)}</span></div>
        <div className="fact"><span className="fact__k">{tr(C.target, lang)}</span><span className="fact__v">{pedido.precio_objetivo != null ? money(pedido.precio_objetivo, lang) : "—"}</span></div>
        <div className="fact fact--accent"><span className="fact__k">{tr(C.ourPrice, lang)}</span><span className="fact__v">{pedido.precio_cliente != null ? money(pedido.precio_cliente, lang) : "—"}</span></div>
      </div>

      <div className="offers">
        <div className="offers__head">
          <span className="offers__title">{tr(C.offers, lang)} · {pedido.ofertas.length}</span>
          <button type="button" className="linkbtn" onClick={onAddOffer}>+ {tr(C.addOffer, lang)}</button>
        </div>
        {pedido.ofertas.length === 0 ? (
          <p className="offers__empty">{tr(C.noOffers, lang)}</p>
        ) : (
          <ul className="offer-list">
            {pedido.ofertas.map((o) => {
              const m = margin(o);
              return (
                <li key={o.id} className={"offer" + (o.elegida ? " is-chosen" : "")}>
                  <div className="offer__main">
                    <span className="offer__name">
                      {o.elegida && <span className="offer__star" aria-label={tr(C.chosen, lang)} title={tr(C.chosen, lang)}>★</span>}
                      {text(o.proveedor)}
                      {o.pais && <span className="offer__country">{o.pais}</span>}
                    </span>
                    {o.disponibilidad && <span className="offer__avail">{o.disponibilidad}</span>}
                  </div>
                  <div className="offer__price">
                    <span className="offer__eur">{o.precio != null ? money(o.precio, lang) : "—"}</span>
                    {m != null && <span className={"offer__margin " + (m >= 0 ? "is-pos" : "is-neg")}>{m >= 0 ? "+" : ""}{money(m, lang)} {tr(C.margin, lang).toLowerCase()}</span>}
                  </div>
                  <div className="offer__actions">
                    {o.email && <a className="chipbtn" href={"mailto:" + o.email} title={o.email}><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M2 4h12v8H2z" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M2 4l6 4 6-4" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>{tr(C.write, lang)}</a>}
                    {o.enlace && <a className="chipbtn" href={o.enlace.startsWith("http") ? o.enlace : "https://" + o.enlace} target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 10l4-4M7 4h5v5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><path d="M11 9v3H4V5h3" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>{tr(C.visit, lang)}</a>}
                    {!o.elegida && <button type="button" className="chipbtn" onClick={() => onChoose(o)}>{tr(C.choose, lang)}</button>}
                    <button type="button" className="chipbtn" onClick={() => onEditOffer(o)}>{tr(C.edit, lang)}</button>
                    <button type="button" className="chipbtn chipbtn--danger" onClick={() => onDeleteOffer(o)}>{tr(C.del, lang)}</button>
                  </div>
                  {o.notas && <span className="offer__notes">{o.notas}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pedido.notas && <p className="item__notes"><span className="note__tag">INT</span> {pedido.notas}</p>}
    </article>
  );
}

/* ---------------- Ficha: artículo ---------------- */

function moneyToNum(s: string): number | null {
  const v = s.trim();
  if (!v) return null;
  const n = Number(v.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN as unknown as number;
}
const numToForm = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

function Drawer({ title, eyebrow, lang, onClose, children, foot }: {
  title: string; eyebrow: Tr; lang: Lang; onClose: () => void; children: React.ReactNode; foot: React.ReactNode;
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
            <span className="sec-eyebrow"><span className="sec-eyebrow__code">01</span>{tr(eyebrow, lang)}</span>
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

function ItemDrawer({ lang, fixedCliente, pedido, onClose, onSaved }: {
  lang: Lang; fixedCliente?: Cliente; pedido?: Pedido; onClose: () => void; onSaved: (clienteId: string) => void;
}) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState(fixedCliente?.id ?? pedido?.cliente_id ?? "");
  const [newClient, setNewClient] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [mpn, setMpn] = useState(pedido?.mpn ?? "");
  const [desc, setDesc] = useState(pedido?.descripcion ?? "");
  const [unidades, setUnidades] = useState(pedido?.unidades ?? "");
  const [objetivo, setObjetivo] = useState(numToForm(pedido?.precio_objetivo));
  const [precio, setPrecio] = useState(numToForm(pedido?.precio_cliente));
  const [estado, setEstado] = useState(pedido?.estado ?? "nuevo");
  const [notas, setNotas] = useState(pedido?.notas ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"req" | "save" | null>(null);

  useEffect(() => {
    if (!fixedCliente) supabase.from("clientes").select("*").order("nombre").limit(5000).then(({ data }) => setClientes((data ?? []) as Cliente[]));
  }, [fixedCliente]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    let cid = clienteId;
    if (!fixedCliente && newClient) {
      if (!cName.trim()) return setError("req");
    } else if (!cid) {
      return setError("req");
    }
    if (!mpn.trim() && !desc.trim()) return setError("req");
    setError(null);
    setBusy(true);
    if (!fixedCliente && newClient) {
      const res = await clienteNuevo(cName, cEmail);
      if (!res.ok) { setBusy(false); return setError("save"); }
      cid = res.data.id;
    }
    const input: PedidoInput = {
      cliente_id: cid,
      mpn, descripcion: desc, unidades,
      precio_objetivo: objetivo.trim() ? moneyToNum(objetivo) : null,
      precio_cliente: precio.trim() ? moneyToNum(precio) : null,
      estado, notas,
    };
    if (Number.isNaN(input.precio_objetivo) || Number.isNaN(input.precio_cliente)) { setBusy(false); return setError("req"); }
    const res = await savePedido(input, pedido?.id);
    setBusy(false);
    if (!res.ok) return setError("save");
    onSaved(cid);
  }

  return (
    <form onSubmit={submit} noValidate>
      <Drawer lang={lang} eyebrow={pedido ? C.edit : C.newItem} title={pedido ? text(pedido.mpn) : tr(C.newItem, lang)} onClose={onClose}
        foot={
          <div className="drawer__foot">
            <span className="drawer__spacer" />
            <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tr(C.cancel, lang)}</button>
            <button type="submit" className={"btn btn--primary btn--sm" + (busy ? " btn--busy" : "")} aria-busy={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}{tr(busy ? C.saving : C.save, lang)}
            </button>
          </div>
        }>
        <div className="drawer__body">
          <div className="fgrid">
            {!fixedCliente && (
              <div className="fcell fcell--wide">
                <label className="field__label">{tr(C.pickClient, lang)}<span className="req"> *</span></label>
                {newClient ? (
                  <>
                    <input className="input input--sm" value={cName} onChange={(e) => { setCName(e.target.value); setError(null); }} placeholder={tr(C.clientName, lang)} />
                    <input className="input input--sm" style={{ marginTop: 8 }} type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder={tr(C.clientEmail, lang)} />
                    <button type="button" className="linkbtn" style={{ marginTop: 6 }} onClick={() => setNewClient(false)}>← {tr(C.pickClient, lang)}</button>
                  </>
                ) : (
                  <select className="input input--sm" value={clienteId} onChange={(e) => { if (e.target.value === "__new") { setNewClient(true); } else { setClienteId(e.target.value); } setError(null); }}>
                    <option value="">—</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    <option value="__new">{tr(C.newClient, lang)}</option>
                  </select>
                )}
              </div>
            )}
            <div className="fcell">
              <label className="field__label">{tr(C.fFind, lang)}</label>
              <input className="input input--sm is-mono" value={mpn} onChange={(e) => { setMpn(e.target.value); setError(null); }} placeholder="TS512MSK64V6N-I" />
            </div>
            <div className="fcell">
              <label className="field__label">{tr(C.fStatus, lang)}</label>
              <select className="input input--sm" value={estado} onChange={(e) => setEstado(e.target.value)}>
                {PEDIDO_ESTADOS.map((s) => <option key={s.value} value={s.value}>{estadoOf(s.value, lang)}</option>)}
              </select>
            </div>
            <div className="fcell fcell--wide">
              <label className="field__label">{tr(C.fDesc, lang)}</label>
              <input className="input input--sm" value={desc} onChange={(e) => { setDesc(e.target.value); setError(null); }} placeholder="Memoria Transcend 4 GB SO-DIMM 1600" />
            </div>
            <div className="fcell fcell--wide">
              <label className="field__label">{tr(C.fUnits, lang)}</label>
              <input className="input input--sm" value={unidades} onChange={(e) => setUnidades(e.target.value)} placeholder="150 y 200 uds." />
              <span className="fhint">{tr(C.fUnitsHint, lang)}</span>
            </div>
            <div className="fcell">
              <label className="field__label">{tr(C.fTarget, lang)}</label>
              <input className="input input--sm" inputMode="decimal" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="60,00" />
            </div>
            <div className="fcell">
              <label className="field__label">{tr(C.fOur, lang)}</label>
              <input className="input input--sm" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0,00" />
            </div>
            <div className="fcell fcell--wide">
              <label className="field__label">{tr(C.fNotes, lang)}</label>
              <textarea className="input input--sm input--area" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </div>
          {error && <div className="note note--error" role="alert"><span className="note__tag">ERR</span><span className="note__text">{tr(error === "req" ? C.reqErr : C.saveErr, lang)}</span></div>}
        </div>
      </Drawer>
    </form>
  );
}

/* ---------------- Ficha: oferta ---------------- */

function OfferDrawer({ lang, pedido, oferta, onClose, onSaved }: {
  lang: Lang; pedido: Pedido; oferta: Oferta | null; onClose: () => void; onSaved: () => void;
}) {
  const [provs, setProvs] = useState<{ id: string; nombre: string; email: string | null; pais: string | null; web: string | null }[]>([]);
  const [proveedorId, setProveedorId] = useState(oferta?.proveedor_id ?? "");
  const [nombre, setNombre] = useState(oferta?.proveedor ?? "");
  const [email, setEmail] = useState(oferta?.email ?? "");
  const [enlace, setEnlace] = useState(oferta?.enlace ?? "");
  const [pais, setPais] = useState(oferta?.pais ?? "");
  const [precio, setPrecio] = useState(numToForm(oferta?.precio));
  const [disp, setDisp] = useState(oferta?.disponibilidad ?? "");
  const [elegida, setElegidaS] = useState(oferta?.elegida ?? false);
  const [notas, setNotas] = useState(oferta?.notas ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"req" | "save" | null>(null);

  useEffect(() => {
    supabase.from("proveedores").select("id, nombre, email, pais, web").order("nombre").limit(5000)
      .then(({ data }) => setProvs((data ?? []) as typeof provs));
  }, []);

  function pick(id: string) {
    setProveedorId(id);
    setError(null);
    if (id && id !== "__new") {
      const p = provs.find((x) => x.id === id);
      if (p) { setNombre(p.nombre); setEmail(p.email ?? ""); setPais(p.pais ?? ""); setEnlace(p.web ?? ""); }
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!proveedorId && !nombre.trim()) return setError("req");
    const p = precio.trim() ? moneyToNum(precio) : null;
    if (Number.isNaN(p)) return setError("req");
    setError(null);
    setBusy(true);
    const input: OfertaInput = {
      pedido_id: pedido.id,
      proveedor_id: proveedorId && proveedorId !== "__new" ? proveedorId : null,
      proveedor: nombre, email, enlace, pais, precio: p, disponibilidad: disp, elegida, notas,
    };
    const res = await saveOferta(input, oferta?.id);
    setBusy(false);
    if (!res.ok) return setError("save");
    onSaved();
  }

  return (
    <form onSubmit={submit} noValidate>
      <Drawer lang={lang} eyebrow={C.addOffer} title={oferta ? text(oferta.proveedor) : tr(C.addOffer, lang)} onClose={onClose}
        foot={
          <div className="drawer__foot">
            <span className="drawer__spacer" />
            <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tr(C.cancel, lang)}</button>
            <button type="submit" className={"btn btn--primary btn--sm" + (busy ? " btn--busy" : "")} aria-busy={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}{tr(busy ? C.saving : C.save, lang)}
            </button>
          </div>
        }>
        <div className="drawer__body">
          <p className="fhint" style={{ marginTop: -4 }}>{text(pedido.mpn)}{pedido.descripcion ? " · " + pedido.descripcion : ""}</p>
          <div className="fgrid">
            <div className="fcell fcell--wide">
              <label className="field__label">{tr(C.oSupplier, lang)}<span className="req"> *</span></label>
              <select className="input input--sm" value={proveedorId || "__new"} onChange={(e) => pick(e.target.value)}>
                <option value="__new">{tr(C.oPick, lang)}</option>
                {provs.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div className="fcell">
              <label className="field__label">{tr(C.oName, lang)}</label>
              <input className="input input--sm" value={nombre} onChange={(e) => { setNombre(e.target.value); setProveedorId(""); setError(null); }} placeholder="Assured Systems" />
            </div>
            <div className="fcell">
              <label className="field__label">{tr(C.oCountry, lang)}</label>
              <input className="input input--sm" value={pais} onChange={(e) => setPais(e.target.value)} placeholder="Reino Unido" />
            </div>
            <div className="fcell">
              <label className="field__label">{tr(C.oEmail, lang)}</label>
              <input className="input input--sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sales@assured.com" />
            </div>
            <div className="fcell">
              <label className="field__label">{tr(C.oWeb, lang)}</label>
              <input className="input input--sm" value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="https://…" />
            </div>
            <div className="fcell">
              <label className="field__label">{tr(C.oPrice, lang)}</label>
              <input className="input input--sm" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0,00" />
            </div>
            <div className="fcell">
              <label className="field__label">{tr(C.oAvail, lang)}</label>
              <input className="input input--sm" value={disp} onChange={(e) => setDisp(e.target.value)} placeholder="Anuncia 8.163 uds." />
              <span className="fhint">{tr(C.oAvailHint, lang)}</span>
            </div>
            <div className="fcell fcell--wide">
              <button type="button" className="remember" role="checkbox" aria-checked={elegida} onClick={() => setElegidaS((v) => !v)}>
                <span className="remember__box" aria-hidden="true">{elegida ? "✓" : ""}</span>
                {tr(C.oChosen, lang)}
              </button>
            </div>
            <div className="fcell fcell--wide">
              <label className="field__label">{tr(C.fNotes, lang)}</label>
              <textarea className="input input--sm input--area" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </div>
          {error && <div className="note note--error" role="alert"><span className="note__tag">ERR</span><span className="note__text">{tr(error === "req" ? C.reqErr : C.saveErr, lang)}</span></div>}
        </div>
      </Drawer>
    </form>
  );
}
