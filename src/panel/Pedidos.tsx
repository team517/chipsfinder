import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Lang } from "../i18n";
import { supabase } from "../auth";
import { PEDIDO_ESTADOS } from "./entities";
import { StatusPill } from "./EntityPage";
import { money, moneyCur, num, text, tr, type Tr } from "./format";
import { EstadoPill, OfferEditor } from "./sourcing";
import { ContactDrawer } from "./contact";
import {
  clienteNuevo,
  deleteOferta,
  deletePedido,
  fetchCliente,
  fetchClientesConPedidos,
  savePedido,
  setElegida,
  setPrecioCliente,
  saveEscalas,
  type Escala,
  type Cliente,
  type ClienteResumen,
  type Oferta,
  type Pedido,
  type PedidoInput,
} from "./pedidos-data";

const C = {
  eyebrow: ["Pedidos entrantes", "Incoming orders"] as Tr,
  title: ["Pedidos", "Orders"] as Tr,
  intro: [
    "Cada cliente y lo que te ha pedido. Entra en uno para ver sus referencias y precios.",
    "Each client and what they asked for. Open one to see their parts and prices.",
  ] as Tr,
  newOrder: ["Nuevo pedido", "New order"] as Tr,
  newItem: ["Nueva referencia", "New part"] as Tr,
  search: ["Buscar cliente…", "Search client…"] as Tr,
  clients: (n: number): Tr => [n === 1 ? "1 cliente" : n + " clientes", n === 1 ? "1 client" : n + " clients"],
  loading: ["Cargando…", "Loading…"] as Tr,
  loadErr: ["No se pudo cargar.", "Could not load."] as Tr,
  retry: ["Reintentar", "Retry"] as Tr,
  empty: ["Todavía no hay pedidos. Crea el primero.", "No orders yet. Create the first one."] as Tr,
  noMatch: ["Ningún cliente coincide.", "No client matches."] as Tr,
  items: (n: number): Tr => [n === 1 ? "1 referencia" : n + " referencias", n === 1 ? "1 part" : n + " parts"],
  back: ["Pedidos", "Orders"] as Tr,
  backClient: ["Referencias", "Parts"] as Tr,
  client: ["Cliente", "Client"] as Tr,
  // proceso
  stNuevo: ["Nuevo", "New"] as Tr,
  stCotizando: ["Cotizando", "Quoting"] as Tr,
  stEnCurso: ["En curso", "In progress"] as Tr,
  stCerrado: ["Cerrado", "Closed"] as Tr,
  process: ["Proceso", "Stage"] as Tr,
  // lista de referencias
  colRef: ["Referencia", "Part"] as Tr,
  colUnits: ["Unidades", "Units"] as Tr,
  colSuppliers: ["Prov.", "Sup."] as Tr,
  colBest: ["Mejor precio", "Best price"] as Tr,
  colOur: ["Nuestro", "Ours"] as Tr,
  // detalle
  target: ["Objetivo cliente", "Client target"] as Tr,
  ourPrice: ["Precio que damos", "Our price"] as Tr,
  units: ["Unidades", "Units"] as Tr,
  margin: ["Margen", "Margin"] as Tr,
  offers: ["Proveedores", "Suppliers"] as Tr,
  addOffer: ["Añadir proveedor", "Add supplier"] as Tr,
  noOffers: ["Aún no hay proveedores para esta referencia.", "No suppliers for this part yet."] as Tr,
  chosen: ["Elegido", "Chosen"] as Tr,
  choose: ["Elegir", "Choose"] as Tr,
  write: ["Escribir", "Email"] as Tr,
  visit: ["Abrir", "Open"] as Tr,
  edit: ["Editar", "Edit"] as Tr,
  del: ["Borrar", "Delete"] as Tr,
  delItem: ["¿Borrar esta referencia y sus proveedores?", "Delete this part and its suppliers?"] as Tr,
  delOffer: ["¿Borrar este proveedor?", "Delete this supplier?"] as Tr,
  yes: ["Sí, borrar", "Yes, delete"] as Tr,
  cancel: ["Cancelar", "Cancel"] as Tr,
  close: ["Cerrar", "Close"] as Tr,
  save: ["Guardar", "Save"] as Tr,
  saving: ["Guardando…", "Saving…"] as Tr,
  // recomendador
  calc: ["Precio y margen", "Price and margin"] as Tr,
  qty: ["Cantidad", "Quantity"] as Tr,
  cost: ["Coste del proveedor (€/ud.)", "Supplier cost (€/unit)"] as Tr,
  costFrom: (s: string): Tr => ["Del proveedor " + s, "From supplier " + s],
  reco: ["Precio recomendado", "Recommended price"] as Tr,
  yourQuote: ["Precio que le das (€/ud.)", "Your quote (€/unit)"] as Tr,
  totalSale: ["Venta total", "Total sale"] as Tr,
  totalCost: ["Coste total", "Total cost"] as Tr,
  profit: ["Tu beneficio", "Your profit"] as Tr,
  marginPct: ["Margen", "Margin"] as Tr,
  useReco: ["Usar el recomendado", "Use recommended"] as Tr,
  savePrice: ["Guardar este precio", "Save this price"] as Tr,
  saved: ["Guardado", "Saved"] as Tr,
  noCost: ["Añade un proveedor con precio para calcular el margen.", "Add a supplier with a price to work out the margin."] as Tr,
  vGreat: ["Buen precio: margen sano para ti y dentro de lo que quiere pagar el cliente.", "Good price: a healthy margin for you and within the client's budget."] as Tr,
  vTight: ["El margen es pequeño; mira si puedes conseguir mejor coste o subir un poco el precio.", "The margin is slim; try to get a better cost or raise the price a bit."] as Tr,
  vOk: ["Precio con un margen sano para reventa.", "A price with a healthy resale margin."] as Tr,
  vLoss: ["Cuidado: a este precio vendes por debajo del coste y pierdes dinero.", "Warning: at this price you sell below cost and lose money."] as Tr,
  vAbove: ["Por encima de lo que quiere pagar el cliente; quizá pida rebaja. Buen margen para ti.", "Above what the client wants to pay; they may ask for a discount. Good margin for you."] as Tr,
  targetBelow: (c: string): Tr => [
    "El objetivo del cliente está por debajo del coste del proveedor (" + c + "). No se puede llegar a ese precio sin perder.",
    "The client's target is below the supplier cost (" + c + "). You can't reach it without a loss.",
  ],
  factorsT: ["A tener en cuenta", "Keep in mind"] as Tr,
  factors: [
    ["Pedido mínimo (MOQ) del proveedor", "Supplier minimum order (MOQ)"],
    ["Plazo de entrega y urgencia del cliente", "Lead time and client urgency"],
    ["Condición y date code del lote", "Batch condition and date code"],
    ["Escasez o exceso en el mercado", "Market shortage or surplus"],
    ["Divisa y transporte/aduanas", "Currency and shipping/customs"],
  ] as Tr[],
  // form
  fFind: ["Referencia (MPN)", "Part (MPN)"] as Tr,
  fDesc: ["Descripción", "Description"] as Tr,
  fUnits: ["Unidades (lo que pide)", "Units (as requested)"] as Tr,
  fUnitsHint: ["Tal cual: «150 y 200 uds.»", "As stated: “150 and 200 pcs”"] as Tr,
  fQty: ["Cantidad para calcular", "Quantity for the maths"] as Tr,
  fTarget: ["Objetivo del cliente (€/ud.)", "Client target (€/unit)"] as Tr,
  fStatus: ["Estado", "Status"] as Tr,
  fNotes: ["Observaciones", "Notes"] as Tr,
  pickClient: ["Cliente", "Client"] as Tr,
  newClient: ["➕ Cliente nuevo", "➕ New client"] as Tr,
  clientName: ["Nombre del cliente", "Client name"] as Tr,
  clientEmail: ["Correo del cliente", "Client email"] as Tr,
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
};

const estadoOf = (v: string, lang: Lang) => {
  const o = PEDIDO_ESTADOS.find((e) => e.value === v);
  return o ? (lang === "es" ? o.label[0] : o.label[1]) : v;
};

type Stage = "nuevo" | "cotizando" | "curso" | "cerrado";
function stageOf(estados: string[]): Stage {
  if (estados.length === 0) return "nuevo";
  if (estados.some((e) => e === "confirmado" || e === "enviado")) return "curso";
  if (estados.every((e) => e === "cerrado" || e === "perdido")) return "cerrado";
  if (estados.some((e) => e === "cotizado")) return "cotizando";
  return "nuevo";
}
const stageTone: Record<Stage, string> = { nuevo: "accent", cotizando: "info", curso: "warn", cerrado: "muted" };
const stageLabel = (s: Stage) => (s === "nuevo" ? C.stNuevo : s === "cotizando" ? C.stCotizando : s === "curso" ? C.stEnCurso : C.stCerrado);

const firstNum = (s: string | null | undefined): number | null => {
  const m = (s ?? "").replace(/[.,](?=\d{3}\b)/g, "").match(/\d+/);
  return m ? Number(m[0]) : null;
};
const bestCost = (p: Pedido): { cost: number; name: string } | null => {
  const live = p.ofertas.filter((o) => o.precio != null && o.estado !== "descartado");
  const eur = live.filter((o) => (o.moneda ?? "EUR") === "EUR");
  const withPrice = eur.length ? eur : live;
  if (!withPrice.length) return null;
  const chosen = withPrice.find((o) => o.elegida);
  const o = chosen ?? withPrice.reduce((a, b) => ((b.precio ?? 0) < (a.precio ?? 0) ? b : a));
  return { cost: o.precio as number, name: o.proveedor ?? "" };
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
  const [rows, setRows] = useState<(ClienteResumen & { estados?: string[] })[] | null>(null);
  const [stages, setStages] = useState<Record<string, Stage>>({});
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setErr(false);
    const res = await fetchClientesConPedidos();
    if (!res.ok) return setErr(true), setRows([]);
    setRows(res.data);
    // proceso por cliente
    const { data } = await supabase.from("pedidos").select("cliente_id, estado").limit(5000);
    const byClient: Record<string, string[]> = {};
    for (const r of (data ?? []) as { cliente_id: string; estado: string }[]) (byClient[r.cliente_id] ??= []).push(r.estado);
    const st: Record<string, Stage> = {};
    for (const id in byClient) st[id] = stageOf(byClient[id]);
    setStages(st);
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
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
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
          {filtered.map((c) => {
            const st = stages[c.id] ?? "nuevo";
            return (
              <button key={c.id} type="button" className="client-card" onClick={() => onOpen(c.id)}>
                <div className="client-card__top">
                  <span className="client-card__avatar" aria-hidden="true">{c.nombre.slice(0, 1).toUpperCase()}</span>
                  <span className="client-card__name">{c.nombre}</span>
                  <span className={"pill pill--" + stageTone[st]}>{tr(stageLabel(st), lang)}</span>
                </div>
                {(c.contacto || c.email || c.pais) && (
                  <span className="client-card__meta">{[c.contacto, c.email, c.pais].filter(Boolean).join(" · ")}</span>
                )}
                <div className="client-card__stats">
                  <span className="cstat"><b>{num(c.articulos, lang)}</b> {lang === "es" ? "ref." : "parts"}</span>
                  <span className="cstat"><b>{num(c.ofertas, lang)}</b> {lang === "es" ? "prov." : "sup."}</span>
                  {c.abiertos > 0 && <span className="cstat cstat--open"><b>{num(c.abiertos, lang)}</b> {lang === "es" ? "abiertos" : "open"}</span>}
                  <span className="client-card__arrow" aria-hidden="true">→</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {creating && <ItemDrawer lang={lang} onClose={() => setCreating(false)} onSaved={(cid) => { setCreating(false); onChanged(); onOpen(cid); }} />}
    </section>
  );
}

/* ---------------- Detalle de un cliente: lista de referencias + ficha ---------------- */

function ClientDetail({
  lang, isAdmin, clienteId, onBack, onChanged,
}: {
  lang: Lang; isAdmin: boolean; clienteId: string; onBack: () => void; onChanged: () => void;
}) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [err, setErr] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [itemDrawer, setItemDrawer] = useState<Pedido | "new" | null>(null);

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

  const selected = selId ? pedidos.find((p) => p.id === selId) ?? null : null;
  const stage = stageOf(pedidos.map((p) => p.estado));

  // Vista: ficha de una referencia
  if (selected) {
    return (
      <section className="page-sec">
        <button type="button" className="backlink" onClick={() => setSelId(null)}>← {cliente.nombre} · {tr(C.backClient, lang)}</button>
        <ItemDetail lang={lang} isAdmin={isAdmin} pedido={selected}
          onEdit={() => setItemDrawer(selected)}
          onDeleted={async () => { setSelId(null); await reload(); }}
          onChanged={reload}
        />
        {itemDrawer && (
          <ItemDrawer lang={lang} fixedCliente={cliente} pedido={itemDrawer === "new" ? undefined : itemDrawer}
            onClose={() => setItemDrawer(null)} onSaved={() => { setItemDrawer(null); reload(); }} />
        )}
      </section>
    );
  }

  // Vista: lista de referencias del cliente
  return (
    <section className="page-sec">
      <button type="button" className="backlink" onClick={onBack}>← {tr(C.back, lang)}</button>

      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">01</span>{tr(C.client, lang)}</span>
          <h1 className="sec-title">{cliente.nombre}</h1>
          <p className="sec-intro">
            <span className={"pill pill--" + stageTone[stage]} style={{ marginRight: 10 }}>{tr(C.process, lang)}: {tr(stageLabel(stage), lang)}</span>
            {[cliente.contacto, cliente.email, cliente.sector, cliente.pais].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button type="button" className="btn btn--primary btn--new" onClick={() => setItemDrawer("new")}>
          <span aria-hidden="true">+</span> {tr(C.newItem, lang)}
        </button>
      </header>

      {pedidos.length === 0 ? (
        <div className="state state--empty">
          <span className="state__code">01</span>
          <p className="state__text">{lang === "es" ? "Este cliente aún no tiene referencias." : "This client has no parts yet."}</p>
          <button type="button" className="btn btn--primary btn--new" onClick={() => setItemDrawer("new")}><span aria-hidden="true">+</span> {tr(C.newItem, lang)}</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{tr(C.colRef, lang)}</th>
                <th className="is-optional">{tr(C.colUnits, lang)}</th>
                <th className="is-right">{tr(C.colSuppliers, lang)}</th>
                <th className="is-right is-optional">{tr(C.colBest, lang)}</th>
                <th className="is-right">{tr(C.colOur, lang)}</th>
                <th>{tr(C.fStatus, lang)}</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => {
                const bc = bestCost(p);
                return (
                  <tr key={p.id} tabIndex={0} onClick={() => setSelId(p.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelId(p.id); } }}>
                    <td data-label={tr(C.colRef, lang)} className="is-strong">
                      <span className="ref-mpn">{text(p.mpn)}</span>
                      {p.descripcion && <span className="ref-desc">{p.descripcion}</span>}
                    </td>
                    <td data-label={tr(C.colUnits, lang)} className="is-optional">{text(p.unidades)}</td>
                    <td data-label={tr(C.colSuppliers, lang)} className="is-right is-mono">{p.ofertas.length}</td>
                    <td data-label={tr(C.colBest, lang)} className="is-right is-mono is-optional">{bc ? money(bc.cost, lang) : "—"}</td>
                    <td data-label={tr(C.colOur, lang)} className="is-right is-mono">{p.precio_cliente != null ? money(p.precio_cliente, lang) : "—"}</td>
                    <td data-label={tr(C.fStatus, lang)}><StatusPill options={PEDIDO_ESTADOS} value={p.estado} lang={lang} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {itemDrawer && (
        <ItemDrawer lang={lang} fixedCliente={cliente} pedido={itemDrawer === "new" ? undefined : itemDrawer}
          onClose={() => setItemDrawer(null)} onSaved={() => { setItemDrawer(null); reload(); }} />
      )}
    </section>
  );
}

/* ---------------- Ficha de una referencia ---------------- */

function ItemDetail({
  lang, isAdmin, pedido, onEdit, onDeleted, onChanged,
}: {
  lang: Lang; isAdmin: boolean; pedido: Pedido; onEdit: () => void; onDeleted: () => void; onChanged: () => void;
}) {
  const [offerFor, setOfferFor] = useState<Oferta | null | "new">(null);
  const [contact, setContact] = useState<Oferta | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const bc = bestCost(pedido);

  return (
    <>
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">01</span>{tr(C.client, lang)}</span>
          <h1 className="sec-title item-title">{text(pedido.mpn)}</h1>
          {pedido.descripcion && <p className="sec-intro">{pedido.descripcion}</p>}
        </div>
        <div className="item-detail__actions">
          <StatusPill options={PEDIDO_ESTADOS} value={pedido.estado} lang={lang} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={onEdit}>{tr(C.edit, lang)}</button>
          {isAdmin && (confirmDel ? (
            <span className="delconfirm">
              <button type="button" className="btn btn--danger btn--sm" onClick={async () => { await deletePedido(pedido.id); onDeleted(); }}>{tr(C.yes, lang)}</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDel(false)}>{tr(C.cancel, lang)}</button>
            </span>
          ) : (
            <button type="button" className="btn btn--ghost btn--sm btn--del" onClick={() => setConfirmDel(true)}>{tr(C.del, lang)}</button>
          ))}
        </div>
      </header>

      <div className="detail-grid">
        <div className="detail-col">
          <div className="item__facts">
            <div className="fact"><span className="fact__k">{tr(C.units, lang)}</span><span className="fact__v">{text(pedido.unidades)}</span></div>
            <div className="fact"><span className="fact__k">{tr(C.target, lang)}</span><span className="fact__v">{pedido.precio_objetivo != null ? money(pedido.precio_objetivo, lang) : "—"}</span></div>
          </div>

          <PriceBox lang={lang} pedido={pedido} bestCost={bc} onSaved={onChanged} />

          {pedido.notas && <p className="item__notes"><span className="note__tag">INT</span> {pedido.notas}</p>}
        </div>

        <div className="detail-col">
          <div className="offers offers--card">
            <div className="offers__head">
              <span className="offers__title">{tr(C.offers, lang)} · {pedido.ofertas.length}</span>
              <button type="button" className="linkbtn" onClick={() => setOfferFor("new")}>+ {tr(C.addOffer, lang)}</button>
            </div>
            {pedido.ofertas.length === 0 ? (
              <p className="offers__empty">{tr(C.noOffers, lang)}</p>
            ) : (
              <ul className="offer-list">
                {pedido.ofertas.map((o) => (
                  <li key={o.id} className={"offer" + (o.elegida ? " is-chosen" : "")}>
                    <div className="offer__main">
                      <span className="offer__name">
                        {o.elegida && <span className="offer__star" title={tr(C.chosen, lang)}>★</span>}
                        {text(o.proveedor)}
                        {o.pais && <span className="offer__country">{o.pais}</span>}
                      </span>
                      <span className="offer__avail"><EstadoPill estado={o.estado} lang={lang} />{o.disponibilidad ? " " + o.disponibilidad : ""}{o.plazo ? <span className="lead"> · ⏱ {o.plazo}</span> : null}</span>
                    </div>
                    <div className="offer__price"><span className="offer__eur">{moneyCur(o.precio, o.moneda, lang)}</span></div>
                    <div className="offer__actions">
                      <button type="button" className="chipbtn chipbtn--contact" onClick={() => setContact(o)} title={o.email ?? ""}>✉ {lang === "es" ? "Contactar" : "Contact"}</button>
                      {o.enlace && <a className="chipbtn" href={o.enlace.startsWith("http") ? o.enlace : "https://" + o.enlace} target="_blank" rel="noopener noreferrer">↗ {tr(C.visit, lang)}</a>}
                      {!o.elegida && <button type="button" className="chipbtn" onClick={async () => { await setElegida(pedido.id, o.id); onChanged(); }}>{tr(C.choose, lang)}</button>}
                      <button type="button" className="chipbtn" onClick={() => setOfferFor(o)}>{tr(C.edit, lang)}</button>
                      <button type="button" className="chipbtn chipbtn--danger" onClick={async () => { await deleteOferta(o.id); onChanged(); }}>{tr(C.del, lang)}</button>
                    </div>
                    {o.notas && <span className="offer__notes">{o.notas}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {contact && (
        <ContactDrawer lang={lang} part={{ mpn: pedido.mpn, descripcion: pedido.descripcion, unidades: pedido.unidades }}
          target={{ ofertaId: contact.id, estado: contact.estado, proveedor: contact.proveedor ?? "", email: contact.email, pais: contact.pais }}
          onClose={() => setContact(null)} onSent={() => { setContact(null); onChanged(); }} />
      )}
      {offerFor && (
        <OfferEditor lang={lang} pedidoId={pedido.id} oferta={offerFor === "new" ? null : offerFor}
          onClose={() => setOfferFor(null)} onSaved={() => { setOfferFor(null); onChanged(); }} />
      )}
    </>
  );
}

/* ---------------- Recomendador de precio ---------------- */

const pct = (v: number, lang: Lang) => new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + (lang === "es" ? " %" : "%");

function markupFor(orderCost: number): number {
  return orderCost < 1000 ? 0.35 : orderCost < 5000 ? 0.28 : orderCost < 20000 ? 0.22 : orderCost < 50000 ? 0.18 : 0.15;
}

function PriceBox({ lang, pedido, bestCost, onSaved }: { lang: Lang; pedido: Pedido; bestCost: { cost: number; name: string } | null; onSaved: () => void }) {
  const defaultQty = pedido.cantidad ?? firstNum(pedido.unidades) ?? 100;
  const [qty, setQty] = useState(String(defaultQty));
  const [costStr, setCostStr] = useState(bestCost ? String(bestCost.cost).replace(".", ",") : "");
  const [priceStr, setPriceStr] = useState(pedido.precio_cliente != null ? String(pedido.precio_cliente).replace(".", ",") : "");
  const [savedOk, setSavedOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const n = (s: string) => {
    const v = s.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const x = Number(v);
    return v === "" || !Number.isFinite(x) ? null : x;
  };
  const qtyN = n(qty) ?? 0;
  const cost = n(costStr);

  const reco = useMemo(() => {
    if (cost == null || cost <= 0 || qtyN <= 0) return null;
    const orderCost = cost * qtyN;
    const suggested = cost * (1 + markupFor(orderCost));
    const target = pedido.precio_objetivo ?? null;
    let price = suggested;
    let verdict: "great" | "tight" | "ok" | "loss" = "ok";
    if (target != null && target > 0) {
      if (target < cost) verdict = "loss";
      else if (target < suggested) { price = target; verdict = "tight"; }
      else { price = target; verdict = "great"; }
    }
    return { price: Math.round(price * 100) / 100, verdict };
  }, [cost, qtyN, pedido.precio_objetivo]);

  // Totales con el precio que escribe el usuario (o el recomendado)
  const price = n(priceStr) ?? reco?.price ?? null;
  const totals = cost != null && price != null && qtyN > 0 ? {
    venta: price * qtyN,
    coste: cost * qtyN,
    beneficio: (price - cost) * qtyN,
    margen: price > 0 ? ((price - cost) / price) * 100 : 0,
  } : null;

  // Veredicto según el precio que se va a dar de verdad
  const target = pedido.precio_objetivo ?? null;
  let verdict: "great" | "tight" | "ok" | "loss" | "above" = "ok";
  if (cost != null && price != null) {
    const m = price > 0 ? (price - cost) / price : -1;
    if (price < cost) verdict = "loss";
    else if (target != null && target > 0 && price > target * 1.005) verdict = "above";
    else if (m < 0.08) verdict = "tight";
    else if (m >= 0.15) verdict = "great";
    else verdict = "ok";
  }
  const verdictText = cost != null && price != null
    ? (verdict === "great" ? C.vGreat : verdict === "tight" ? C.vTight : verdict === "loss" ? C.vLoss : verdict === "above" ? C.vAbove : C.vOk)
    : null;
  const targetWarn = target != null && target > 0 && cost != null && target < cost;

  async function save() {
    const p = n(priceStr) ?? reco?.price ?? null;
    setBusy(true);
    await setPrecioCliente(pedido.id, p, qtyN || null);
    setBusy(false);
    setSavedOk(true);
    onSaved();
  }

  return (
    <div className="pricebox">
      <div className="pricebox__head">
        <span className="offers__title">{tr(C.calc, lang)}</span>
      </div>

      {!bestCost && cost == null ? (
        <p className="offers__empty">{tr(C.noCost, lang)}</p>
      ) : null}

      <div className="price-inputs">
        <label className="price-field">
          <span>{tr(C.qty, lang)}</span>
          <input className="input input--sm" inputMode="numeric" value={qty} onChange={(e) => { setQty(e.target.value); setSavedOk(false); }} />
        </label>
        <label className="price-field">
          <span>{tr(C.cost, lang)}</span>
          <input className="input input--sm" inputMode="decimal" value={costStr} onChange={(e) => { setCostStr(e.target.value); setSavedOk(false); }} placeholder="0,00" />
          {bestCost && <small className="fhint">{tr(C.costFrom(bestCost.name), lang)}</small>}
        </label>
      </div>

      {reco && (
        <button type="button" className="reco" onClick={() => { setPriceStr(String(reco.price).replace(".", ",")); setSavedOk(false); }}>
          <span className="reco__k">{tr(C.reco, lang)}</span>
          <span className="reco__v">{money(reco.price, lang)}<small>/{lang === "es" ? "ud." : "unit"}</small></span>
          <span className="reco__use">{tr(C.useReco, lang)} →</span>
        </button>
      )}

      <label className="price-field price-field--your">
        <span>{tr(C.yourQuote, lang)}</span>
        <input className="input input--sm" inputMode="decimal" value={priceStr} onChange={(e) => { setPriceStr(e.target.value); setSavedOk(false); }} placeholder={reco ? String(reco.price).replace(".", ",") : "0,00"} />
      </label>

      {totals && (
        <>
          <div className="totals">
            <div className="total"><span className="total__k">{tr(C.totalSale, lang)}</span><span className="total__v">{money(totals.venta, lang)}</span></div>
            <div className="total"><span className="total__k">{tr(C.totalCost, lang)}</span><span className="total__v">{money(totals.coste, lang)}</span></div>
            <div className="total total--profit"><span className="total__k">{tr(C.profit, lang)}</span><span className="total__v">{money(totals.beneficio, lang)}</span></div>
            <div className="total"><span className="total__k">{tr(C.marginPct, lang)}</span><span className={"total__v " + (totals.margen < 0 ? "is-neg" : "")}>{pct(totals.margen, lang)}</span></div>
          </div>
          {verdictText && <p className={"verdict verdict--" + verdict}>{tr(verdictText, lang)}</p>}
          {targetWarn && cost != null && <p className="verdict verdict--tight">{tr(C.targetBelow(money(cost, lang)), lang)}</p>}
          <div className="pricebox__foot">
            <button type="button" className={"btn btn--primary btn--sm" + (busy ? " btn--busy" : "")} onClick={save} aria-busy={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}{tr(savedOk ? C.saved : C.savePrice, lang)}
            </button>
          </div>
        </>
      )}

      <PriceTiers lang={lang} pedido={pedido} cost={cost} onSaved={onSaved} />

      <details className="factors">
        <summary>{tr(C.factorsT, lang)}</summary>
        <ul>{C.factors.map((f, i) => <li key={i}>{tr(f, lang)}</li>)}</ul>
      </details>
    </div>
  );
}

/* ---------------- Precios por cantidad ---------------- */

const T = {
  title: ["Precios por cantidad", "Price by quantity"] as Tr,
  hint: ["Una tarjeta por cantidad con lo que te cuesta a ti, lo que le das al cliente y el plazo. Pulsa Editar para cambiarla.", "One card per quantity with your cost, your price to the client and the lead time. Click Edit to change it."] as Tr,
  qty: ["Cantidad", "Quantity"] as Tr,
  cost: ["Te cuesta €/ud.", "Your cost €/unit"] as Tr,
  price: ["Tu precio €/ud.", "Your price €/unit"] as Tr,
  lead: ["Plazo de entrega", "Lead time"] as Tr,
  sale: ["Venta total", "Total sale"] as Tr,
  costT: ["Coste total", "Total cost"] as Tr,
  profit: ["Beneficio", "Profit"] as Tr,
  margin: ["Margen", "Margin"] as Tr,
  add: ["+ Añadir cantidad", "+ Add quantity"] as Tr,
  fromUnits: ["Usar las cantidades del pedido", "Use the order quantities"] as Tr,
  save: ["Guardar", "Save"] as Tr,
  saving: ["Guardando…", "Saving…"] as Tr,
  saved: ["Guardado", "Saved"] as Tr,
  edit: ["Editar", "Edit"] as Tr,
  done: ["Guardar", "Save"] as Tr,
  cancel: ["Cancelar", "Cancel"] as Tr,
  remove: ["Quitar", "Remove"] as Tr,
  removeQ: ["¿Quitar esta cantidad?", "Remove this quantity?"] as Tr,
  yes: ["Sí, quitar", "Yes, remove"] as Tr,
  draft: ["Estas cantidades vienen del pedido y aún no están guardadas.", "These quantities come from the order and are not saved yet."] as Tr,
  saveAll: ["Guardarlas", "Save them"] as Tr,
  saveErr: ["No se pudieron guardar los precios. Inténtalo de nuevo.", "Could not save the prices. Try again."] as Tr,
  suggested: ["recomendado", "recommended"] as Tr,
  useSugg: ["Usar recomendado", "Use recommended"] as Tr,
  noCost: ["Falta lo que te cuesta. Escríbelo para ver el beneficio y el margen.", "Your cost is missing. Add it to see profit and margin."] as Tr,
  noPrice: ["Falta tu precio para el cliente.", "Your price to the client is missing."] as Tr,
  addCost: ["Poner coste", "Add cost"] as Tr,
  addPrice: ["Poner precio", "Add price"] as Tr,
  noLead: ["Sin plazo", "No lead time"] as Tr,
  empty: ["Aún no hay cantidades. Añade una o usa las del pedido.", "No quantities yet. Add one or use the order quantities."] as Tr,
  units: ["uds.", "pcs"] as Tr,
};

type Row = { cantidad: string; coste: string; precio: string; plazo: string };

const toForm = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
function parseNum(s: string): number | null {
  const v = s.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const x = Number(v);
  return v === "" || !Number.isFinite(x) ? null : x;
}
/** Todas las cantidades que aparecen en "150 / 300 / 600 uds." */
function allNums(s: string | null | undefined): number[] {
  const clean = (s ?? "").replace(/(\d)[.,](?=\d{3}\b)/g, "$1");
  return [...new Set((clean.match(/\d+/g) ?? []).map(Number).filter((x) => x > 0))];
}
const recoFor = (qty: number, cost: number) => Math.round(cost * (1 + markupFor(cost * qty)) * 100) / 100;
const emptyRow = (q = ""): Row => ({ cantidad: q, coste: "", precio: "", plazo: "" });

export function PriceTiers({ lang, pedido, cost, onSaved }: { lang: Lang; pedido: Pedido; cost: number | null; onSaved: () => void }) {
  const defaultLead = (pedido.ofertas.find((o) => o.elegida && o.plazo) ?? pedido.ofertas.find((o) => o.plazo && o.estado !== "descartado"))?.plazo ?? "";
  const savedList = Array.isArray(pedido.escalas) ? pedido.escalas : [];
  const fromSaved = (list: Escala[]): Row[] => list.map((e) => ({ cantidad: String(e.cantidad), coste: toForm(e.coste), precio: toForm(e.precio), plazo: e.plazo ?? "" }));

  const [rows, setRows] = useState<Row[]>(() => (savedList.length ? fromSaved(savedList) : allNums(pedido.unidades).map((q) => emptyRow(String(q)))));
  const [draft, setDraft] = useState(!savedList.length && allNums(pedido.unidades).length > 0);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<Row>(emptyRow());
  const [askDel, setAskDel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [okFlash, setOkFlash] = useState(false);

  // Cálculo: coste vacío → el del proveedor; precio vacío → el recomendado (si hay coste)
  const calcRow = (r: Row) => {
    const q = parseNum(r.cantidad) ?? 0;
    const c = parseNum(r.coste) ?? cost;
    const suggested = c != null && c > 0 && q > 0 ? recoFor(q, c) : null;
    const own = parseNum(r.precio);
    const p = own ?? suggested;
    return {
      q, c, p, suggested, isSugg: own == null && suggested != null,
      plazo: r.plazo.trim() || defaultLead || "",
      venta: p != null && q > 0 ? p * q : null,
      coste: c != null && q > 0 ? c * q : null,
      beneficio: p != null && c != null && q > 0 ? (p - c) * q : null,
      margen: p != null && c != null && p > 0 ? ((p - c) / p) * 100 : null,
    };
  };

  async function persist(next: Row[]) {
    setBusy(true); setErr(false);
    const escalas: Escala[] = next
      .map((r) => ({ r, x: calcRow(r) }))
      .filter(({ x }) => x.q > 0)
      .map(({ r, x }) => ({ cantidad: x.q, coste: parseNum(r.coste), precio: parseNum(r.precio) ?? x.p ?? null, plazo: r.plazo.trim() || null }))
      .sort((a, b) => a.cantidad - b.cantidad);
    const res = await saveEscalas(pedido.id, escalas);
    setBusy(false);
    if (!res.ok) { setErr(true); return false; }
    setRows(fromSaved(escalas));
    setDraft(false);
    setOkFlash(true);
    setTimeout(() => setOkFlash(false), 1800);
    onSaved();
    return true;
  }

  const openEdit = (i: number) => { setEditing(i); setForm({ ...rows[i] }); setAskDel(null); setErr(false); };
  const addCard = () => {
    const last = rows.length ? parseNum(rows[rows.length - 1].cantidad) ?? 0 : 0;
    const next = [...rows, emptyRow(last ? String(last * 2) : "")];
    setRows(next);
    setEditing(next.length - 1);
    setForm(next[next.length - 1]);
  };
  async function saveCard() {
    if (editing == null) return;
    const next = rows.map((r, j) => (j === editing ? form : r));
    if (await persist(next)) setEditing(null);
  }
  function cancelCard() {
    if (editing == null) return;
    // Una tarjeta nueva sin cantidad se descarta
    if (!parseNum(rows[editing].cantidad) && !parseNum(form.cantidad)) setRows((r) => r.filter((_, j) => j !== editing));
    setEditing(null);
  }
  async function removeCard(i: number) {
    const next = rows.filter((_, j) => j !== i);
    setAskDel(null);
    if (editing === i) setEditing(null);
    await persist(next);
  }

  const order = rows.map((r, i) => ({ i, q: parseNum(r.cantidad) ?? Number.MAX_SAFE_INTEGER })).sort((a, b) => a.q - b.q).map((x) => x.i);
  const mClass = (m: number) => "mpill " + (m < 0 ? "mpill--bad" : m < 8 ? "mpill--warn" : m >= 15 ? "mpill--ok" : "mpill--info");
  const units = tr(T.units, lang);
  const trash = <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8.5h4.8l.6-8.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  const pencil = <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>;
  const fx = editing != null ? calcRow(form) : null;

  return (
    <div className="tiers">
      <div className="tiers__head">
        <span className="offers__title">{tr(T.title, lang)}</span>
        {busy ? <span className="tiers__ok">{tr(T.saving, lang)}</span> : okFlash ? <span className="tiers__ok">✓ {tr(T.saved, lang)}</span> : null}
      </div>
      <p className="tiers__hint">{tr(T.hint, lang)}</p>

      {draft && rows.length > 0 && (
        <div className="tiers__draft">
          <span>{tr(T.draft, lang)}</span>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => persist(rows)} disabled={busy}>{tr(T.saveAll, lang)}</button>
        </div>
      )}
      {err && <div className="note note--error" role="alert"><span className="note__tag">ERR</span><span className="note__text">{tr(T.saveErr, lang)}</span></div>}

      {rows.length === 0 ? (
        <p className="offers__empty">{tr(T.empty, lang)}</p>
      ) : (
        <div className="tsum">
          {order.map((i) => {
            const r = rows[i];
            if (editing === i && fx) {
              return (
                <div key={i} className="tsum__card is-editing">
                  <label className="tier__cell"><span className="tier__k">{tr(T.qty, lang)}</span>
                    <span className="tier__unit"><input className="input input--sm" inputMode="numeric" autoFocus value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} placeholder="1000" /><small>{units}</small></span>
                  </label>
                  <label className="tier__cell"><span className="tier__k">{tr(T.cost, lang)}</span>
                    <span className="tier__unit"><input className="input input--sm" inputMode="decimal" value={form.coste} onChange={(e) => setForm({ ...form, coste: e.target.value })} placeholder={cost != null ? toForm(cost) : "0,00"} /><small>€</small></span>
                  </label>
                  <label className="tier__cell"><span className="tier__k">{tr(T.price, lang)}</span>
                    <span className="tier__unit"><input className={"input input--sm" + (fx.p != null && fx.c != null && fx.p < fx.c ? " is-bad" : "")} inputMode="decimal" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} placeholder={fx.suggested != null ? toForm(fx.suggested) : "0,00"} /><small>€</small></span>
                    {fx.suggested != null && !form.precio.trim() && (
                      <button type="button" className="linkbtn tier__sugg" onClick={() => setForm({ ...form, precio: toForm(fx.suggested) })}>{tr(T.useSugg, lang)}: {money(fx.suggested, lang)}</button>
                    )}
                  </label>
                  <label className="tier__cell"><span className="tier__k">{tr(T.lead, lang)}</span>
                    <input className="input input--sm" value={form.plazo} onChange={(e) => setForm({ ...form, plazo: e.target.value })} placeholder={defaultLead || (lang === "es" ? "En stock, 3-5 días · 8 semanas" : "In stock, 3-5 days · 8 weeks")} />
                  </label>
                  <div className="tsum__live">
                    <span>{tr(T.sale, lang)} <b>{fx.venta != null ? money(fx.venta, lang) : "—"}</b></span>
                    <span>{tr(T.profit, lang)} <b className={(fx.beneficio ?? 0) < 0 ? "is-neg" : "tiers__profit"}>{fx.beneficio != null ? money(fx.beneficio, lang) : "—"}</b></span>
                    {fx.margen != null && <span className={mClass(fx.margen)}>{pct(fx.margen, lang)}</span>}
                  </div>
                  <div className="tsum__editfoot">
                    <button type="button" className="tcard__del" title={tr(T.remove, lang)} aria-label={tr(T.remove, lang)} onClick={() => removeCard(i)}>{trash}</button>
                    <span className="drawer__spacer" />
                    <button type="button" className="btn btn--ghost btn--sm" onClick={cancelCard}>{tr(T.cancel, lang)}</button>
                    <button type="button" className={"btn btn--primary btn--sm" + (busy ? " btn--busy" : "")} onClick={saveCard} disabled={busy || !parseNum(form.cantidad)}>
                      {busy && <span className="spinner" aria-hidden="true" />}{tr(T.done, lang)}
                    </button>
                  </div>
                </div>
              );
            }
            const x = calcRow(r);
            return (
              <div key={i} className="tsum__card">
                <div className="tsum__top">
                  <span className="tsum__qty">{x.q ? num(x.q, lang) : "—"} <small>{units}</small></span>
                  <span className="tsum__actions">
                    <button type="button" className="tcard__del tsum__edit" title={tr(T.edit, lang)} aria-label={tr(T.edit, lang)} onClick={() => openEdit(i)}>{pencil}</button>
                    {askDel === i ? (
                      <span className="tsum__confirm">
                        <button type="button" className="btn btn--danger btn--sm" onClick={() => removeCard(i)}>{tr(T.yes, lang)}</button>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAskDel(null)}>{tr(T.cancel, lang)}</button>
                      </span>
                    ) : (
                      <button type="button" className="tcard__del" title={tr(T.remove, lang)} aria-label={tr(T.remove, lang)} onClick={() => setAskDel(i)}>{trash}</button>
                    )}
                  </span>
                </div>
                <span className={"tsum__lead" + (x.plazo ? "" : " is-empty")}>⏱ {x.plazo || tr(T.noLead, lang)}</span>
                <button type="button" className="tsum__price" onClick={() => openEdit(i)}>
                  <span className="tsum__k">{tr(T.price, lang)}{x.isSugg ? " · " + tr(T.suggested, lang) : ""}</span>
                  <span className="tsum__v">{x.p != null ? money(x.p, lang) : <span className="tsum__missing">+ {tr(T.addPrice, lang)}</span>}</span>
                </button>
                <dl className="tsum__grid">
                  <dt>{tr(T.cost, lang)}</dt><dd>{x.c != null ? money(x.c, lang) : <button type="button" className="linkbtn" onClick={() => openEdit(i)}>+ {tr(T.addCost, lang)}</button>}</dd>
                  <dt>{tr(T.sale, lang)}</dt><dd>{x.venta != null ? money(x.venta, lang) : "—"}</dd>
                  <dt>{tr(T.costT, lang)}</dt><dd>{x.coste != null ? money(x.coste, lang) : "—"}</dd>
                  <dt>{tr(T.profit, lang)}</dt><dd className={x.beneficio == null ? "" : x.beneficio < 0 ? "is-neg" : "tiers__profit"}>{x.beneficio != null ? money(x.beneficio, lang) : "—"}</dd>
                  <dt>{tr(T.margin, lang)}</dt><dd>{x.margen != null ? <span className={mClass(x.margen)}>{pct(x.margen, lang)}</span> : "—"}</dd>
                </dl>
                {x.c == null ? <p className="tsum__note">{tr(T.noCost, lang)}</p> : x.p == null ? <p className="tsum__note">{tr(T.noPrice, lang)}</p> : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="tiers__actions">
        <button type="button" className="linkbtn" onClick={addCard} disabled={editing != null}>{tr(T.add, lang)}</button>
        {allNums(pedido.unidades).length > 0 && rows.length === 0 && (
          <button type="button" className="linkbtn" onClick={() => { setRows(allNums(pedido.unidades).map((q) => emptyRow(String(q)))); setDraft(true); }}>{tr(T.fromUnits, lang)}</button>
        )}
      </div>
    </div>
  );
}

/* ---------------- Fichas de edición ---------------- */

function moneyToNum(s: string): number | null {
  const v = s.trim();
  if (!v) return null;
  const x = Number(v.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(x) ? x : (NaN as unknown as number);
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
  const [cantidad, setCantidad] = useState(pedido?.cantidad != null ? String(pedido.cantidad) : "");
  const [objetivo, setObjetivo] = useState(numToForm(pedido?.precio_objetivo));
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
    if (!fixedCliente && newClient) { if (!cName.trim()) return setError("req"); }
    else if (!cid) return setError("req");
    if (!mpn.trim() && !desc.trim()) return setError("req");
    setError(null);
    setBusy(true);
    if (!fixedCliente && newClient) {
      const r = await clienteNuevo(cName, cEmail);
      if (!r.ok) { setBusy(false); return setError("save"); }
      cid = r.data.id;
    }
    const qn = cantidad.trim() ? Number(cantidad.replace(/\./g, "")) : null;
    const input: PedidoInput = {
      cliente_id: cid, mpn, descripcion: desc, unidades,
      cantidad: qn != null && Number.isFinite(qn) ? qn : null,
      precio_objetivo: objetivo.trim() ? moneyToNum(objetivo) : null,
      precio_cliente: pedido?.precio_cliente ?? null,
      estado, notas,
    };
    if (Number.isNaN(input.precio_objetivo)) { setBusy(false); return setError("req"); }
    const r = await savePedido(input, pedido?.id);
    setBusy(false);
    if (!r.ok) return setError("save");
    onSaved(cid);
  }

  return (
    <form onSubmit={submit} noValidate>
      <Drawer lang={lang} eyebrow={pedido ? C.edit : C.newItem} title={pedido ? text(pedido.mpn) : tr(C.newItem, lang)} onClose={onClose}
        foot={<div className="drawer__foot"><span className="drawer__spacer" /><button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tr(C.cancel, lang)}</button><button type="submit" className={"btn btn--primary btn--sm" + (busy ? " btn--busy" : "")} aria-busy={busy}>{busy && <span className="spinner" aria-hidden="true" />}{tr(busy ? C.saving : C.save, lang)}</button></div>}>
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
                  <select className="input input--sm" value={clienteId} onChange={(e) => { if (e.target.value === "__new") setNewClient(true); else setClienteId(e.target.value); setError(null); }}>
                    <option value="">—</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    <option value="__new">{tr(C.newClient, lang)}</option>
                  </select>
                )}
              </div>
            )}
            <div className="fcell"><label className="field__label">{tr(C.fFind, lang)}</label><input className="input input--sm is-mono" value={mpn} onChange={(e) => { setMpn(e.target.value); setError(null); }} placeholder="TS512MSK64V6N-I" /></div>
            <div className="fcell"><label className="field__label">{tr(C.fStatus, lang)}</label><select className="input input--sm" value={estado} onChange={(e) => setEstado(e.target.value)}>{PEDIDO_ESTADOS.map((s) => <option key={s.value} value={s.value}>{estadoOf(s.value, lang)}</option>)}</select></div>
            <div className="fcell fcell--wide"><label className="field__label">{tr(C.fDesc, lang)}</label><input className="input input--sm" value={desc} onChange={(e) => { setDesc(e.target.value); setError(null); }} placeholder="Memoria Transcend 4 GB SO-DIMM 1600" /></div>
            <div className="fcell"><label className="field__label">{tr(C.fUnits, lang)}</label><input className="input input--sm" value={unidades} onChange={(e) => setUnidades(e.target.value)} placeholder="150 y 200 uds." /><span className="fhint">{tr(C.fUnitsHint, lang)}</span></div>
            <div className="fcell"><label className="field__label">{tr(C.fQty, lang)}</label><input className="input input--sm" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="800" /></div>
            <div className="fcell"><label className="field__label">{tr(C.fTarget, lang)}</label><input className="input input--sm" inputMode="decimal" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="60,00" /></div>
            <div className="fcell fcell--wide"><label className="field__label">{tr(C.fNotes, lang)}</label><textarea className="input input--sm input--area" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
          </div>
          {error && <div className="note note--error" role="alert"><span className="note__tag">ERR</span><span className="note__text">{tr(error === "req" ? C.reqErr : C.saveErr, lang)}</span></div>}
        </div>
      </Drawer>
    </form>
  );
}
